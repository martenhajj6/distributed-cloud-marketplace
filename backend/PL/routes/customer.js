const { handle } = require("../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../utils/util");
const { bad, notFound, positiveAmount } = require("../../utils/helpers");
const billing = require("../../BLL/finance/invoiceService");
const payment = require("../../BLL/finance/paymentService");
const refund = require("../../BLL/finance/refundService");

const router = express.Router();

// Customer invoices
router.get("/invoices", handle(async (req, res) => {
    res.json(await billing.listInvoices(req.user.id));
}, "Could not load your invoices."));

router.get("/invoices/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid invoice ID.");

    const invoice = await billing.getInvoice(id, req.user.id);
    if (!invoice) throw notFound("Invoice not found.");

    invoice.items = invoice.items.map(({ provider_id, ...item }) => item);
    res.json(invoice);
}, "Could not load your invoice."));

// Customer payments
router.get("/payments", handle(async (req, res) => {
    res.json(await payment.listPayments({ customerId: req.user.id }));
}, "Could not load your payments."));

// Request refund
router.post("/refunds", handle(async (req, res) => {
    const paymentId = positiveInteger(req.body.payment_id);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const hasAmount = req.body.amount != null;
    const amount = hasAmount ? positiveAmount(req.body.amount) : undefined;

    if (!paymentId || reason.length < 3 || reason.length > 255 || (hasAmount && !amount))
        throw bad("Invalid payment ID, reason, or amount.");

    const request = await refund.createRefundRequest({
        customerId: req.user.id, paymentId, amount, reason
    });

    res.status(201).json({
        message: "Refund request submitted. An administrator will review it.",
        ...request
    });
}, "Could not submit refund request."));

// List refund requests
router.get("/refunds", handle(async (req, res) => {
    const rows = await refund.listRefundRequests({ customerId: req.user.id });
    res.json(rows.map(({ decided_by, ...row }) => row));
}, "Could not load your refund requests."));

// Notifications live in routes/notifications.js; kept here so existing mounts keep working
router.notificationsRouter = require("./notifications");

module.exports = router;
