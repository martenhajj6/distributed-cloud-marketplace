// Usage-based billing: turns running time into invoice lines.
//
// Rules
//  * Prices in pricing_rules are MONTHLY per unit (4 CPU x $3 = $12 per month), so usage is
//    converted to unit-months:  quantity x hours used / BILLING_HOURS_PER_MONTH (default 720 = 30 days).
//  * VMs: only the RUNNING intervals stored in vm_usage are billed (CPU, RAM and GPU).
//    A stopped VM has no open interval, so it costs nothing.
//  * Other resources (resource_usage_periods, e.g. storage volumes) are billed for as long as they exist.
//  * The billing period is [start 00:00, end 00:00). Usage that falls outside it is ignored, and open
//    intervals (no end yet) are counted up to the end of the period, or up to "now" if the period is not over.
const { HttpError } = require("./errors");
const { money } = require("./util");
const discounts = require("./discountService");
const { priceItems, createInvoiceRecord } = require("./billingService");

const HOURS_PER_MONTH = Number(process.env.BILLING_HOURS_PER_MONTH) || 720;
const round4 = value => Math.round((value + Number.EPSILON) * 10000) / 10000;

// Reads usage rows and returns billable invoice items (one per provider + resource type + class).
async function buildUsageItems(executor, customerId, periodStart, periodEnd) {
  const startDt = `${periodStart} 00:00:00`;
  const endDt = `${periodEnd} 00:00:00`;
  const [[capRow]] = await executor.execute(
    "SELECT DATE_FORMAT(LEAST(CAST(? AS DATETIME), NOW()), '%Y-%m-%d %H:%i:%s') AS cap",
    [endDt]
  );
  const cap = capRow.cap;

  // Seconds of overlap between [started, ended) and [period start, cap), computed by MySQL.
  const overlap = (startedCol, endedCol) =>
    `GREATEST(0, TIMESTAMPDIFF(SECOND,
        GREATEST(${startedCol}, CAST(? AS DATETIME)),
        LEAST(COALESCE(${endedCol}, CAST(? AS DATETIME)), CAST(? AS DATETIME))))`;

  const [vmRows] = await executor.execute(
    `SELECT provider_id, cloud_class, cpu_cores, ram_gb, gpu_units,
            ${overlap("started_at", "stopped_at")} AS seconds
     FROM vm_usage
     WHERE customer_id = ? AND started_at < CAST(? AS DATETIME)
       AND (stopped_at IS NULL OR stopped_at > CAST(? AS DATETIME))`,
    [startDt, cap, cap, customerId, cap, startDt]
  );
  const [resourceRows] = await executor.execute(
    `SELECT provider_id, resource_type, cloud_class, quantity,
            ${overlap("started_at", "ended_at")} AS seconds
     FROM resource_usage_periods
     WHERE customer_id = ? AND started_at < CAST(? AS DATETIME)
       AND (ended_at IS NULL OR ended_at > CAST(? AS DATETIME))`,
    [startDt, cap, cap, customerId, cap, startDt]
  );

  const buckets = new Map(); // "provider|type|class" -> { ..., unit_hours }
  const add = (providerId, resourceType, cloudClass, quantity, seconds) => {
    const unitHours = Number(quantity) * Number(seconds) / 3600;
    if (!(unitHours > 0)) return;
    const key = `${providerId}|${resourceType}|${cloudClass}`;
    const bucket = buckets.get(key) || { provider_id: providerId, resource_type: resourceType, cloud_class: cloudClass, unit_hours: 0 };
    bucket.unit_hours += unitHours;
    buckets.set(key, bucket);
  };
  for (const row of vmRows) {
    add(row.provider_id, "CPU", row.cloud_class, row.cpu_cores, row.seconds);
    add(row.provider_id, "RAM", row.cloud_class, row.ram_gb, row.seconds);
    add(row.provider_id, "GPU", row.cloud_class, row.gpu_units, row.seconds);
  }
  for (const row of resourceRows) {
    add(row.provider_id, row.resource_type, row.cloud_class, row.quantity, row.seconds);
  }

  const items = [];
  for (const bucket of buckets.values()) {
    const quantity = round4(bucket.unit_hours / HOURS_PER_MONTH); // unit-months
    if (quantity <= 0) continue;
    items.push({
      provider_id: bucket.provider_id,
      resource_type: bucket.resource_type,
      cloud_class: bucket.cloud_class,
      quantity,
      unit_hours: round4(bucket.unit_hours)
    });
  }
  items.sort((a, b) => a.provider_id - b.provider_id || a.resource_type.localeCompare(b.resource_type) || a.cloud_class.localeCompare(b.cloud_class));
  return { items, period_complete: cap === endDt, usage_counted_until: cap };
}

// Preview only: nothing is written and no discount use is consumed.
async function previewUsageInvoice(executor, { customerId, periodStart, periodEnd, discountCode }) {
  const built = await buildUsageItems(executor, customerId, periodStart, periodEnd);
  const priced = await priceItems(executor, built.items);
  const subtotal = priced.reduce((sum, item) => money(sum + item.line_total), 0);
  let discountAmount = 0;
  let discountInfo = null;
  if (discountCode) {
    const discount = await discounts.findByCode(executor, discountCode);
    const reason = discount ? discounts.unusableReason(discount) : "invalid";
    discountInfo = { code: discountCode, usable: reason === null, reason };
    if (reason === null) discountAmount = discounts.calculateDiscount(discount, subtotal);
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
    items: priced.map((item, index) => ({ ...item, unit_hours: built.items[index].unit_hours }))
  };
}

// Real invoice. Call inside withTransaction().
async function generateUsageInvoice(connection, { customerId, periodStart, periodEnd, discountCode }) {
  const built = await buildUsageItems(connection, customerId, periodStart, periodEnd);
  if (!built.period_complete) {
    throw new HttpError(409, {
      error: "The billing period has not ended yet. Use dry_run to preview usage so far, or wait until the period ends.",
      usage_counted_until: built.usage_counted_until
    });
  }
  if (built.items.length === 0) {
    throw new HttpError(409, { error: "No billable usage found for this customer and billing period (stopped VMs are not billed)." });
  }
  const invoice = await createInvoiceRecord(connection, {
    customerId, periodStart, periodEnd, discountCode,
    items: built.items.map(({ unit_hours, ...item }) => item)
  });
  const hoursByKey = new Map(built.items.map(item => [`${item.provider_id}|${item.resource_type}|${item.cloud_class}`, item.unit_hours]));
  invoice.items = invoice.items.map(item => ({ ...item, unit_hours: hoursByKey.get(`${item.provider_id}|${item.resource_type}|${item.cloud_class}`) }));
  return invoice;
}

module.exports = { buildUsageItems, previewUsageInvoice, generateUsageInvoice, HOURS_PER_MONTH };
