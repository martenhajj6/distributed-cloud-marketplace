
const { HttpError, money } = require("../utils/util");
const discounts = require("./discountService");
const { priceItems, createInvoiceRecord } = require("./invoiceService");

const HOURS_PER_MONTH = Number(process.env.BILLING_HOURS_PER_MONTH) || 720;
const round4 = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

// Calculate billable resource usage
async function buildUsageItems(db, customerId, periodStart, periodEnd) {
    const start = `${periodStart} 00:00:00`;
    const end = `${periodEnd} 00:00:00`;

    const [[row]] = await db.execute(
        "SELECT DATE_FORMAT(LEAST(CAST(? AS DATETIME), NOW()), '%Y-%m-%d %H:%i:%s') AS cap",
        [end]
    );

    const cap = row.cap;
    const overlap = (from, to) => `GREATEST(0, TIMESTAMPDIFF(SECOND,
        GREATEST(${from}, CAST(? AS DATETIME)),
        LEAST(COALESCE(${to}, CAST(? AS DATETIME)), CAST(? AS DATETIME))))`;

    const params = [start, cap, cap, customerId, cap, start];

    const [vms] = await db.execute(`
        SELECT provider_id, cloud_class, cpu_cores, ram_gb, gpu_units,
               ${overlap("started_at", "stopped_at")} AS seconds
        FROM vm_usage
        WHERE customer_id = ? AND started_at < CAST(? AS DATETIME)
          AND (stopped_at IS NULL OR stopped_at > CAST(? AS DATETIME))
    `, params);

    const [resources] = await db.execute(`
        SELECT provider_id, resource_type, cloud_class, quantity,
               ${overlap("started_at", "ended_at")} AS seconds
        FROM resource_usage_periods
        WHERE customer_id = ? AND started_at < CAST(? AS DATETIME)
          AND (ended_at IS NULL OR ended_at > CAST(? AS DATETIME))
    `, params);

    const buckets = new Map();

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
            add(vm.provider_id, type, vm.cloud_class, quantity, vm.seconds);
        }
    }

    for (const r of resources)
        add(r.provider_id, r.resource_type, r.cloud_class, r.quantity, r.seconds);

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
    const priced = await priceItems(db, built.items);
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
    previewUsageInvoice,
    generateUsageInvoice,
    HOURS_PER_MONTH
};
