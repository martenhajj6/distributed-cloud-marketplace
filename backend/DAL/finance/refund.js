const { query, where } = require("../query");
const refundColumns = "id, payment_id, customer_id, amount, reason, status, admin_note, decided_by, decided_at, refund_id, created_at";
// Data Access Layer: SQL statements for refundService.

const decideRequest = (connection, params = []) => connection.execute(`
            UPDATE refund_requests
            SET status = ?, admin_note = ?, decided_by = ?, decided_at = NOW(), refund_id = ?
            WHERE id = ?
        `, params);

const insertRequest = (connection, params = []) => connection.execute(`
            INSERT INTO refund_requests (payment_id, customer_id, amount, reason, status)
            VALUES (?, ?, ?, ?, 'Pending')
        `, params);

const pendingRequestTotal = (connection, params = []) => connection.execute(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM refund_requests WHERE payment_id = ? AND status = 'Pending'
        `, params);

const markPaymentRefunded = (connection, params = []) => connection.execute("UPDATE payments SET status = 'Refunded' WHERE id = ?", params);

const insertRefund = (connection, params = []) => connection.execute(`
        INSERT INTO refunds (refund_reference, payment_id, amount, reason, status)
        VALUES (?, ?, ?, ?, 'Succeeded')
    `, params);

const reduceEarnings = (connection, params = []) => connection.execute(`
            UPDATE provider_earnings
            SET gross_amount = gross_amount - ?,
                commission_amount = commission_amount - ?,
                net_amount = net_amount - ?
            WHERE id = ?
        `, params);

const lockPaymentEarnings = (connection, params = []) => connection.execute(`
        SELECT id, provider_id, gross_amount, commission_amount, net_amount
        FROM provider_earnings WHERE payment_id = ? FOR UPDATE
    `, params);

const refundedTotal = (connection, params = []) => connection.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = ?", params);

const paymentProviders = (connection, id) => connection.execute(
    "SELECT provider_id FROM provider_earnings WHERE payment_id = ? ORDER BY provider_id", [id]
);

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

module.exports = { paymentProviders, findRequest, listRefundRequests, listRefunds, findPayment, decideRequest, insertRequest, pendingRequestTotal, markPaymentRefunded, insertRefund, reduceEarnings, lockPaymentEarnings, refundedTotal };
