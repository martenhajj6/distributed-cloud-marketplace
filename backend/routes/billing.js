
const express = require("express");
const db = require("../dbconn");
const { sendError, isDate, positiveInteger, logAudit } = require("../utils/util");
const { withTransaction } = require("../utils/tx");
const discounts = require("../services/discountService");
const billing = require("../services/billingService");
const usageBilling = require("../services/usageBillingService");

const router = express.Router();
const types = ["CPU", "RAM", "Storage", "GPU"];
const classes = ["Economy", "Business", "Critical"];

function validPeriod(start, end) {
    return isDate(start) && isDate(end) && end > start;
}

const handle = (fn, message) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        sendError(res, error, message);
    }
};

// Create simulated invoice
router.post("/invoices", handle(async (req, res) => {
    const { customer_id, billing_period_start: start, billing_period_end: end, resources } = req.body;
    const customerId = positiveInteger(customer_id);

    if (!customerId || !validPeriod(start, end) || !Array.isArray(resources) || !resources.length)
        return res.status(400).json({ error: "Invalid customer, period, or resources." });

    const items = resources.map(item => ({
        resource_type: item.resource_type,
        cloud_class: item.cloud_class,
        quantity: Number(item.quantity)
    }));

    if (items.some(item => !types.includes(item.resource_type) ||
        !classes.includes(item.cloud_class) ||
        !Number.isFinite(item.quantity) || item.quantity <= 0))
        return res.status(400).json({ error: "Invalid resource type, class, or quantity." });

    const invoice = await withTransaction(connection =>
        billing.createInvoiceRecord(connection, {
            customerId,
            periodStart: start,
            periodEnd: end,
            discountCode: discounts.normalizeCode(req.body.discount_code),
            items
        })
    );

    res.status(201).json({ message: "Simulated invoice generated", ...invoice });
}, "Could not generate invoice."));

// Create usage-based invoice or preview
router.post("/usage-invoices", handle(async (req, res) => {
    const { customer_id, billing_period_start: start, billing_period_end: end, dry_run } = req.body;
    const customerId = positiveInteger(customer_id);

    if (!customerId || !validPeriod(start, end))
        return res.status(400).json({ error: "Invalid customer or billing period." });

    const input = {
        customerId,
        periodStart: start,
        periodEnd: end,
        discountCode: discounts.normalizeCode(req.body.discount_code)
    };

    if (dry_run === true)
        return res.json(await usageBilling.previewUsageInvoice(db, input));

    const invoice = await withTransaction(async connection => {
        const created = await usageBilling.generateUsageInvoice(connection, input);

        await logAudit(connection, req.user, "USAGE_INVOICE_GENERATED", "invoice", created.invoice_id, {
            customer_id: customerId,
            period: [start, end],
            total: created.total,
            discount_code: created.discount_code
        });

        return created;
    });

    res.status(201).json({ message: "Usage-based simulated invoice generated", ...invoice });
}, "Could not generate usage invoice."));

// List invoices
router.get("/invoices", handle(async (req, res) => {
    const customerId = req.query.customer_id === undefined
        ? null : positiveInteger(req.query.customer_id);

    if (req.query.customer_id !== undefined && !customerId)
        return res.status(400).json({ error: "Invalid customer ID." });

    res.json(await billing.listInvoices(db, customerId));
}, "Could not load invoices."));

// Get invoice details
router.get("/invoices/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);

    if (!id)
        return res.status(400).json({ error: "Invalid invoice ID." });

    const invoice = await billing.getInvoice(db, id);

    if (!invoice)
        return res.status(404).json({ error: "Invoice not found." });

    res.json(invoice);
}, "Could not load invoice details."));

module.exports = router;
