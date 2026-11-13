const repository = require("../../DAL/withdrawal");
const { logAudit } = require("../../DAL/audit");
const { HttpError, money } = require("../../utils/util");
const { withTransaction } = require("../../DAL/dbconn");
const { bad, cleanText, positiveAmount, withCurrency } = require("../../utils/helpers");
const { providerBalance } = require("./earningsService");

async function listWithdrawals(providerId = null) {
    const rows = await repository.listWithdrawals(providerId);

    return rows.map(withCurrency);
}

async function createWithdrawal({ providerId, amount, note }) {
    const value = positiveAmount(amount);
    if (!value) throw bad("Provide a positive withdrawal amount.");

    return withTransaction(async connection => {
        const { available } = await providerBalance(connection, providerId, true);

        if (value > available)
            throw new HttpError(400, {
                error: `Requested $${value.toFixed(2)} exceeds your available balance of $${available.toFixed(2)}.`,
                available_balance: available
            });

        const [result] = await repository.statement1(connection, [providerId, value, cleanText(note)]);

        return {
            message: "Withdrawal request created (simulated).",
            withdrawal_id: result.insertId,
            provider_id: providerId,
            amount: value,
            currency: "USD",
            status: "Requested",
            available_balance_after_request: money(available - value)
        };
    });
}

const NEXT_STATUS = { Requested: ["Approved", "Rejected"], Approved: ["Paid", "Rejected"] };

async function updateWithdrawal(id, status, actor) {
    const result = await withTransaction(async connection => {
        const [rows] = await repository.lockWithdrawalRequest(connection, [id]);

        if (!rows.length) throw new HttpError(404, { error: "Withdrawal not found." });

        const old = rows[0].status;

        if (!NEXT_STATUS[old]?.includes(status))
            throw new HttpError(409, { error: `Cannot change ${old} to ${status}.` });

        await repository.updateWithdrawalStatus(connection, [status, id]);

        await logAudit(connection, actor, `WITHDRAWAL_${status.toUpperCase()}`, "withdrawal", id, {
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

    return result;
}

module.exports = { updateWithdrawal, listWithdrawals, createWithdrawal };
