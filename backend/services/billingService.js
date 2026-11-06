
const crypto = require("crypto");
const { HttpError, money } = require("../utils/util");
const discounts = require("./discountService");

// Price resources
async function priceItems(db, items) {
    const priced = [];

    for (const item of items) {
        const [rows] = await db.execute(
            "SELECT unit_price FROM pricing_rules WHERE resource_type = ? AND cloud_class = ?",
            [item.resource_type, item.cloud_class]
        );

        if (!rows.length)
            throw new HttpError(409, {
                error: `No pricing rule found for ${item.resource_type} / ${item.cloud_class}.`
            });

        const quantity = Number(item.quantity);
        const unitPrice = Number(rows[0].unit_price);

        priced.push({
            ...item,
            quantity,
            unit_price: unitPrice,
            line_total: money(quantity * unitPrice)
        });
    }

    return priced;
}

// Create invoice
async function createInvoiceRecord(db, { customerId, periodStart, periodEnd, items, discountCode }) {
    const [periods] = await db.execute(`
        SELECT id FROM billing_periods
        WHERE customer_id = ? AND period_start = ? AND period_end = ? FOR UPDATE
    `, [customerId, periodStart, periodEnd]);

    let periodId = periods[0]?.id;

    if (periodId) {
        const [existing] = await db.execute(
            "SELECT id, invoice_number FROM invoices WHERE billing_period_id = ?",
            [periodId]
        );

        if (existing.length)
            throw new HttpError(409, {
                error: "An invoice already exists for this customer and billing period.",
                invoice_id: existing[0].id,
                invoice_number: existing[0].invoice_number
            });
    } else {
        const [result] = await db.execute(
            "INSERT INTO billing_periods (customer_id, period_start, period_end) VALUES (?, ?, ?)",
            [customerId, periodStart, periodEnd]
        );

        periodId = result.insertId;
    }

    const discount = discountCode
        ? await discounts.loadUsableDiscount(db, discountCode)
        : null;

    const priced = await priceItems(db, items);
    const subtotal = priced.reduce((sum, item) => money(sum + item.line_total), 0);
    const discountAmount = discount ? discounts.calculateDiscount(discount, subtotal) : 0;
    const total = Math.max(0, money(subtotal - discountAmount));
    const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const [invoice] = await db.execute(`
        INSERT INTO invoices
        (invoice_number, billing_period_id, status, subtotal, total, discount_code_id, discount_amount)
        VALUES (?, ?, 'Unpaid', ?, ?, ?, ?)
    `, [invoiceNumber, periodId, subtotal, total, discount?.id ?? null, discountAmount]);

    for (const item of priced) {
        const hasProvider = Boolean(item.provider_id);

        await db.execute(`
            INSERT INTO invoice_items
            (invoice_id, ${hasProvider ? "provider_id, " : ""}resource_type, cloud_class, quantity, unit_price, line_total)
            VALUES (?, ${hasProvider ? "?, " : ""}?, ?, ?, ?, ?)
        `, [
            invoice.insertId,
            ...(hasProvider ? [item.provider_id] : []),
            item.resource_type,
            item.cloud_class,
            item.quantity,
            item.unit_price,
            item.line_total
        ]);
    }

    if (discount)
        await db.execute(
            "UPDATE discount_codes SET used_count = used_count + 1 WHERE id = ?",
            [discount.id]
        );

    return {
        invoice_id: invoice.insertId,
        invoice_number: invoiceNumber,
        customer_id: customerId,
        billing_period: { start: periodStart, end: periodEnd },
        status: "Unpaid",
        subtotal,
        discount_code: discount?.code ?? null,
        discount_amount: discountAmount,
        total,
        currency: "USD",
        items: priced
    };
}

const columns = `i.id, i.invoice_number, bp.customer_id, bp.period_start,
                 bp.period_end, i.status, i.subtotal, i.discount_amount,
                 i.discount_code_id, i.total, i.created_at`;

// List invoices
async function listInvoices(db, customerId = null) {
    const [rows] = await db.execute(`
        SELECT ${columns}
        FROM invoices i
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${customerId === null ? "" : "WHERE bp.customer_id = ?"}
        ORDER BY i.created_at DESC, i.id DESC
    `, customerId === null ? [] : [customerId]);

    return rows;
}

// Get invoice details
async function getInvoice(db, id, customerId = null) {
    const [rows] = await db.execute(`
        SELECT ${columns}
        FROM invoices i
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        WHERE i.id = ? ${customerId === null ? "" : "AND bp.customer_id = ?"}
    `, customerId === null ? [id] : [id, customerId]);

    if (!rows.length) return null;

    const [items] = await db.execute(`
        SELECT provider_id, resource_type, cloud_class, quantity, unit_price, line_total
        FROM invoice_items WHERE invoice_id = ? ORDER BY id
    `, [id]);

    return { ...rows[0], currency: "USD", items };
}

module.exports = { priceItems, createInvoiceRecord, listInvoices, getInvoice };
