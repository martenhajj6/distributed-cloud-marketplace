const crypto = require("crypto");
const { HttpError } = require("./errors");
const { money } = require("./util");
const discounts = require("./discountService");

// Look up the current unit price for each item. items: [{ resource_type, cloud_class, quantity, provider_id? }]
async function priceItems(executor, items) {
  const priced = [];
  for (const item of items) {
    const quantity = Number(item.quantity);
    const [priceRows] = await executor.execute(
      "SELECT unit_price FROM pricing_rules WHERE resource_type = ? AND cloud_class = ?",
      [item.resource_type, item.cloud_class]
    );
    if (priceRows.length === 0) {
      throw new HttpError(409, { error: `No pricing rule found for ${item.resource_type} / ${item.cloud_class}.` });
    }
    const unitPrice = Number(priceRows[0].unit_price);
    priced.push({
      ...(item.provider_id ? { provider_id: item.provider_id } : {}),
      resource_type: item.resource_type,
      cloud_class: item.cloud_class,
      quantity,
      unit_price: unitPrice,
      line_total: money(unitPrice * quantity)
    });
  }
  return priced;
}

// Creates billing period + invoice + invoice items (+ discount). Must run inside a transaction.
// Used by BOTH the manual invoice route and the usage-based invoice route.
async function createInvoiceRecord(connection, { customerId, periodStart, periodEnd, items, discountCode }) {
  const [periodRows] = await connection.execute(
    `SELECT id FROM billing_periods
     WHERE customer_id = ? AND period_start = ? AND period_end = ? FOR UPDATE`,
    [customerId, periodStart, periodEnd]
  );

  let periodId;
  if (periodRows.length > 0) {
    periodId = periodRows[0].id;
    const [existingInvoices] = await connection.execute(
      "SELECT id, invoice_number FROM invoices WHERE billing_period_id = ?", [periodId]
    );
    if (existingInvoices.length > 0) {
      throw new HttpError(409, {
        error: "An invoice already exists for this customer and billing period.",
        invoice_id: existingInvoices[0].id,
        invoice_number: existingInvoices[0].invoice_number
      });
    }
  } else {
    const [periodResult] = await connection.execute(
      "INSERT INTO billing_periods (customer_id, period_start, period_end) VALUES (?, ?, ?)",
      [customerId, periodStart, periodEnd]
    );
    periodId = periodResult.insertId;
  }

  const discount = discountCode ? await discounts.loadUsableDiscount(connection, discountCode) : null;
  const priced = await priceItems(connection, items);

  const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const [invoiceResult] = await connection.execute(
    `INSERT INTO invoices (invoice_number, billing_period_id, status, subtotal, total, discount_code_id, discount_amount)
     VALUES (?, ?, 'Unpaid', 0, 0, ?, 0)`,
    [invoiceNumber, periodId, discount ? discount.id : null]
  );

  let subtotal = 0;
  for (const item of priced) {
    subtotal = money(subtotal + item.line_total);
    if (item.provider_id) {
      await connection.execute(
        `INSERT INTO invoice_items (invoice_id, provider_id, resource_type, cloud_class, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoiceResult.insertId, item.provider_id, item.resource_type, item.cloud_class, item.quantity, item.unit_price, item.line_total]
      );
    } else {
      await connection.execute(
        `INSERT INTO invoice_items (invoice_id, resource_type, cloud_class, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [invoiceResult.insertId, item.resource_type, item.cloud_class, item.quantity, item.unit_price, item.line_total]
      );
    }
  }

  let discountAmount = 0;
  if (discount) {
    discountAmount = discounts.calculateDiscount(discount, subtotal);
    await connection.execute("UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?", [discount.id]);
  }
  const total = Math.max(0, money(subtotal - discountAmount));
  await connection.execute(
    "UPDATE invoices SET subtotal = ?, discount_amount = ?, total = ? WHERE id = ?",
    [subtotal, discountAmount, total, invoiceResult.insertId]
  );

  return {
    invoice_id: invoiceResult.insertId,
    invoice_number: invoiceNumber,
    customer_id: customerId,
    billing_period: { start: periodStart, end: periodEnd },
    status: "Unpaid",
    subtotal,
    discount_code: discount ? discount.code : null,
    discount_amount: discountAmount,
    total,
    currency: "USD",
    items: priced
  };
}

const INVOICE_COLUMNS = `i.id, i.invoice_number, bp.customer_id,
                         bp.period_start, bp.period_end, i.status,
                         i.subtotal, i.discount_amount, i.discount_code_id, i.total, i.created_at`;

// customerId null = every customer (admin view).
async function listInvoices(executor, customerId = null) {
  const sql = `SELECT ${INVOICE_COLUMNS}
               FROM invoices i
               JOIN billing_periods bp ON bp.id = i.billing_period_id
               ${customerId === null ? "" : "WHERE bp.customer_id = ?"}
               ORDER BY i.created_at DESC, i.id DESC`;
  const [rows] = customerId === null ? await executor.execute(sql) : await executor.execute(sql, [customerId]);
  return rows;
}

// customerId given = the invoice must belong to that customer, otherwise "not found".
async function getInvoice(executor, id, customerId = null) {
  const [rows] = await executor.execute(
    `SELECT ${INVOICE_COLUMNS}
     FROM invoices i JOIN billing_periods bp ON bp.id = i.billing_period_id
     WHERE i.id = ?${customerId === null ? "" : " AND bp.customer_id = ?"}`,
    customerId === null ? [id] : [id, customerId]
  );
  if (rows.length === 0) return null;
  const [items] = await executor.execute(
    `SELECT provider_id, resource_type, cloud_class, quantity, unit_price, line_total
     FROM invoice_items WHERE invoice_id = ? ORDER BY id`, [id]
  );
  return { ...rows[0], currency: "USD", items };
}

module.exports = { priceItems, createInvoiceRecord, listInvoices, getInvoice };
