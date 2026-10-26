const express = require("express");
const db = require("../db");
const { HttpError, sendError } = require("../services/errors");
const { isDate, positiveInteger } = require("../services/util");
const { withTransaction } = require("../services/tx");
const { logAudit } = require("../services/audit");
const discounts = require("../services/discountService");
const billing = require("../services/billingService");
const usageBilling = require("../services/usageBillingService");

const router = express.Router();
const allowedTypes = ["CPU", "RAM", "Storage", "GPU"];
const allowedClasses = ["Economy", "Business", "Critical"];

// Generate a simulated invoice using the current prices in pricing_rules.
router.post("/invoices", async (req, res) => {
  const { customer_id, billing_period_start, billing_period_end, resources } = req.body;
  const discountCode = discounts.normalizeCode(req.body.discount_code);
  const customerId = Number(customer_id);

  if (!Number.isInteger(customerId) || customerId < 1 ||
      !isDate(billing_period_start) || !isDate(billing_period_end) ||
      billing_period_end <= billing_period_start ||
      !Array.isArray(resources) || resources.length === 0) {
    return res.status(400).json({
      error: "Provide a positive customer_id, valid billing_period_start/end (YYYY-MM-DD), end after start, and a non-empty resources array."
    });
  }

  for (const item of resources) {
    const quantity = Number(item.quantity);
    if (!allowedTypes.includes(item.resource_type) ||
        !allowedClasses.includes(item.cloud_class) ||
        !Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({
        error: "Each resource needs resource_type (CPU, RAM, Storage, GPU), cloud_class (Economy, Business, Critical), and quantity greater than 0."
      });
    }
  }

  try {
    const invoice = await withTransaction(connection => billing.createInvoiceRecord(connection, {
      customerId,
      periodStart: billing_period_start,
      periodEnd: billing_period_end,
      discountCode,
      items: resources.map(item => ({ resource_type: item.resource_type, cloud_class: item.cloud_class, quantity: Number(item.quantity) }))
    }));
    return res.status(201).json({ message: "Simulated invoice generated", ...invoice });
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);
    console.error(error);
    return res.status(500).json({ error: error.message || "Could not generate invoice." });
  }
});

// Usage-based invoice: bills what the customer actually used in the period.
// Running VM time and existing resources are billed; stopped VMs are not.
// Add "dry_run": true to preview the invoice without saving anything.
router.post("/usage-invoices", async (req, res) => {
  const { customer_id, billing_period_start, billing_period_end } = req.body;
  const customerId = positiveInteger(customer_id);
  const discountCode = discounts.normalizeCode(req.body.discount_code);
  const dryRun = req.body.dry_run === true;
  if (!customerId || !isDate(billing_period_start) || !isDate(billing_period_end) || billing_period_end <= billing_period_start) {
    return res.status(400).json({
      error: "Provide a positive customer_id and valid billing_period_start/end (YYYY-MM-DD) with the end after the start."
    });
  }
  const input = { customerId, periodStart: billing_period_start, periodEnd: billing_period_end, discountCode };
  try {
    if (dryRun) return res.json(await usageBilling.previewUsageInvoice(db, input));
    const invoice = await withTransaction(async connection => {
      const created = await usageBilling.generateUsageInvoice(connection, input);
      await logAudit(connection, req.context, "USAGE_INVOICE_GENERATED", "invoice", created.invoice_id, {
        customer_id: customerId, period: [billing_period_start, billing_period_end], total: created.total, discount_code: created.discount_code
      });
      return created;
    });
    return res.status(201).json({ message: "Usage-based simulated invoice generated", ...invoice });
  } catch (error) {
    return sendError(res, error, "Could not generate usage invoice. Run sql/usage_refunds_audit.sql first.");
  }
});

// List invoices; optionally filter by customer_id.
router.get("/invoices", async (req, res) => {
  const customerId = req.query.customer_id === undefined ? null : Number(req.query.customer_id);
  if (customerId !== null && (!Number.isInteger(customerId) || customerId < 1)) {
    return res.status(400).json({ error: "customer_id must be a positive integer." });
  }
  try {
    res.json(await billing.listInvoices(db, customerId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load invoices. Run sql/02_create_billing_tables.sql first." });
  }
});

// Get one invoice and its saved line items.
router.get("/invoices/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Use a valid invoice ID." });
  }
  try {
    const invoice = await billing.getInvoice(db, id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    res.json(invoice);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load invoice details." });
  }
});

module.exports = router;
