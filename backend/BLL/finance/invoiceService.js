const db = require("../../DAL/dbconn");
const { withTransaction } = db;
const repository = require("../../DAL/invoice");
const { HttpError, money } = require("../../utils/util");
const { bad, makeRef } = require("../../utils/helpers");
const discounts = require("./discountService");
const { logAudit } = require("../../DAL/audit");

// Price items from pricing_rules (one query for all items)
async function priceItems(db, items) {
    if (!Array.isArray(items) || !items.length)
        throw bad("At least one invoice item is required.");

    const [rules] = await repository.statement8(db);
    const prices = new Map(rules.map(r => [`${r.resource_type}|${r.cloud_class}`, Number(r.unit_price)]));

    return items.map(item => {
        const quantity = Number(item.quantity);

        // Fractional quantities are valid (usage billing produces them)
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 9999999999.9999 ||
            Math.abs(quantity * 10000 - Math.round(quantity * 10000)) > 0.00001)
            throw bad("Quantity must be positive, fit DECIMAL(14,4), and have at most four decimal places.");

        const unitPrice = prices.get(`${item.resource_type}|${item.cloud_class}`);

        if (unitPrice === undefined || !Number.isFinite(unitPrice) || unitPrice < 0)
            throw new HttpError(409, {
                error: unitPrice === undefined
                    ? `No pricing rule found for ${item.resource_type} / ${item.cloud_class}.`
                    : "Invalid pricing rule or invoice amount."
            });

        const lineTotal = money(quantity * unitPrice);
        if (!Number.isFinite(lineTotal) || lineTotal > 9999999999.99)
            throw bad("Invoice item amount exceeds the supported limit.");
        return { ...item, quantity, unit_price: unitPrice, line_total: lineTotal };
    });
}

// Create invoice (must run inside a transaction). Input is validated by the routes.
async function createInvoiceRecord(db, { customerId, periodStart, periodEnd, items, discountCode }) {
    const [[customer]] = await repository.findCustomer(db, customerId);
    if (!customer)
        throw new HttpError(404, { error: `Customer ID ${customerId} does not exist.` });
    if (String(customer.role).toLowerCase() !== "customer")
        throw bad(`User ID ${customerId} is not a customer account.`);

    const providerIds = [...new Set(items.map(item => Number(item.provider_id)))];
    if (!providerIds.length || providerIds.some(id => !Number.isSafeInteger(id) || id <= 0))
        throw bad("Every invoice item must identify a valid provider. Usage invoices derive this from usage records.");
    const [existingProviders] = await repository.findProviders(db, providerIds);
    if (existingProviders.length !== providerIds.length)
        throw bad("One or more Provider IDs do not belong to provider accounts.");

    const [periods] = await repository.statement7(db, [customerId, periodStart, periodEnd]);

    let periodId = periods[0]?.id;

    if (periodId) {
        const [[existing]] = await repository.statement6(db, [periodId]);

        if (existing)
            throw new HttpError(409, {
                error: "An invoice already exists for this customer and billing period.",
                invoice_id: existing.id,
                invoice_number: existing.invoice_number
            });
    } else {
        try {
            const [result] = await repository.statement5(db, [customerId, periodStart, periodEnd]);

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
    if (subtotal > 9999999999.99) throw bad("Invoice subtotal exceeds the supported limit.");
    const discountAmount = discount ? discounts.calculateDiscount(discount, subtotal) : 0;
    const total = Math.max(0, money(subtotal - discountAmount));

    if (discount) {
        const [result] = await repository.statement4(db, [discount.id]);

        if (!result.affectedRows) throw new HttpError(409, { error: "Discount usage limit reached." });
    }

    const invoiceNumber = makeRef("INV");

    const [invoice] = await repository.statement3(db, [invoiceNumber, periodId, subtotal, total, discount?.id ?? null, discountAmount]);

    for (const item of priced)
        await repository.statement2(db, [invoice.insertId, item.provider_id ?? null, item.resource_type, item.cloud_class,
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

const listInvoices = repository.listInvoices;

async function getInvoice(db, id, customerId = null) {
    const invoice = await repository.findInvoice(db, id, customerId);

    if (!invoice) return null;

    const [items] = await repository.statement1(db, [id]);

    return { ...invoice, currency: "USD", items };
}

async function cancelInvoice(id, actor) {
    return withTransaction(async connection => {
        const [[invoice]] = await repository.lockInvoice(connection, id);
        if (!invoice) throw new HttpError(404, { error: `Invoice ID ${id} does not exist.` });
        if (invoice.status !== "Unpaid")
            throw new HttpError(409, { error: `Invoice ${invoice.invoice_number} is ${invoice.status}. Only unpaid invoices can be cancelled.` });
        const [payments] = await repository.paymentExists(connection, id);
        if (payments.length)
            throw new HttpError(409, { error: "This invoice has a payment record and cannot be cancelled. Use the refund process instead." });
        const [result] = await repository.cancelInvoice(connection, id);
        if (!result.affectedRows) throw new HttpError(409, { error: "Invoice status changed. Reload and try again." });
        await logAudit(connection, actor, "CancelInvoice", "Invoice", id, { invoice_number: invoice.invoice_number, previous_status: "Unpaid", new_status: "Cancelled" });
        return { message: "Invoice cancelled successfully.", invoice_id: id, status: "Cancelled" };
    });
}

module.exports = { cancelInvoice,
    priceItems, createInvoiceRecord,
    createInvoice: input => withTransaction(connection => createInvoiceRecord(connection, input)),
    listInvoices: customerId => listInvoices(db, customerId),
    getInvoice: (id, customerId) => getInvoice(db, id, customerId)
};
