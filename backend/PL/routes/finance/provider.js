const { handle } = require("../../middleware/access");
const express = require("express");
const { idempotencyKey } = require("../../../utils/helpers");

const earnings = require("../../../BLL/finance/providerFinanceService");

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
    res.json(await earnings.listWithdrawals(req.user.id));
}, "Could not load your withdrawals."));

// Request withdrawal (amount/note validation lives in the service)
router.post("/withdrawals", handle(async (req, res) => {
    res.status(201).json(await earnings.createWithdrawal({
        providerId: req.user.id,
        amount: req.body.amount,
        note: req.body.note,
        requestKey: idempotencyKey(req.get("Idempotency-Key"))
    }));
}, "Could not create withdrawal request."));

module.exports = router;
