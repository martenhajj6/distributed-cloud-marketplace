const express = require("express");
const { handle } = require("../utils/helpers");
const earnings = require("../services/earningsService");
const withdrawal = require("../services/withdrawalService");

const router = express.Router();

// Provider earnings
router.get("/earnings", handle(async (req, res) => {
    const [summary, lines] = await Promise.all([
        earnings.getEarningsForProvider(req.user.id),
        earnings.listEarningLines(req.user.id)
    ]);

    res.json({ ...summary, lines });
}, "Could not load your earnings."));

// Provider withdrawals
router.get("/withdrawals", handle(async (req, res) => {
    res.json(await withdrawal.listWithdrawals(req.user.id));
}, "Could not load your withdrawals."));

// Request withdrawal (amount/note validation lives in the service)
router.post("/withdrawals", handle(async (req, res) => {
    res.status(201).json(await withdrawal.createWithdrawal({
        providerId: req.user.id,
        amount: req.body.amount,
        note: req.body.note
    }));
}, "Could not create withdrawal request."));

module.exports = router;
