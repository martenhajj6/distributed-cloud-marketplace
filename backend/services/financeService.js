
const crypto = require("crypto");
const db = require("../dbconn");
const { HttpError, money } = require("../utils/util");
const { withTransaction } = require("../utils/tx");

const reference = type =>
    `${type}-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

const query = async (sql, params = []) => (await db.execute(sql, params))[0];

// Payments
async function listPayments({ invoiceId = null, customerId = null } = {}) {
    const where = [];
    const params = [];

    if (invoiceId !== null) {
        where.push("p.invoice_id = ?");
        params.push(invoiceId);
    }

    if (customerId !== null) {
        where.push("bp.customer_id = ?");
        params.push(customerId);
    }

    return query(`
        SELECT p.id, p.payment_reference, p.invoice_id, i.invoice_number,
               p.amount, p.status, p.simulated, p.created_at
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY p.id DESC
    `, params);
}

async function deriveAllocations(connection, invoiceId, invoiceTotal) {
    const [rows] = await connection.execute(`
        SELECT provider_id, SUM(line_total) AS gross
        FROM invoice_items
        WHERE invoice_id = ? AND provider_id IS NOT NULL
        GROUP BY provider_id ORDER BY provider_id
    `, [invoiceId]);

    const [[totals]] = await connection.execute(`
        SELECT COALESCE(SUM(line_total), 0) AS total
        FROM invoice_items WHERE invoice_id = ?
    `, [invoiceId]);

    const subtotal = money(rows.reduce((sum, row) => sum + Number(row.gross), 0));

    if (!rows.length || subtotal !== money(totals.total))
        return null;

    const total = money(invoiceTotal);
    const allocations = rows.map(row => ({
        provider_id: row.provider_id,
        gross_amount: subtotal === 0 ? 0 : money(Number(row.gross) * total / subtotal)
    }));

    const difference = money(total - allocations.reduce((sum, a) => sum + a.gross_amount, 0));

    if (difference !== 0) {
        const largest = allocations.reduce(
            (best, a) => a.gross_amount > best.gross_amount ? a : best,
            allocations[0]
        );

        largest.gross_amount = money(largest.gross_amount + difference);
    }

    return allocations.filter(a => a.gross_amount > 0);
}

// Refunds
async function applyRefund(connection, { paymentId, amount, reason }) {
    const [payments] = await connection.execute(`
        SELECT p.id, p.amount, p.status, bp.customer_id
        FROM payments p
        JOIN invoices i ON i.id = p.invoice_id
        JOIN billing_periods bp ON bp.id = i.billing_period_id
        WHERE p.id = ? FOR UPDATE
    `, [paymentId]);

    if (!payments.length)
        throw new HttpError(404, { error: "Payment not found." });

    const payment = payments[0];

    if (payment.status !== "Succeeded")
        throw new HttpError(409, { error: "Only successful payments can be refunded." });

    const [[refunded]] = await connection.execute(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM refunds WHERE payment_id = ?
    `, [paymentId]);

    const remaining = money(Number(payment.amount) - money(refunded.total));
    const refundAmount = money(amount);

    if (refundAmount > remaining)
        throw new HttpError(400, {
            error: "Refund exceeds the remaining refundable amount.",
            remaining_refundable: remaining
        });

    const [earnings] = await connection.execute(`
        SELECT id, provider_id, gross_amount, commission_amount, net_amount
        FROM provider_earnings WHERE payment_id = ? FOR UPDATE
    `, [paymentId]);

    const adjustments = [];
    const ratio = refundAmount / remaining;

    for (const earning of earnings) {
        const gross = money(Number(earning.gross_amount) * ratio);
        const commission = money(Number(earning.commission_amount) * ratio);
        const net = money(Number(earning.net_amount) * ratio);

        const [[totals]] = await connection.execute(`
            SELECT COALESCE(SUM(net_amount), 0) AS total
            FROM provider_earnings WHERE provider_id = ?
        `, [earning.provider_id]);

        const [[withdrawals]] = await connection.execute(`
            SELECT COALESCE(SUM(amount), 0) AS committed
            FROM withdrawal_requests
            WHERE provider_id = ? AND status IN ('Requested', 'Approved', 'Paid')
        `, [earning.provider_id]);

        if (money(Number(totals.total) - net) < money(withdrawals.committed))
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

    const refundReference = reference("REF");

    const [result] = await connection.execute(`
        INSERT INTO refunds (refund_reference, payment_id, amount, reason, status)
        VALUES (?, ?, ?, ?, 'Succeeded')
    `, [refundReference, paymentId, refundAmount, reason || null]);

    if (refundAmount === remaining)
        await connection.execute(
            "UPDATE payments SET status = 'Refunded' WHERE id = ?",
            [paymentId]
        );

    const notify = (type, id, title, message) => connection.execute(`
        INSERT INTO payment_notifications
        (recipient_type, recipient_id, notification_type, title, message, payment_id, refund_id)
        VALUES (?, ?, 'RefundSucceeded', ?, ?, ?, ?)
    `, [type, id, title, message, paymentId, result.insertId]);

    await notify("Customer", payment.customer_id, "Refund processed",
        `Refund ${refundReference} succeeded for $${refundAmount.toFixed(2)}.`);

    for (const a of adjustments)
        await notify("Provider", a.provider_id, "Earnings adjusted",
            `Refund ${refundReference} reduced your net earnings by $${a.net_reduction.toFixed(2)}.`);

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
    return query(`
        SELECT id, refund_reference, payment_id, amount, reason, status, created_at
        FROM refunds
        ${paymentId === null ? "" : "WHERE payment_id = ?"}
        ORDER BY id DESC
    `, paymentId === null ? [] : [paymentId]);
}

async function createRefundRequest({ customerId, paymentId, amount, reason }) {
    return withTransaction(async connection => {
        const [rows] = await connection.execute(`
            SELECT p.id, p.amount, p.status, p.payment_reference
            FROM payments p
            JOIN invoices i ON i.id = p.invoice_id
            JOIN billing_periods bp ON bp.id = i.billing_period_id
            WHERE p.id = ? AND bp.customer_id = ? FOR UPDATE
        `, [paymentId, customerId]);

        if (!rows.length)
            throw new HttpError(404, { error: "Payment not found." });

        const payment = rows[0];

        if (payment.status !== "Succeeded")
            throw new HttpError(409, { error: "Only successful payments can be refunded." });

        const [[refunded]] = await connection.execute(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = ?",
            [paymentId]
        );

        const [[pending]] = await connection.execute(`
            SELECT COALESCE(SUM(amount), 0) AS total
            FROM refund_requests WHERE payment_id = ? AND status = 'Pending'
        `, [paymentId]);

        const available = money(Number(payment.amount) - money(refunded.total) - money(pending.total));
        const requested = amount == null ? available : money(amount);

        if (requested <= 0 || requested > available)
            throw new HttpError(400, {
                error: "Requested amount exceeds the amount still available to refund (pending requests are counted).",
                available_to_request: Math.max(0, available)
            });

        const [result] = await connection.execute(`
            INSERT INTO refund_requests (payment_id, customer_id, amount, reason, status)
            VALUES (?, ?, ?, ?, 'Pending')
        `, [paymentId, customerId, requested, reason]);

        await connection.execute(`
            INSERT INTO payment_notifications
            (recipient_type, recipient_id, notification_type, title, message, payment_id)
            VALUES ('Customer', ?, 'RefundRequested', 'Refund requested', ?, ?)
        `, [
            customerId,
            `Your refund request #${result.insertId} for $${requested.toFixed(2)} on payment ${payment.payment_reference} is waiting for review.`,
            paymentId
        ]);

        return {
            refund_request_id: result.insertId,
            payment_id: paymentId,
            amount: requested,
            reason,
            status: "Pending",
            currency: "USD"
        };
    });
}

const refundColumns = "id, payment_id, customer_id, amount, reason, status, admin_note, decided_by, decided_at, refund_id, created_at";

async function listRefundRequests({ customerId = null, status = null } = {}) {
    const where = [];
    const params = [];

    if (customerId !== null) {
        where.push("customer_id = ?");
        params.push(customerId);
    }

    if (status !== null) {
        where.push("status = ?");
        params.push(status);
    }

    const rows = await query(`
        SELECT ${refundColumns} FROM refund_requests
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY id DESC
    `, params);

    return rows.map(row => ({ ...row, currency: "USD" }));
}

async function decideRefundRequest({ requestId, status, adminNote, admin, audit }) {
    return withTransaction(async connection => {
        const [rows] = await connection.execute(
            `SELECT ${refundColumns} FROM refund_requests WHERE id = ? FOR UPDATE`,
            [requestId]
        );

        if (!rows.length)
            throw new HttpError(404, { error: "Refund request not found." });

        const request = rows[0];

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
            await connection.execute(`
                INSERT INTO payment_notifications
                (recipient_type, recipient_id, notification_type, title, message, payment_id)
                VALUES ('Customer', ?, 'RefundRejected', 'Refund request rejected', ?, ?)
            `, [
                request.customer_id,
                `Your refund request #${request.id} for $${money(request.amount).toFixed(2)} was rejected.${adminNote ? " Note: " + adminNote : ""}`,
                request.payment_id
            ]);
        }

        await connection.execute(`
            UPDATE refund_requests
            SET status = ?, admin_note = ?, decided_by = ?,
                decided_at = NOW(), refund_id = ?
            WHERE id = ?
        `, [status, adminNote || null, admin.id, refund?.refund_id ?? null, requestId]);

        await audit(connection, admin,
            status === "Approved" ? "REFUND_REQUEST_APPROVED" : "REFUND_REQUEST_REJECTED",
            "refund_request", requestId, {
                payment_id: request.payment_id,
                customer_id: request.customer_id,
                amount: money(request.amount),
                admin_note: adminNote || null,
                refund_id: refund?.refund_id ?? null
            }
        );

        return {
            message: `Refund request ${status.toLowerCase()}${refund ? "; simulated refund recorded, no real money was transferred" : ""}.`,
            refund_request_id: requestId,
            previous_status: "Pending",
            status,
            refund
        };
    });
}

// Provider earnings
async function getEarnings(providerId = null) {
    const rows = await query(`
        SELECT pe.provider_id,
               ROUND(SUM(pe.gross_amount), 2) AS gross_earnings,
               ROUND(SUM(pe.commission_amount), 2) AS platform_commission,
               ROUND(SUM(pe.net_amount), 2) AS net_earnings,
               ROUND(COALESCE(w.committed, 0), 2) AS committed_withdrawals,
               ROUND(SUM(pe.net_amount) - COALESCE(w.committed, 0), 2) AS available_balance
        FROM provider_earnings pe
        LEFT JOIN (
            SELECT provider_id, SUM(amount) AS committed
            FROM withdrawal_requests
            WHERE status IN ('Requested', 'Approved', 'Paid')
            GROUP BY provider_id
        ) w ON w.provider_id = pe.provider_id
        ${providerId === null ? "" : "WHERE pe.provider_id = ?"}
        GROUP BY pe.provider_id, w.committed
        ORDER BY pe.provider_id
    `, providerId === null ? [] : [providerId]);

    return rows.map(row => ({ ...row, currency: "USD" }));
}

async function getEarningsForProvider(providerId) {
    const rows = await getEarnings(providerId);

    return rows[0] || {
        provider_id: providerId,
        gross_earnings: 0,
        platform_commission: 0,
        net_earnings: 0,
        committed_withdrawals: 0,
        available_balance: 0,
        currency: "USD"
    };
}

async function listEarningLines(providerId) {
    return query(`
        SELECT pe.id, pe.payment_id, p.payment_reference,
               pe.gross_amount, pe.commission_rate,
               pe.commission_amount, pe.net_amount, pe.created_at
        FROM provider_earnings pe
        JOIN payments p ON p.id = pe.payment_id
        WHERE pe.provider_id = ?
        ORDER BY pe.id DESC
    `, [providerId]);
}

// Withdrawals
async function listWithdrawals(providerId = null) {
    const rows = await query(`
        SELECT id, provider_id, amount, status, note, created_at, updated_at
        FROM withdrawal_requests
        ${providerId === null ? "" : "WHERE provider_id = ?"}
        ORDER BY id DESC
    `, providerId === null ? [] : [providerId]);

    return rows.map(row => ({ ...row, currency: "USD" }));
}

async function createWithdrawal({ providerId, amount, note }) {
    return withTransaction(async connection => {
        const [[earnings]] = await connection.execute(`
            SELECT COALESCE(SUM(net_amount), 0) AS total
            FROM provider_earnings WHERE provider_id = ? FOR UPDATE
        `, [providerId]);

        const [[withdrawals]] = await connection.execute(`
            SELECT COALESCE(SUM(amount), 0) AS committed
            FROM withdrawal_requests
            WHERE provider_id = ? AND status IN ('Requested', 'Approved', 'Paid')
        `, [providerId]);

        const available = money(Number(earnings.total) - Number(withdrawals.committed));

        if (amount > available)
            throw new HttpError(400, {
                error: "Withdrawal exceeds the available provider balance.",
                available_balance: available
            });

        const [result] = await connection.execute(`
            INSERT INTO withdrawal_requests (provider_id, amount, status, note)
            VALUES (?, ?, 'Requested', ?)
        `, [providerId, amount, note || null]);

        return {
            message: "Withdrawal request created (simulated).",
            withdrawal_id: result.insertId,
            provider_id: providerId,
            amount,
            currency: "USD",
            status: "Requested",
            available_balance_after_request: money(available - amount)
        };
    });
}

// Notifications
async function listNotifications({ recipientType, recipientId, unreadOnly = false }) {
    return query(`
        SELECT id, recipient_type, recipient_id, notification_type,
               title, message, payment_id, refund_id, is_read, created_at
        FROM payment_notifications
        WHERE recipient_type = ? AND recipient_id = ?
        ${unreadOnly ? "AND is_read = 0" : ""}
        ORDER BY created_at DESC, id DESC
    `, [recipientType, recipientId]);
}

async function markNotificationRead(id, recipient = null) {
    const [result] = recipient
        ? await db.execute(`
            UPDATE payment_notifications SET is_read = 1
            WHERE id = ? AND recipient_type = ? AND recipient_id = ?
        `, [id, recipient.type, recipient.id])
        : await db.execute(
            "UPDATE payment_notifications SET is_read = 1 WHERE id = ?",
            [id]
        );

    return result.affectedRows > 0;
}

// Admin dashboard
async function getDashboard() {
    const one = async sql => (await query(sql))[0];

    const [
        invoices, payments, refunds, earnings,
        withdrawals, discounts, notifications, requests
    ] = await Promise.all([
        one(`SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total,
            COALESCE(SUM(CASE WHEN status = 'Paid' THEN total ELSE 0 END), 0) AS paid,
            COALESCE(SUM(CASE WHEN status = 'Unpaid' THEN total ELSE 0 END), 0) AS unpaid
            FROM invoices`),

        one(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
            FROM payments WHERE status IN ('Succeeded', 'Refunded')`),

        one(`SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
            FROM refunds WHERE status = 'Succeeded'`),

        one(`SELECT COALESCE(SUM(gross_amount), 0) AS gross,
            COALESCE(SUM(commission_amount), 0) AS commission,
            COALESCE(SUM(net_amount), 0) AS net FROM provider_earnings`),

        one(`SELECT COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN status IN ('Requested', 'Approved') THEN amount ELSE 0 END), 0) AS pending,
            COALESCE(SUM(CASE WHEN status = 'Requested' THEN 1 ELSE 0 END), 0) AS review,
            COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) AS paid
            FROM withdrawal_requests`),

        one(`SELECT COUNT(*) AS count,
            COALESCE(SUM(used_count), 0) AS redemptions FROM discount_codes`),

        one(`SELECT COUNT(*) AS count,
            COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread
            FROM payment_notifications`),

        one(`SELECT COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS count,
            COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0) AS total
            FROM refund_requests`)
    ]);

    const paid = money(payments.total);
    const refunded = money(refunds.total);

    return {
        currency: "USD",
        invoices: {
            count: Number(invoices.count),
            invoiced_total: money(invoices.total),
            paid_total: money(invoices.paid),
            unpaid_total: money(invoices.unpaid)
        },
        payments: {
            count: Number(payments.count),
            recorded_total: paid
        },
        refunds: {
            count: Number(refunds.count),
            total: refunded
        },
        revenue: {
            customer_payments: paid,
            refunded,
            net_revenue: money(paid - refunded),
            platform_commission: money(earnings.commission)
        },
        earnings: {
            provider_gross: money(earnings.gross),
            platform_commission: money(earnings.commission),
            provider_net: money(earnings.net)
        },
        withdrawals: {
            request_count: Number(withdrawals.count),
            awaiting_review_count: Number(withdrawals.review),
            pending_total: money(withdrawals.pending),
            paid_total: money(withdrawals.paid)
        },
        refund_requests: {
            pending_count: Number(requests.count),
            pending_total: money(requests.total)
        },
        discounts: {
            code_count: Number(discounts.count),
            redemption_count: Number(discounts.redemptions)
        },
        notifications: {
            count: Number(notifications.count),
            unread_count: Number(notifications.unread)
        }
    };
}

module.exports = {
    listPayments,
    deriveAllocations,
    applyRefund,
    listRefunds,
    createRefundRequest,
    listRefundRequests,
    decideRefundRequest,
    getEarnings,
    getEarningsForProvider,
    listEarningLines,
    listWithdrawals,
    createWithdrawal,
    listNotifications,
    markNotificationRead,
    getDashboard
};
