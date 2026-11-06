const { HttpError, money, logAudit } = require("../utils/util");
const { withTransaction } = require("../utils/tx");
const { query, where, bad, makeRef, positiveAmount, withCurrency } = require("../utils/helpers");
const { notify } = require("./notificationService");
const { providerBalance } = require("./earningsService");

async function refundedTotal(connection, paymentId) {
    const [[row]] = await connection.execute(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = ?",
        [paymentId]
    );

    return money(row.total);
}

// Lock a successful payment row (optionally only if it belongs to the customer)
async function lockPayment(connection, paymentId, customerId = null) {
    const w = where({ "p.id": paymentId, "bp.customer_id": customerId });

    const [[payment]] = await connection.execute(`
        SELECT p.id, p.amount, p.status, p.payment_reference, bp.customer_id
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${w.sql} FOR UPDATE
    `, w.params);

    if (!payment) throw new HttpError(404, { error: "Payment not found." });
    if (payment.status !== "Succeeded")
        throw new HttpError(409, { error: "Only successful payments can be refunded." });

    return payment;
}

async function applyRefund(connection, { paymentId, amount, reason }) {
    const refundAmount = positiveAmount(amount);
    if (!refundAmount) throw bad("Refund amount must be positive.");

    const payment = await lockPayment(connection, paymentId);
    const remaining = money(payment.amount - await refundedTotal(connection, paymentId));

    if (refundAmount > remaining)
        throw bad("Refund exceeds the remaining refundable amount.", {
            remaining_refundable: remaining
        });

    const [earnings] = await connection.execute(`
        SELECT id, provider_id, gross_amount, commission_amount, net_amount
        FROM provider_earnings WHERE payment_id = ? FOR UPDATE
    `, [paymentId]);

    const adjustments = [];
    const ratio = refundAmount / remaining;

    for (const earning of earnings) {
        const gross = money(earning.gross_amount * ratio);
        const commission = money(earning.commission_amount * ratio);
        const net = money(gross - commission);

        const balance = await providerBalance(connection, earning.provider_id);

        if (money(balance.total - net) < balance.committed)
            throw new HttpError(409, {
                error: `Refund would conflict with existing withdrawals for provider ${earning.provider_id}.`
            });

        await connection.execute(`
            UPDATE provider_earnings
            SET gross_amount = gross_amount - ?,
                commission_amount = commission_amount - ?,
                net_amount = net_amount - ?
            WHERE id = ?
        `, [gross, commission, net, earning.id]);

        adjustments.push({
            provider_id: earning.provider_id,
            gross_reduction: gross,
            commission_reduction: commission,
            net_reduction: net
        });
    }

    const refundReference = makeRef("REF");

    const [result] = await connection.execute(`
        INSERT INTO refunds (refund_reference, payment_id, amount, reason, status)
        VALUES (?, ?, ?, ?, 'Succeeded')
    `, [refundReference, paymentId, refundAmount, reason ?? null]);

    if (refundAmount === remaining)
        await connection.execute("UPDATE payments SET status = 'Refunded' WHERE id = ?", [paymentId]);

    const tell = (to, id, title, message) => notify(connection, {
        to, id, type: "RefundSucceeded", title, message, paymentId, refundId: result.insertId
    });

    await tell("Customer", payment.customer_id, "Refund processed",
        `Refund ${refundReference} succeeded for $${refundAmount.toFixed(2)}.`);

    for (const item of adjustments)
        await tell("Provider", item.provider_id, "Earnings adjusted",
            `Refund ${refundReference} reduced your net earnings by $${item.net_reduction.toFixed(2)}.`);

    return {
        refund_id: result.insertId,
        refund_reference: refundReference,
        payment_id: paymentId,
        amount: refundAmount,
        remaining_refundable: money(remaining - refundAmount),
        status: "Succeeded",
        provider_adjustments: adjustments
    };
}

async function listRefunds({ paymentId = null } = {}) {
    const w = where({ payment_id: paymentId });

    return query(`
        SELECT id, refund_reference, payment_id, amount, reason, status, created_at
        FROM refunds ${w.sql}
        ORDER BY id DESC
    `, w.params);
}

function createRefundRequest({ customerId, paymentId, amount, reason }) {
    return withTransaction(async connection => {
        const payment = await lockPayment(connection, paymentId, customerId);

        const [[pending]] = await connection.execute(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM refund_requests WHERE payment_id = ? AND status = 'Pending'
        `, [paymentId]);

        const available = money(
            Number(payment.amount) - await refundedTotal(connection, paymentId) - money(pending.total)
        );

        const requested = amount == null ? available : positiveAmount(amount);

        if (!requested || requested > available)
            throw bad("Invalid refund amount or insufficient available balance.", {
                available_to_request: Math.max(0, available)
            });

        const [result] = await connection.execute(`
            INSERT INTO refund_requests (payment_id, customer_id, amount, reason, status)
            VALUES (?, ?, ?, ?, 'Pending')
        `, [paymentId, customerId, requested, reason ?? null]);

        await notify(connection, {
            to: "Customer", id: customerId, type: "RefundRequested", title: "Refund requested",
            message: `Your refund request #${result.insertId} for $${requested.toFixed(2)} on payment ${payment.payment_reference} is waiting for review.`,
            paymentId
        });

        return {
            refund_request_id: result.insertId,
            payment_id: paymentId,
            amount: requested,
            reason: reason ?? null,
            status: "Pending",
            currency: "USD"
        };
    });
}

const refundColumns = `
    id, payment_id, customer_id, amount, reason, status,
    admin_note, decided_by, decided_at, refund_id, created_at
`;

async function listRefundRequests({ customerId = null, status = null } = {}) {
    const w = where({ customer_id: customerId, status });

    const rows = await query(`
        SELECT ${refundColumns} FROM refund_requests ${w.sql}
        ORDER BY id DESC
    `, w.params);

    return rows.map(withCurrency);
}

function decideRefundRequest({ requestId, status, adminNote, admin }) {
    if (!["Approved", "Rejected"].includes(status))
        throw bad("Status must be Approved or Rejected.");

    return withTransaction(async connection => {
        const [[request]] = await connection.execute(
            `SELECT ${refundColumns} FROM refund_requests WHERE id = ? FOR UPDATE`,
            [requestId]
        );

        if (!request) throw new HttpError(404, { error: "Refund request not found." });

        if (request.status !== "Pending")
            throw new HttpError(409, {
                error: `This refund request was already ${request.status.toLowerCase()}.`,
                status: request.status
            });

        let refund = null;

        if (status === "Approved") {
            refund = await applyRefund(connection, {
                paymentId: request.payment_id,
                amount: Number(request.amount),
                reason: request.reason
            });
        } else {
            await notify(connection, {
                to: "Customer", id: request.customer_id, type: "RefundRejected",
                title: "Refund request rejected",
                message: `Your refund request #${request.id} for $${money(request.amount).toFixed(2)} was rejected.${adminNote ? " Note: " + adminNote : ""}`,
                paymentId: request.payment_id
            });
        }

        await connection.execute(`
            UPDATE refund_requests
            SET status = ?, admin_note = ?, decided_by = ?, decided_at = NOW(), refund_id = ?
            WHERE id = ?
        `, [status, adminNote ?? null, admin.id, refund?.refund_id ?? null, requestId]);

        await logAudit(connection, admin, `REFUND_REQUEST_${status.toUpperCase()}`, "refund_request", requestId, {
            payment_id: request.payment_id,
            customer_id: request.customer_id,
            amount: money(request.amount),
            admin_note: adminNote ?? null,
            refund_id: refund?.refund_id ?? null
        });

        return {
            message: `Refund request ${status.toLowerCase()}${refund ? "; simulated refund recorded, no real money was transferred" : ""}.`,
            refund_request_id: requestId,
            previous_status: "Pending",
            status,
            refund
        };
    });
}

module.exports = { applyRefund, listRefunds, createRefundRequest, listRefundRequests, decideRefundRequest };
