const db = require("../../DAL/dbconn");
const { withTransaction } = db;
const repository = require("../../DAL/usageBilling");

const { logAudit } = require("../../DAL/audit");
const { HttpError, money } = require("../../utils/util");
const discounts = require("./discountService");
const { priceItems, createInvoiceRecord } = require("./invoiceService");

const HOURS_PER_MONTH = Number(process.env.BILLING_HOURS_PER_MONTH ?? 720);
const round4 = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

// Calculate billable resource usage
async function buildUsageItems(db, customerId, periodStart, periodEnd) {
    if (!Number.isFinite(HOURS_PER_MONTH) || HOURS_PER_MONTH <= 0)
        throw new HttpError(500, { error: "Invalid billing hours per month." });

    const start = `${periodStart} 00:00:00`;
    const end = `${periodEnd} 00:00:00`;

    const [[row]] = await repository.statement1(db, [end]);

    const cap = row.cap;
    const unmetered = await repository.unmeteredRunningVms(db, customerId, start, cap);
    if (unmetered.length) throw new HttpError(409, {
        error: "Running VM has no usage records for this billing period. Resource lifecycle metering must be fixed before invoicing.",
        vm_ids: unmetered
    });
    const { vms, resources } = await repository.loadUsage(db, customerId, start, cap);

    const buckets = new Map();
    const timestamp = value => new Date(value.replace(" ", "T") + "Z").getTime();
    const seconds = (from, to) => Math.max(0,
        (Math.min(timestamp(to || cap), timestamp(cap)) -
         Math.max(timestamp(from), timestamp(start))) / 1000);

    function add(providerId, type, cloudClass, quantity, seconds) {
        const hours = Number(quantity) * Number(seconds) / 3600;
        if (hours <= 0) return;

        const key = `${providerId}|${type}|${cloudClass}`;
        const item = buckets.get(key) || {
            provider_id: providerId,
            resource_type: type,
            cloud_class: cloudClass,
            unit_hours: 0
        };

        item.unit_hours += hours;
        buckets.set(key, item);
    }

    for (const vm of vms) {
        for (const [type, quantity] of [
            ["CPU", vm.cpu_cores],
            ["RAM", vm.ram_gb],
            ["GPU", vm.gpu_units]
        ]) {
            add(vm.provider_id, type, vm.cloud_class, quantity, seconds(vm.started_at, vm.stopped_at));
        }
    }

    for (const r of resources)
        add(r.provider_id, r.resource_type, r.cloud_class, r.quantity, seconds(r.started_at, r.ended_at));

    if ([...buckets.values()].some(item => !Number.isSafeInteger(Number(item.provider_id)) || Number(item.provider_id) <= 0))
        throw new HttpError(409, { error: "Usage records are missing provider assignment. Fix resource ownership before billing." });

    const items = [...buckets.values()]
        .map(item => ({
            ...item,
            quantity: round4(item.unit_hours / HOURS_PER_MONTH),
            unit_hours: round4(item.unit_hours)
        }))
        .filter(item => item.quantity > 0)
        .sort((a, b) => a.provider_id - b.provider_id ||
            a.resource_type.localeCompare(b.resource_type) ||
            a.cloud_class.localeCompare(b.cloud_class));

    return {
        items,
        period_complete: cap === end,
        usage_counted_until: cap
    };
}

// Preview invoice without saving
async function previewUsageInvoice(db, { customerId, periodStart, periodEnd, discountCode }) {
    const built = await buildUsageItems(db, customerId, periodStart, periodEnd);
    const priced = built.items.length ? await priceItems(db, built.items) : [];
    const subtotal = priced.reduce((sum, item) => money(sum + item.line_total), 0);

    let discountAmount = 0;
    let discountInfo = null;

    if (discountCode) {
        const { discount, reason } = await discounts.checkDiscount(db, discountCode);

        discountInfo = { code: discountCode, usable: reason === null, reason };

        if (!reason) discountAmount = discounts.calculateDiscount(discount, subtotal);
    }

    return {
        dry_run: true,
        customer_id: customerId,
        billing_period: { start: periodStart, end: periodEnd },
        period_complete: built.period_complete,
        usage_counted_until: built.usage_counted_until,
        subtotal,
        discount: discountInfo,
        discount_amount: discountAmount,
        total: Math.max(0, money(subtotal - discountAmount)),
        currency: "USD",
        items: priced
    };
}

// Generate invoice
async function generateUsageInvoice(db, { customerId, periodStart, periodEnd, discountCode }) {
    const built = await buildUsageItems(db, customerId, periodStart, periodEnd);

    if (!built.period_complete)
        throw new HttpError(409, {
            error: "Billing period has not ended. Use dry_run to preview.",
            usage_counted_until: built.usage_counted_until
        });

    if (!built.items.length)
        throw new HttpError(409, {
            error: "No billable usage found for this period."
        });

    return createInvoiceRecord(db, {
        customerId,
        periodStart,
        periodEnd,
        discountCode,
        items: built.items
    });
}

module.exports = {
    buildUsageItems,
    previewUsageInvoice: input => previewUsageInvoice(db, input),
    generateUsageInvoice: (input, actor) => withTransaction(async connection => {
        const created = await generateUsageInvoice(connection, input);
        await logAudit(connection, actor, "USAGE_INVOICE_GENERATED", "invoice", created.invoice_id, {
            customer_id: input.customerId, period: [input.periodStart, input.periodEnd],
            total: created.total, discount_code: created.discount_code
        });
        return created;
    }),
    HOURS_PER_MONTH
};
