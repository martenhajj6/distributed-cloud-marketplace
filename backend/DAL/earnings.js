const COMMITTED = "('Requested', 'Approved', 'Paid')";

const { where } = require("./query");
// Data Access Layer: SQL statements for earningsService.
const { query } = require("./query");

const statement1 = (params = []) => query(`
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

    const rows = await query(`
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
    return rows;
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

module.exports = { balanceRows, listEarnings, statement1 };
