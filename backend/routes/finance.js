const express = require("express");
const { HttpError, money, positiveInteger, logAudit } = require("../utils/util");
const { handle, bad, cleanText, optionalId, positiveAmount } = require("../utils/helpers");
const { withTransaction } = require("../utils/tx");
const payment = require("../services/paymentService");
const refund = require("../services/refundService");
const earnings = require("../services/earningsService");
const withdrawal = require("../services/withdrawalService");
const dashboard = require("../services/dashboardService");

const router = express.Router();

// Discount codes and notifications reuse the shared routers (no second implementation)
router.use("/discount-codes", require("./discount"));
router.use("/notifications", require("./notifications"));

// Payments
router.post("/payments", handle(async (req, res) => {
    const invoiceId = positiveInteger(req.body.invoice_id);
    const raw = req.body.provider_allocations;

    if (!invoiceId || (raw != null && (!Array.isArray(raw) || !raw.length)))
        throw bad("Invalid invoice ID or allocations.");

    const allocations = raw?.map(a => ({
        provider_id: positiveInteger(a.provider_id),
        gross_amount: positiveAmount(a.gross_amount)
    }));

    if (allocations?.some(a => !a.provider_id || !a.gross_amount))
        throw bad("Invalid provider ID or amount.");

    if (allocations && new Set(allocations.map(a => a.provider_id)).size !== allocations.length)
        throw bad("Duplicate provider ID.");

    res.status(201).json(await payment.createPayment({ invoiceId, allocations }));
}, "Could not simulate payment."));

router.get("/payments", handle(async (req, res) => {
    res.json(await payment.listPayments({ invoiceId: optionalId(req.query.invoice_id, "invoice_id") }));
}, "Could not load payments."));

// Refunds
router.post("/refunds", handle(async (req, res) => {
    const paymentId = positiveInteger(req.body.payment_id);
    const amount = positiveAmount(req.body.amount);

    if (!paymentId || !amount) throw bad("Invalid payment ID or refund amount.");

    const reason = cleanText(req.body.reason);

    const result = await withTransaction(async connection => {
        const created = await refund.applyRefund(connection, { paymentId, amount, reason });

        await logAudit(connection, req.user, "REFUND_RECORDED_BY_ADMIN", "refund", created.refund_id, {
            payment_id: paymentId, amount: created.amount, reason
        });

        return created;
    });

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
const NEXT_STATUS = { Requested: ["Approved", "Rejected"], Approved: ["Paid", "Rejected"] };

router.get("/withdrawals", handle(async (req, res) => {
    res.json(await withdrawal.listWithdrawals(optionalId(req.query.provider_id, "provider_id")));
}, "Could not load withdrawals."));

router.post("/withdrawals", handle(async (req, res) => {
    const providerId = positiveInteger(req.body.provider_id);
    if (!providerId) throw bad("Invalid provider ID.");

    res.status(201).json(await withdrawal.createWithdrawal({
        providerId, amount: req.body.amount, note: req.body.note
    }));
}, "Could not create withdrawal."));

router.patch("/withdrawals/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    const { status } = req.body;

    if (!id || !["Approved", "Rejected", "Paid"].includes(status))
        throw bad("Invalid withdrawal ID or status.");

    const result = await withTransaction(async connection => {
        const [rows] = await connection.execute(
            "SELECT id, provider_id, amount, status FROM withdrawal_requests WHERE id = ? FOR UPDATE", [id]
        );

        if (!rows.length) throw new HttpError(404, { error: "Withdrawal not found." });

        const old = rows[0].status;

        if (!NEXT_STATUS[old]?.includes(status))
            throw new HttpError(409, { error: `Cannot change ${old} to ${status}.` });

        await connection.execute("UPDATE withdrawal_requests SET status = ? WHERE id = ?", [status, id]);

        await logAudit(connection, req.user, `WITHDRAWAL_${status.toUpperCase()}`, "withdrawal", id, {
            provider_id: rows[0].provider_id,
            amount: money(rows[0].amount),
            previous_status: old
        });

        return {
            message: "Withdrawal status updated (simulated).",
            withdrawal_id: id,
            previous_status: old,
            status
        };
    });

    res.json(result);
}, "Could not update withdrawal."));

// Dashboard (the admin router also serves this with provider totals)
router.get("/dashboard", handle(async (req, res) => {
    res.json(await dashboard.getDashboard());
}, "Could not load dashboard."));

module.exports = router;
