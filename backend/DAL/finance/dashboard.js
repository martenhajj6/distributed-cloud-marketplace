const { query } = require("../query");
// Data Access Layer: SQL statements for finance.


// COALESCE(SUM(CASE WHEN cond THEN col ELSE 0 END), 0)
const sum = (col, cond = "1=1") =>
    `COALESCE(SUM(CASE WHEN ${cond} THEN ${col} ELSE 0 END), 0)`;

// Run a single-row query and convert every column to a number
const one = async sql => Object.fromEntries(
    Object.entries((await query(sql))[0]).map(([key, value]) => [key, Number(value)])
);

async function dashboardTotals() {
    const [invoices, payments, refunds, earnings, withdrawals, discounts, notifications, requests] =
        await Promise.all([
            one(`SELECT COUNT(*) AS count, ${sum("total")} AS total,
                 ${sum("total", "status = 'Paid'")} AS paid,
                 ${sum("total", "status = 'Unpaid'")} AS unpaid FROM invoices`),

            one(`SELECT COUNT(*) AS count, ${sum("amount")} AS total
                 FROM payments WHERE status IN ('Succeeded', 'Refunded')`),

            one(`SELECT COUNT(*) AS count, ${sum("amount")} AS total
                 FROM refunds WHERE status = 'Succeeded'`),

            one(`SELECT ${sum("gross_amount")} AS gross, ${sum("commission_amount")} AS commission,
                 ${sum("net_amount")} AS net FROM provider_earnings`),

            one(`SELECT COUNT(*) AS count,
                 ${sum("amount", "status IN ('Requested', 'Approved')")} AS pending,
                 ${sum("1", "status = 'Requested'")} AS review,
                 ${sum("amount", "status = 'Paid'")} AS paid FROM withdrawal_requests`),

            one(`SELECT COUNT(*) AS count, ${sum("used_count")} AS redemptions FROM discount_codes`),

            one(`SELECT COUNT(*) AS count,
                 ${sum("1", "read_at IS NULL")} AS unread
                 FROM Notifications
                 WHERE category IN ('billing', 'payout') AND channel = 'in_app'`),

            one(`SELECT ${sum("1", "status = 'Pending'")} AS count,
                 ${sum("amount", "status = 'Pending'")} AS total FROM refund_requests`)
        ]);

    return { invoices, payments, refunds, earnings, withdrawals, discounts, notifications, requests };
}

module.exports = { dashboardTotals };
