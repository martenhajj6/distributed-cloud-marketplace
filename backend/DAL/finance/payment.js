const { query, where } = require("../query");
// Data Access Layer: SQL statements for paymentService.

const statement1 = (connection, params = []) => connection.execute("UPDATE invoices SET status = 'Paid' WHERE id = ?", params);

const statement2 = (connection, params = []) => connection.execute(`
                INSERT INTO provider_earnings
                (payment_id, provider_id, gross_amount, commission_rate, commission_amount, net_amount)
                VALUES (?, ?, ?, ?, ?, ?)
            `, params);

const statement3 = (connection, params = []) => connection.execute(`
            INSERT INTO payments (payment_reference, invoice_id, amount, status, simulated)
            VALUES (?, ?, ?, 'Succeeded', 1)
        `, params);

const statement4 = (connection, params = []) => connection.execute(`
            SELECT i.id, i.total, i.status, bp.customer_id
            FROM invoices i
            JOIN billing_periods bp ON bp.id = i.billing_period_id
            WHERE i.id = ? FOR UPDATE
        `, params);

const statement5 = (connection, params = []) => connection.execute(`
        SELECT provider_id, SUM(line_total) AS gross
        FROM invoice_items
        WHERE invoice_id = ?
        GROUP BY provider_id ORDER BY provider_id
    `, params);

function listPayments({ invoiceId = null, customerId = null } = {}) {
    const w = where({ "p.invoice_id": invoiceId, "bp.customer_id": customerId });

    return query(`
        SELECT p.id, p.payment_reference, p.invoice_id, i.invoice_number,
               p.amount, p.status, p.simulated, p.created_at, bp.customer_id,
               COALESCE((SELECT SUM(r.amount) FROM refunds r WHERE r.payment_id = p.id AND r.status = 'Succeeded'), 0) AS refunded_amount
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${w.sql}
        ORDER BY p.id DESC
    `, w.params);
}

module.exports = { listPayments, statement1, statement2, statement3, statement4, statement5 };
