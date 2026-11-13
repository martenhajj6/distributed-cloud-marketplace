const { query, where } = require("../query");
const refundColumns = "id, payment_id, customer_id, amount, reason, status, admin_note, decided_by, decided_at, refund_id, created_at";
// Data Access Layer: SQL statements for refundService.

const statement1 = (connection, params = []) => connection.execute(`
            UPDATE refund_requests
            SET status = ?, admin_note = ?, decided_by = ?, decided_at = NOW(), refund_id = ?
            WHERE id = ?
        `, params);

const statement2 = (connection, params = []) => connection.execute(`
            INSERT INTO refund_requests (payment_id, customer_id, amount, reason, status)
            VALUES (?, ?, ?, ?, 'Pending')
        `, params);

const statement3 = (connection, params = []) => connection.execute(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM refund_requests WHERE payment_id = ? AND status = 'Pending'
        `, params);

const statement4 = (connection, params = []) => connection.execute("UPDATE payments SET status = 'Refunded' WHERE id = ?", params);

const statement5 = (connection, params = []) => connection.execute(`
        INSERT INTO refunds (refund_reference, payment_id, amount, reason, status)
        VALUES (?, ?, ?, ?, 'Succeeded')
    `, params);

const statement6 = (connection, params = []) => connection.execute(`
            UPDATE provider_earnings
            SET gross_amount = gross_amount - ?,
                commission_amount = commission_amount - ?,
                net_amount = net_amount - ?
            WHERE id = ?
        `, params);

const statement7 = (connection, params = []) => connection.execute(`
        SELECT id, provider_id, gross_amount, commission_amount, net_amount
        FROM provider_earnings WHERE payment_id = ? FOR UPDATE
    `, params);

const statement8 = (connection, params = []) => connection.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = ?", params);

async function findPayment(connection, paymentId, customerId) {
    const w = where({ "p.id": paymentId, "bp.customer_id": customerId });

    const [[payment]] = await connection.execute(`
        SELECT p.id, p.amount, p.status, p.payment_reference, bp.customer_id
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${w.sql} FOR UPDATE
    `, w.params);
    return payment;
}

async function listRefunds(paymentId) {
    const w = where({ payment_id: paymentId });

    const rows = await query(`
        SELECT id, refund_reference, payment_id, amount, reason, status, created_at
        FROM refunds ${w.sql}
        ORDER BY id DESC
    `, w.params);
    return rows;
}

async function listRefundRequests(customerId, status) {
    const w = where({ customer_id: customerId, status });

    const rows = await query(`
        SELECT ${refundColumns} FROM refund_requests ${w.sql}
        ORDER BY id DESC
    `, w.params);
    return rows;
}

async function findRequest(connection, requestId) {
        const [[request]] = await connection.execute(
            `SELECT ${refundColumns} FROM refund_requests WHERE id = ? FOR UPDATE`,
            [requestId]
        );
    return request;
}

module.exports = { findRequest, listRefundRequests, listRefunds, findPayment, statement1, statement2, statement3, statement4, statement5, statement6, statement7, statement8 };
