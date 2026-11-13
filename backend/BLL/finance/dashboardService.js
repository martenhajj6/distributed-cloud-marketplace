const audit = require("../../DAL/finance/audit");
const { money } = require("../../utils/util");
const repository = require("../../DAL/finance/dashboard");

async function getDashboard() {
    const { invoices, payments, refunds, earnings, withdrawals, discounts, notifications, requests } = await repository.dashboardTotals();

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

module.exports = { getDashboard, listAudit: filters => audit.listAudit(filters) };
