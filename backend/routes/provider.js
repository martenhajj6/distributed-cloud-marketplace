
const express = require("express");
const { sendError, money } = require("../utils/util");
const finance = require("../services/financeService");

const router = express.Router();

const handle = (fn, message) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        sendError(res, error, message);
    }
};

// Provider earnings
router.get("/earnings", handle(async (req, res) => {
    const [summary, lines] = await Promise.all([
        finance.getEarningsForProvider(req.user.id),
        finance.listEarningLines(req.user.id)
    ]);

    res.json({ ...summary, lines });
}, "Could not load your earnings."));

// Provider withdrawals
router.get("/withdrawals", handle(async (req, res) => {
    res.json(await finance.listWithdrawals(req.user.id));
}, "Could not load your withdrawals."));

// Request withdrawal
router.post("/withdrawals", handle(async (req, res) => {
    const amount = money(req.body.amount);
    const note = req.body.note == null
        ? null : String(req.body.note).trim().slice(0, 255);

    if (!Number.isFinite(Number(req.body.amount)) || amount <= 0)
        return res.status(400).json({ error: "Provide a positive withdrawal amount." });

    res.status(201).json(await finance.createWithdrawal({
        providerId: req.user.id,
        amount,
        note
    }));
}, "Could not create withdrawal request."));

module.exports = router;
