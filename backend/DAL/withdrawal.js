const { query, where } = require("./query");
// Data Access Layer: SQL statements for withdrawalService.

const statement1 = (connection, params = []) => connection.execute(`
            INSERT INTO withdrawal_requests (provider_id, amount, status, note)
            VALUES (?, ?, 'Requested', ?)
        `, params);

async function listWithdrawals(providerId) {
    const w = where({ provider_id: providerId });

    const rows = await query(`
        SELECT id, provider_id, amount, status, note, created_at, updated_at
        FROM withdrawal_requests ${w.sql}
        ORDER BY id DESC
    `, w.params);
    return rows;
}

const updateWithdrawalStatus = (connection, params = []) =>
    connection.execute("UPDATE withdrawal_requests SET status = ? WHERE id = ?", params);

const lockWithdrawalRequest = (connection, params = []) =>
    connection.execute(
        "SELECT id, provider_id, amount, status FROM withdrawal_requests WHERE id = ? FOR UPDATE",
        params
    );

module.exports = { listWithdrawals, statement1, updateWithdrawalStatus, lockWithdrawalRequest };
