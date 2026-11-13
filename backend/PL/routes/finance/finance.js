const { handle } = require("../../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../../utils/util");
const { bad, cleanText, optionalId, positiveAmount } = require("../../../utils/helpers");
const payment = require("../../../BLL/finance/paymentService");
const refund = require("../../../BLL/finance/refundService");
const earnings = require("../../../BLL/finance/providerFinanceService");
const dashboard = require("../../../BLL/finance/dashboardService");

const router = express.Router();

// Discount codes and notifications reuse the shared routers (no second implementation)
router.use("/discount-codes", require("./discount"));
router.use("/notifications", require("./notifications"));

// Payments (customer-initiated only)
router.get("/payments", handle(async (req, res) => {
    res.json(await payment.listPayments({ invoiceId: optionalId(req.query.invoice_id, "invoice_id") }));
}, "Could not load payments."));

// Refunds
router.post("/refunds", handle(async (req, res) => {
    const paymentId = positiveInteger(req.body.payment_id);
    const amount = positiveAmount(req.body.amount);

    if (!paymentId) throw bad("Payment ID must be a positive integer.");
    if (!amount) throw bad("Refund amount must be a positive amount.");

    const reason = cleanText(req.body.reason);

    const result = await refund.recordRefund({ paymentId, amount, reason }, req.user);

    res.status(201).json({
        message: "Simulated refund recorded; no real money was transferred.",
        ...result
    });
}, "Could not record refund."));

router.get("/refunds", handle(async (req, res) => {
    res.json(await refund.listRefunds({ paymentId: optionalId(req.query.payment_id, "payment_id") }));
}, "Could not load refunds."));

// Earnings
router.get("/earnings", handle(async (req, res) => {
    res.json(await earnings.getEarnings(optionalId(req.query.provider_id, "provider_id")));
}, "Could not load earnings."));

// Withdrawals

router.get("/withdrawals", handle(async (req, res) => {
    res.json(await earnings.listWithdrawals(optionalId(req.query.provider_id, "provider_id")));
}, "Could not load withdrawals."));

router.patch("/withdrawals/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    const { status } = req.body;

    if (!id || !["Approved", "Rejected", "Paid"].includes(status))
        throw bad("Invalid withdrawal ID or status.");

    const result = await earnings.updateWithdrawal(id, status, req.user);

    res.json(result);
}, "Could not update withdrawal."));

// Dashboard (the admin router also serves this with provider totals)
router.get("/dashboard", handle(async (req, res) => {
    res.json(await dashboard.getDashboard());
}, "Could not load dashboard."));

module.exports = router;
