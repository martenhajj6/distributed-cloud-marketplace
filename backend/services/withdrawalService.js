const { HttpError, money } = require("../utils/util");
const { withTransaction } = require("../utils/tx");
const { query, where, bad, cleanText, positiveAmount, withCurrency } = require("../utils/helpers");
const { providerBalance } = require("./earningsService");

async function listWithdrawals(providerId = null) {
    const w = where({ provider_id: providerId });

    const rows = await query(`
        SELECT id, provider_id, amount, status, note, created_at, updated_at
        FROM withdrawal_requests ${w.sql}
        ORDER BY id DESC
    `, w.params);

    return rows.map(withCurrency);
}

async function createWithdrawal({ providerId, amount, note }) {
    const value = positiveAmount(amount);
    if (!value) throw bad("Provide a positive withdrawal amount.");

    return withTransaction(async connection => {
        const { available } = await providerBalance(connection, providerId, true);

        if (value > available)
            throw new HttpError(400, {
                error: "Withdrawal exceeds the available provider balance.",
                available_balance: available
            });

        const [result] = await connection.execute(`
            INSERT INTO withdrawal_requests (provider_id, amount, status, note)
            VALUES (?, ?, 'Requested', ?)
        `, [providerId, value, cleanText(note)]);

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

module.exports = { listWithdrawals, createWithdrawal };
