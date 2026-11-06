const { money } = require("../utils/util");
const { query, where, withCurrency } = require("../utils/helpers");

const COMMITTED = "('Requested', 'Approved', 'Paid')";

async function getEarnings(providerId = null) {
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

    return rows.map(withCurrency);
}

async function getEarningsForProvider(providerId) {
    return (await getEarnings(providerId))[0] || withCurrency({
        provider_id: providerId,
        gross_earnings: 0,
        platform_commission: 0,
        net_earnings: 0,
        committed_withdrawals: 0,
        available_balance: 0
    });
}

const listEarningLines = providerId => query(`
    SELECT pe.id, pe.payment_id, p.payment_reference,
           pe.gross_amount, pe.commission_rate,
           pe.commission_amount, pe.net_amount, pe.created_at
    FROM provider_earnings pe
    JOIN payments p ON p.id = pe.payment_id
    WHERE pe.provider_id = ?
    ORDER BY pe.id DESC
`, [providerId]);

// Net earnings, committed withdrawals and what is still available (lock = FOR UPDATE)
async function providerBalance(conn, providerId, lock = false) {
    const [[earned]] = await conn.execute(`
        SELECT COALESCE(SUM(net_amount), 0) AS total
        FROM provider_earnings WHERE provider_id = ? ${lock ? "FOR UPDATE" : ""}
    `, [providerId]);

    const [[withdrawn]] = await conn.execute(`
        SELECT COALESCE(SUM(amount), 0) AS committed
        FROM withdrawal_requests WHERE provider_id = ? AND status IN ${COMMITTED}
    `, [providerId]);

    const total = money(earned.total);
    const committed = money(withdrawn.committed);

    return { total, committed, available: money(total - committed) };
}

module.exports = { getEarnings, getEarningsForProvider, listEarningLines, providerBalance };
