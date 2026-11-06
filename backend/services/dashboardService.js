const { money } = require("../utils/util");
const { query } = require("../utils/helpers");

// COALESCE(SUM(CASE WHEN cond THEN col ELSE 0 END), 0)
const sum = (col, cond = "1=1") =>
    `COALESCE(SUM(CASE WHEN ${cond} THEN ${col} ELSE 0 END), 0)`;

// Run a single-row query and convert every column to a number
const one = async sql => Object.fromEntries(
    Object.entries((await query(sql))[0]).map(([key, value]) => [key, money(value)])
);

async function getDashboard() {
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

            one(`SELECT COUNT(*) AS count, ${sum("1", "is_read = 0")} AS unread FROM payment_notifications`),

            one(`SELECT ${sum("1", "status = 'Pending'")} AS count,
                 ${sum("amount", "status = 'Pending'")} AS total FROM refund_requests`)
        ]);

    return {
        currency: "USD",
        invoices: {
            count: invoices.count,
            invoiced_total: invoices.total,
            paid_total: invoices.paid,
            unpaid_total: invoices.unpaid
        },
        payments: { count: payments.count, recorded_total: payments.total },
        refunds: { count: refunds.count, total: refunds.total },
        revenue: {
            customer_payments: payments.total,
            refunded: refunds.total,
            net_revenue: money(payments.total - refunds.total),
            platform_commission: earnings.commission
        },
        earnings: {
            provider_gross: earnings.gross,
            platform_commission: earnings.commission,
            provider_net: earnings.net
        },
        withdrawals: {
            request_count: withdrawals.count,
            awaiting_review_count: withdrawals.review,
            pending_total: withdrawals.pending,
            paid_total: withdrawals.paid
        },
        refund_requests: { pending_count: requests.count, pending_total: requests.total },
        discounts: { code_count: discounts.count, redemption_count: discounts.redemptions },
        notifications: { count: notifications.count, unread_count: notifications.unread }
    };
}

module.exports = { getDashboard };
