const { HttpError, money } = require("../utils/util");
const { bad, makeRef, where } = require("../utils/helpers");
const discounts = require("./discountService");

// Price items from pricing_rules (one query for all items)
async function priceItems(db, items) {
    if (!Array.isArray(items) || !items.length)
        throw bad("At least one invoice item is required.");

    const [rules] = await db.execute("SELECT resource_type, cloud_class, unit_price FROM pricing_rules");
    const prices = new Map(rules.map(r => [`${r.resource_type}|${r.cloud_class}`, Number(r.unit_price)]));

    return items.map(item => {
        const quantity = Number(item.quantity);

        // Fractional quantities are valid (usage billing produces them)
        if (!Number.isFinite(quantity) || quantity <= 0)
            throw bad("Quantity must be a positive number.");

        const unitPrice = prices.get(`${item.resource_type}|${item.cloud_class}`);

        if (unitPrice === undefined || !Number.isFinite(unitPrice) || unitPrice < 0)
            throw new HttpError(409, {
                error: unitPrice === undefined
                    ? `No pricing rule found for ${item.resource_type} / ${item.cloud_class}.`
                    : "Invalid pricing rule or invoice amount."
            });

        return { ...item, quantity, unit_price: unitPrice, line_total: money(quantity * unitPrice) };
    });
}

// Create invoice (must run inside a transaction). Input is validated by the routes.
async function createInvoiceRecord(db, { customerId, periodStart, periodEnd, items, discountCode }) {
    const [periods] = await db.execute(`
        SELECT id FROM billing_periods
        WHERE customer_id = ? AND period_start = ? AND period_end = ?
        FOR UPDATE
    `, [customerId, periodStart, periodEnd]);

    let periodId = periods[0]?.id;

    if (periodId) {
        const [[existing]] = await db.execute(
            "SELECT id, invoice_number FROM invoices WHERE billing_period_id = ?", [periodId]
        );

        if (existing)
            throw new HttpError(409, {
                error: "An invoice already exists for this customer and billing period.",
                invoice_id: existing.id,
                invoice_number: existing.invoice_number
            });
    } else {
        try {
            const [result] = await db.execute(`
                INSERT INTO billing_periods (customer_id, period_start, period_end) VALUES (?, ?, ?)
            `, [customerId, periodStart, periodEnd]);

            periodId = result.insertId;
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY")
                throw new HttpError(409, { error: "This billing period already exists." });
            throw error;
        }
    }

    const discount = discountCode ? await discounts.loadUsableDiscount(db, discountCode) : null;
    const priced = await priceItems(db, items);
    const subtotal = money(priced.reduce((sum, item) => sum + item.line_total, 0));
    const discountAmount = discount ? discounts.calculateDiscount(discount, subtotal) : 0;
    const total = Math.max(0, money(subtotal - discountAmount));

    if (discount) {
        const [result] = await db.execute(`
            UPDATE discount_codes SET used_count = used_count + 1
            WHERE id = ? AND (max_uses IS NULL OR used_count < max_uses)
        `, [discount.id]);

        if (!result.affectedRows) throw new HttpError(409, { error: "Discount usage limit reached." });
    }

    const invoiceNumber = makeRef("INV");

    const [invoice] = await db.execute(`
        INSERT INTO invoices
        (invoice_number, billing_period_id, status, subtotal, total, discount_code_id, discount_amount)
        VALUES (?, ?, 'Unpaid', ?, ?, ?, ?)
    `, [invoiceNumber, periodId, subtotal, total, discount?.id ?? null, discountAmount]);

    for (const item of priced)
        await db.execute(`
            INSERT INTO invoice_items
            (invoice_id, provider_id, resource_type, cloud_class, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [invoice.insertId, item.provider_id ?? null, item.resource_type, item.cloud_class,
            item.quantity, item.unit_price, item.line_total]);

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

async function listInvoices(db, customerId = null) {
    const w = where({ "bp.customer_id": customerId });

    const [rows] = await db.execute(`
        SELECT ${columns}
        FROM invoices i
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${w.sql}
        ORDER BY i.created_at DESC, i.id DESC
    `, w.params);

    return rows;
}

async function getInvoice(db, id, customerId = null) {
    const w = where({ "i.id": id, "bp.customer_id": customerId });

    const [[invoice]] = await db.execute(`
        SELECT ${columns}
        FROM invoices i
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${w.sql}
    `, w.params);

    if (!invoice) return null;

    const [items] = await db.execute(`
        SELECT provider_id, resource_type, cloud_class, quantity, unit_price, line_total
        FROM invoice_items WHERE invoice_id = ? ORDER BY id
    `, [id]);

    return { ...invoice, currency: "USD", items };
}

module.exports = { priceItems, createInvoiceRecord, listInvoices, getInvoice };
