// Provider self-service routes: /api/providers/me/...
// Mounted behind authenticate + requireRole("Provider"); req.user.id is the provider.
const express = require("express");
const { sendError, money } = require("../utils/util");
const finance = require("../services/financeService");
const router = express.Router();
// Totals (gross, commission, net, available balance) plus the individual earning lines.
router.get("/earnings", async (req, res) => {
    try {
        const [summary, lines] = await Promise.all([
            finance.getEarningsForProvider(req.user.id),
            finance.listEarningLines(req.user.id)
        ]);
        res.json({ ...summary, lines });
    }
    catch (error) {
        return sendError(res, error, "Could not load your earnings.");
    }
});
router.get("/withdrawals", async (req, res) => {
    try {
        res.json(await finance.listWithdrawals(req.user.id));
    }
    catch (error) {
        return sendError(res, error, "Could not load your withdrawals.");
    }
});
// Body: { amount, note? }. The provider id always comes from the login, never from the body.
router.post("/withdrawals", async (req, res) => {
    const amount = money(req.body.amount);
    const note = req.body.note === undefined || req.body.note === null ? null : String(req.body.note).trim().slice(0, 255);
    if (!Number.isFinite(Number(req.body.amount)) || amount <= 0) {
        return res.status(400).json({ error: "Provide a positive withdrawal amount." });
    }
    try {
        res.status(201).json(await finance.createWithdrawal({ providerId: req.user.id, amount, note }));
    }
    catch (error) {
        return sendError(res, error, "Could not create withdrawal request.");
    }
});
module.exports = router;
