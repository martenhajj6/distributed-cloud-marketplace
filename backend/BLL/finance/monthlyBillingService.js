// Monthly billing runs for the last completed calendar month (UTC).
// Safe to re-run: invoice and billing period uniqueness protect against duplicates.
const repo = require("../../DAL/usageBilling");
const db = require("../../DAL/dbconn");
const usage = require("./usageBillingService");

function lastClosedMonth(reference = new Date()) {
    const end = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1));
    return { periodStart: start.toISOString().slice(0, 10), periodEnd: end.toISOString().slice(0, 10) };
}

async function runMonthlyBilling({ dryRun = false, referenceDate = new Date() } = {}) {
    const { periodStart, periodEnd } = lastClosedMonth(referenceDate);
    const start = `${periodStart} 00:00:00`;
    const end = `${periodEnd} 00:00:00`;
    const customers = await repo.customersWithUsage(db, start, end);
    const results = [];
    for (const customerId of customers) {
        try {
            const input = { customerId, periodStart, periodEnd };
            if (dryRun) {
                const preview = await usage.previewUsageInvoice(input);
                results.push({ customer_id: customerId, status: "preview", total: preview.total, items: preview.items.length });
            } else {
                // Missing/inconsistent providers, pricing, or usage cannot produce a payable invoice.
                const invoice = await usage.generateUsageInvoice(input, null);
                results.push({ customer_id: customerId, status: "created", invoice_id: invoice.invoice_id, total: invoice.total });
            }
        } catch (error) {
            const message = error.body?.error || error.message || "Billing failed";
            const duplicate = error.status === 409 && /already exists|already.*billing period|billing period already/i.test(message);
            results.push({ customer_id: customerId, status: duplicate ? "existing" : "error", error: message });
        }
    }
    return { period_start: periodStart, period_end: periodEnd, dry_run: dryRun, customers: results.length, results };
}
module.exports = { lastClosedMonth, runMonthlyBilling };
