const { where } = require("./query");
// Data Access Layer: SQL statements for invoiceService.
const db = require("./dbconn");

const statement1 = (connection = db, params = []) => connection.execute(`
        SELECT provider_id, resource_type, cloud_class, quantity, unit_price, line_total
        FROM invoice_items WHERE invoice_id = ? ORDER BY id
    `, params);

const statement2 = (connection = db, params = []) => connection.execute(`
            INSERT INTO invoice_items
            (invoice_id, provider_id, resource_type, cloud_class, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, params);

const statement3 = (connection = db, params = []) => connection.execute(`
        INSERT INTO invoices
        (invoice_number, billing_period_id, status, subtotal, total, discount_code_id, discount_amount)
        VALUES (?, ?, 'Unpaid', ?, ?, ?, ?)
    `, params);

const statement4 = (connection = db, params = []) => connection.execute(`
            UPDATE discount_codes SET used_count = used_count + 1
            WHERE id = ? AND (max_uses IS NULL OR used_count < max_uses)
        `, params);

const statement5 = (connection = db, params = []) => connection.execute(`
                INSERT INTO billing_periods (customer_id, period_start, period_end) VALUES (?, ?, ?)
            `, params);

const statement6 = (connection = db, params = []) => connection.execute("SELECT id, invoice_number FROM invoices WHERE billing_period_id = ?", params);

const statement7 = (connection = db, params = []) => connection.execute(`
        SELECT id FROM billing_periods
        WHERE customer_id = ? AND period_start = ? AND period_end = ?
        FOR UPDATE
    `, params);

const statement8 = (connection = db, params = []) => connection.execute("SELECT resource_type, cloud_class, unit_price FROM pricing_rules", params);

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

const columns = `i.id, i.invoice_number, bp.customer_id, bp.period_start, bp.period_end, i.status, i.subtotal, i.discount_amount, i.discount_code_id, i.total, i.created_at`;

async function findInvoice(db, id, customerId) {
    const w = where({ "i.id": id, "bp.customer_id": customerId });
    const [[invoice]] = await db.execute(`SELECT ${columns} FROM invoices i JOIN billing_periods bp ON bp.id = i.billing_period_id ${w.sql}`, w.params);
    return invoice || null;
}

module.exports = { findInvoice, listInvoices, statement1, statement2, statement3, statement4, statement5, statement6, statement7, statement8 };
