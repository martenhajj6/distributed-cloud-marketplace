// Provider earnings and simulated withdrawal SQL.
const { query, where } = require("../query");

const COMMITTED = "('Requested', 'Approved', 'Paid')";

// Earnings
const listEarningLines = (params = []) => query(`
    SELECT pe.id, pe.payment_id, p.payment_reference,
           pe.gross_amount, pe.commission_rate,
           pe.commission_amount, pe.net_amount, pe.created_at
    FROM provider_earnings pe
    JOIN payments p ON p.id = pe.payment_id
    WHERE pe.provider_id = ?
    ORDER BY pe.id DESC
`, params);

async function listEarnings(providerId) {
    const w = where({ "pe.provider_id": providerId });

    return query(`
        SELECT pe.provider_id,
               ROUND(SUM(pe.gross_amount), 2) AS gross_earnings,
               ROUND(SUM(pe.commission_amount), 2) AS platform_commission,
               ROUND(SUM(pe.net_amount), 2) AS net_earnings,
               ROUND(COALESCE(w.committed, 0), 2) AS committed_withdrawals,
               ROUND(SUM(pe.net_amount) - COALESCE(w.committed, 0), 2) AS available_balance
        FROM provider_earnings pe
        LEFT JOIN (
            SELECT provider_id, SUM(amount) AS committed
            FROM withdrawal_requests
            WHERE status IN ${COMMITTED}
            GROUP BY provider_id
        ) w ON w.provider_id = pe.provider_id
        ${w.sql}
        GROUP BY pe.provider_id, w.committed
        ORDER BY pe.provider_id
    `, w.params);
}

async function balanceRows(conn, providerId, lock) {
    const [earned] = await conn.execute(`
        SELECT net_amount
        FROM provider_earnings WHERE provider_id = ? ${lock ? "FOR UPDATE" : ""}
    `, [providerId]);

    const [withdrawn] = await conn.execute(`
        SELECT amount
        FROM withdrawal_requests WHERE provider_id = ? AND status IN ${COMMITTED} FOR UPDATE
    `, [providerId]);

    return { earned, withdrawn };
}

// Withdrawals
const insertWithdrawal = (connection, params = []) => connection.execute(`
    INSERT INTO withdrawal_requests (provider_id, amount, status, note)
    VALUES (?, ?, 'Requested', ?)
`, params);

async function listWithdrawals(providerId) {
    const w = where({ provider_id: providerId });
    return query(`
        SELECT id, provider_id, amount, status, note, created_at, updated_at
        FROM withdrawal_requests ${w.sql}
        ORDER BY id DESC
    `, w.params);
}

const updateWithdrawalStatus = (connection, params = []) =>
    connection.execute("UPDATE withdrawal_requests SET status = ? WHERE id = ?", params);

const lockWithdrawalRequest = (connection, params = []) =>
    connection.execute(
        "SELECT id, provider_id, amount, status FROM withdrawal_requests WHERE id = ? FOR UPDATE",
        params
    );

module.exports = {
    listEarningLines,
    listEarnings,
    balanceRows,
    insertWithdrawal,
    listWithdrawals,
    updateWithdrawalStatus,
    lockWithdrawalRequest
};
