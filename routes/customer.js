// Customer self-service routes: /api/customers/me/...
// Customer routes use the default demo customer context.
// A customer can only ever see or request things that belong to their own id.
const express = require("express");
const db = require("../db");
const { sendError } = require("../services/errors");
const { positiveInteger } = require("../services/util");
const billing = require("../services/billingService");
const finance = require("../services/financeService");

const router = express.Router();

router.get("/invoices", async (req, res) => {
  try {
    res.json(await billing.listInvoices(db, req.context.id));
  } catch (error) {
    return sendError(res, error, "Could not load your invoices.");
  }
});

// One of my invoices with its line items. Someone else's invoice answers 404, same as a missing one.
router.get("/invoices/:id", async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ error: "Use a valid invoice ID." });
  try {
    const invoice = await billing.getInvoice(db, id, req.context.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });
    // Customers do not need to see which provider id each line belongs to.
    invoice.items = invoice.items.map(({ provider_id, ...item }) => item);
    res.json(invoice);
  } catch (error) {
    return sendError(res, error, "Could not load your invoice.");
  }
});

router.get("/payments", async (req, res) => {
  try {
    res.json(await finance.listPayments({ customerId: req.context.id }));
  } catch (error) {
    return sendError(res, error, "Could not load your payments.");
  }
});

// Ask for a refund. An admin must approve it (PATCH /api/admin/refunds/:id).
// Body: { payment_id, reason, amount? }  - leave amount out to request everything still refundable.
router.post("/refunds", async (req, res) => {
  const paymentId = positiveInteger(req.body.payment_id);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  const hasAmount = req.body.amount !== undefined && req.body.amount !== null;
  const amount = hasAmount ? Number(req.body.amount) : undefined;
  if (!paymentId || reason.length < 3 || reason.length > 255 || (hasAmount && (!Number.isFinite(amount) || amount <= 0))) {
    return res.status(400).json({ error: "Provide a positive payment_id, a reason (3-255 characters) and, optionally, a positive amount." });
  }
  try {
    const request = await finance.createRefundRequest({ customerId: req.context.id, paymentId, amount, reason });
    res.status(201).json({ message: "Refund request submitted. An administrator will review it.", ...request });
  } catch (error) {
    return sendError(res, error, "Could not submit refund request. Run sql/usage_refunds_audit.sql first.");
  }
});

// My refund requests and their decisions.
router.get("/refunds", async (req, res) => {
  try {
    const rows = await finance.listRefundRequests({ customerId: req.context.id });
    res.json(rows.map(({ decided_by, ...row }) => row));
  } catch (error) {
    return sendError(res, error, "Could not load your refund requests.");
  }
});

module.exports = router;
