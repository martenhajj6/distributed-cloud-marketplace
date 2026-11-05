// Shared finance logic. The /api/finance (admin), /api/customers/me, /api/providers/me,
// /api/notifications and /api/admin routes all call these functions, so each business rule
// exists in exactly one place.
const crypto = require("crypto");
const db = require("../db");
const { HttpError } = require("./errors");
const { money } = require("./util");
const { withTransaction } = require("./tx");

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
// customerId / invoiceId are optional filters. Customers always pass their own id.
async function listPayments({ invoiceId = null, customerId = null } = {}) {
  const where = [];
  const params = [];
  if (invoiceId !== null) { where.push("p.invoice_id = ?"); params.push(invoiceId); }
  if (customerId !== null) { where.push("bp.customer_id = ?"); params.push(customerId); }
  const [rows] = await db.execute(
    `SELECT p.id, p.payment_reference, p.invoice_id, i.invoice_number, p.amount, p.status, p.simulated, p.created_at
     FROM payments p
     JOIN invoices i ON i.id = p.invoice_id
     JOIN billing_periods bp ON bp.id = i.billing_period_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY p.id DESC`,
    params
  );
  return rows;
}

// When a payment request has no provider_allocations, split the invoice between the providers
// recorded on its lines (usage invoices). Any discount is shared out in proportion, and the last
// cent of rounding goes to the largest share so the allocations add up exactly to the invoice total.
async function deriveAllocations(connection, invoiceId, invoiceTotal) {
  const [rows] = await connection.execute(
    `SELECT provider_id, SUM(line_total) AS gross FROM invoice_items
     WHERE invoice_id = ? AND provider_id IS NOT NULL GROUP BY provider_id ORDER BY provider_id`,
    [invoiceId]
  );
  const [[lineTotals]] = await connection.execute(
    "SELECT COUNT(*) AS line_count, COALESCE(SUM(line_total), 0) AS lines_total FROM invoice_items WHERE invoice_id = ?", [invoiceId]
  );
  const providerSum = money(rows.reduce((sum, row) => sum + Number(row.gross), 0));
  if (rows.length === 0 || providerSum !== money(lineTotals.lines_total)) return null; // manual invoice: caller must send allocations
  const subtotal = providerSum;
  const total = money(invoiceTotal);
  const allocations = rows.map(row => ({
    provider_id: row.provider_id,
    gross_amount: subtotal === 0 ? 0 : money(Number(row.gross) * total / subtotal)
  }));
  const difference = money(total - allocations.reduce((sum, a) => sum + a.gross_amount, 0));
  if (difference !== 0) {
    const largest = allocations.reduce((best, a) => (a.gross_amount > best.gross_amount ? a : best), allocations[0]);
    largest.gross_amount = money(largest.gross_amount + difference);
  }
  return allocations.filter(a => a.gross_amount > 0);
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------
// Records a refund and reduces provider earnings/commission proportionally. Must run inside a
// transaction (pass its connection). Used by POST /api/finance/refunds (admin direct refund) and
// by PATCH /api/admin/refunds/:id (approving a customer's request).
async function applyRefund(connection, { paymentId, amount, reason }) {
  const [paymentRows] = await connection.execute(
    `SELECT p.id, p.amount, p.status, bp.customer_id
     FROM payments p JOIN invoices i ON i.id = p.invoice_id
     JOIN billing_periods bp ON bp.id = i.billing_period_id
     WHERE p.id = ? FOR UPDATE`, [paymentId]
  );
  if (!paymentRows.length) throw new HttpError(404, { error: "Payment not found." });
  const payment = paymentRows[0];
  if (payment.status !== "Succeeded") throw new HttpError(409, { error: "Only successful payments can be refunded." });

  const [refundRows] = await connection.execute("SELECT COALESCE(SUM(amount), 0) AS refunded FROM refunds WHERE payment_id = ?", [paymentId]);
  const remaining = money(Number(payment.amount) - money(refundRows[0].refunded));
  const refundAmount = money(amount);
  if (refundAmount > remaining) {
    throw new HttpError(400, { error: "Refund exceeds the remaining refundable amount.", remaining_refundable: remaining });
  }

  const [earningRows] = await connection.execute(
    "SELECT id, provider_id, gross_amount, commission_amount, net_amount FROM provider_earnings WHERE payment_id = ? FOR UPDATE", [paymentId]
  );
  const ratio = refundAmount / remaining;
  const adjustments = [];
  for (const earning of earningRows) {
    const grossReduction = money(Number(earning.gross_amount) * ratio);
    const commissionReduction = money(Number(earning.commission_amount) * ratio);
    const netReduction = money(Number(earning.net_amount) * ratio);
    // Do not allow a refund to invalidate money already requested, approved, or paid out.
    const [totals] = await connection.execute(
      "SELECT COALESCE(SUM(net_amount), 0) AS lifetime_net FROM provider_earnings WHERE provider_id = ?", [earning.provider_id]
    );
    const [withdrawals] = await connection.execute(
      `SELECT COALESCE(SUM(amount), 0) AS committed
       FROM withdrawal_requests WHERE provider_id = ? AND status IN ('Requested', 'Approved', 'Paid')`, [earning.provider_id]
    );
    const newLifetimeNet = money(Number(totals[0].lifetime_net) - netReduction);
    if (newLifetimeNet < money(withdrawals[0].committed)) {
      throw new HttpError(409, { error: `Refund would conflict with existing withdrawals for provider ${earning.provider_id}.` });
    }
    await connection.execute(
      `UPDATE provider_earnings
       SET gross_amount = gross_amount - ?, commission_amount = commission_amount - ?, net_amount = net_amount - ?
       WHERE id = ?`,
      [grossReduction, commissionReduction, netReduction, earning.id]
    );
    adjustments.push({ provider_id: earning.provider_id, gross_reduction: grossReduction, commission_reduction: commissionReduction, net_reduction: netReduction });
  }

  const refundReference = `REF-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const [refundResult] = await connection.execute(
    "INSERT INTO refunds (refund_reference, payment_id, amount, reason, status) VALUES (?, ?, ?, ?, 'Succeeded')",
    [refundReference, paymentId, refundAmount, reason || null]
  );
  if (refundAmount === remaining) await connection.execute("UPDATE payments SET status = 'Refunded' WHERE id = ?", [paymentId]);
  await connection.execute(
    `INSERT INTO payment_notifications
     (recipient_type, recipient_id, notification_type, title, message, payment_id, refund_id)
     VALUES ('Customer', ?, 'RefundSucceeded', 'Refund processed', ?, ?, ?)`,
    [payment.customer_id, `Refund ${refundReference} succeeded for $${refundAmount.toFixed(2)}.`, paymentId, refundResult.insertId]
  );
  for (const adjustment of adjustments) {
    await connection.execute(
      `INSERT INTO payment_notifications
       (recipient_type, recipient_id, notification_type, title, message, payment_id, refund_id)
       VALUES ('Provider', ?, 'RefundSucceeded', 'Earnings adjusted', ?, ?, ?)`,
      [adjustment.provider_id, `Refund ${refundReference} reduced your net earnings by $${adjustment.net_reduction.toFixed(2)}.`, paymentId, refundResult.insertId]
    );
  }
  return {
    refund_id: refundResult.insertId,
    refund_reference: refundReference,
    payment_id: paymentId,
    amount: refundAmount,
    remaining_refundable: money(remaining - refundAmount),
    status: "Succeeded",
    provider_adjustments: adjustments
  };
}

async function listRefunds({ paymentId = null } = {}) {
  const [rows] = paymentId
    ? await db.execute("SELECT id, refund_reference, payment_id, amount, reason, status, created_at FROM refunds WHERE payment_id = ? ORDER BY id DESC", [paymentId])
    : await db.execute("SELECT id, refund_reference, payment_id, amount, reason, status, created_at FROM refunds ORDER BY id DESC");
  return rows;
}

// Customer asks for a refund. Nothing is refunded until an admin approves.
async function createRefundRequest({ customerId, paymentId, amount, reason }) {
  return withTransaction(async connection => {
    const [paymentRows] = await connection.execute(
      `SELECT p.id, p.amount, p.status, p.payment_reference
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       JOIN billing_periods bp ON bp.id = i.billing_period_id
       WHERE p.id = ? AND bp.customer_id = ? FOR UPDATE`, [paymentId, customerId]
    );
    // Same answer for "does not exist" and "belongs to someone else", so ids cannot be probed.
    if (!paymentRows.length) throw new HttpError(404, { error: "Payment not found." });
    const payment = paymentRows[0];
    if (payment.status !== "Succeeded") throw new HttpError(409, { error: "Only successful payments can be refunded." });

    const [[refunded]] = await connection.execute("SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE payment_id = ?", [paymentId]);
    const [[pending]] = await connection.execute(
      "SELECT COALESCE(SUM(amount), 0) AS total FROM refund_requests WHERE payment_id = ? AND status = 'Pending'", [paymentId]
    );
    const available = money(Number(payment.amount) - money(refunded.total) - money(pending.total));
    const requested = amount === undefined || amount === null ? available : money(amount);
    if (requested <= 0 || requested > available) {
      throw new HttpError(400, { error: "Requested amount exceeds the amount still available to refund (pending requests are counted).", available_to_request: Math.max(0, available) });
    }

    const [result] = await connection.execute(
      "INSERT INTO refund_requests (payment_id, customer_id, amount, reason, status) VALUES (?, ?, ?, ?, 'Pending')",
      [paymentId, customerId, requested, reason]
    );
    await connection.execute(
      `INSERT INTO payment_notifications
       (recipient_type, recipient_id, notification_type, title, message, payment_id)
       VALUES ('Customer', ?, 'RefundRequested', 'Refund requested', ?, ?)`,
      [customerId, `Your refund request #${result.insertId} for $${requested.toFixed(2)} on payment ${payment.payment_reference} is waiting for review.`, paymentId]
    );
    return { refund_request_id: result.insertId, payment_id: paymentId, amount: requested, reason, status: "Pending", currency: "USD" };
  });
}

const REFUND_REQUEST_COLUMNS = `id, payment_id, customer_id, amount, reason, status, admin_note, decided_by, decided_at, refund_id, created_at`;

async function listRefundRequests({ customerId = null, status = null } = {}) {
  const where = [];
  const params = [];
  if (customerId !== null) { where.push("customer_id = ?"); params.push(customerId); }
  if (status !== null) { where.push("status = ?"); params.push(status); }
  const [rows] = await db.execute(
    `SELECT ${REFUND_REQUEST_COLUMNS} FROM refund_requests ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC`, params
  );
  return rows.map(row => ({ ...row, currency: "USD" }));
}

// Admin decision. On "Approved" the refund is created by applyRefund(), the same code as a direct refund.
// If applyRefund fails (for example a provider already withdrew the money) the whole decision is
// rolled back and the request stays Pending.
async function decideRefundRequest({ requestId, status, adminNote, admin, audit }) {
  return withTransaction(async connection => {
    const [rows] = await connection.execute(
      `SELECT ${REFUND_REQUEST_COLUMNS} FROM refund_requests WHERE id = ? FOR UPDATE`, [requestId]
    );
    if (!rows.length) throw new HttpError(404, { error: "Refund request not found." });
    const request = rows[0];
    if (request.status !== "Pending") {
      throw new HttpError(409, { error: `This refund request was already ${request.status.toLowerCase()}.`, status: request.status });
    }

    let refund = null;
    if (status === "Approved") {
      refund = await applyRefund(connection, {
        paymentId: request.payment_id,
        amount: Number(request.amount),
        reason: request.reason
      });
    } else {
      await connection.execute(
        `INSERT INTO payment_notifications
         (recipient_type, recipient_id, notification_type, title, message, payment_id)
         VALUES ('Customer', ?, 'RefundRejected', 'Refund request rejected', ?, ?)`,
        [request.customer_id, `Your refund request #${request.id} for $${money(request.amount).toFixed(2)} was rejected.${adminNote ? " Note: " + adminNote : ""}`, request.payment_id]
      );
    }
    await connection.execute(
      `UPDATE refund_requests
       SET status = ?, admin_note = ?, decided_by = ?, decided_at = NOW(), refund_id = ? WHERE id = ?`,
      [status, adminNote || null, admin.id, refund ? refund.refund_id : null, requestId]
    );
    await audit(connection, admin, status === "Approved" ? "REFUND_REQUEST_APPROVED" : "REFUND_REQUEST_REJECTED", "refund_request", requestId, {
      payment_id: request.payment_id, customer_id: request.customer_id, amount: money(request.amount),
      admin_note: adminNote || null, refund_id: refund ? refund.refund_id : null
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

// ---------------------------------------------------------------------------
// Provider earnings and withdrawals
// ---------------------------------------------------------------------------
async function getEarnings(providerId = null) {
  const [rows] = await db.execute(
    `SELECT pe.provider_id,
            ROUND(SUM(pe.gross_amount), 2) AS gross_earnings,
            ROUND(SUM(pe.commission_amount), 2) AS platform_commission,
            ROUND(SUM(pe.net_amount), 2) AS net_earnings,
            ROUND(COALESCE(w.committed, 0), 2) AS committed_withdrawals,
            ROUND(SUM(pe.net_amount) - COALESCE(w.committed, 0), 2) AS available_balance
     FROM provider_earnings pe
     LEFT JOIN (
       SELECT provider_id, SUM(amount) AS committed
       FROM withdrawal_requests WHERE status IN ('Requested', 'Approved', 'Paid') GROUP BY provider_id
     ) w ON w.provider_id = pe.provider_id
     ${providerId === null ? "" : "WHERE pe.provider_id = ?"}
     GROUP BY pe.provider_id, w.committed ORDER BY pe.provider_id`,
    providerId === null ? [] : [providerId]
  );
  return rows.map(row => ({ ...row, currency: "USD" }));
}

// A provider with no earnings yet gets zeros instead of an empty list.
async function getEarningsForProvider(providerId) {
  const rows = await getEarnings(providerId);
  return rows[0] || {
    provider_id: providerId, gross_earnings: 0, platform_commission: 0, net_earnings: 0,
    committed_withdrawals: 0, available_balance: 0, currency: "USD"
  };
}

async function listEarningLines(providerId) {
  const [rows] = await db.execute(
    `SELECT pe.id, pe.payment_id, p.payment_reference, pe.gross_amount, pe.commission_rate,
            pe.commission_amount, pe.net_amount, pe.created_at
     FROM provider_earnings pe JOIN payments p ON p.id = pe.payment_id
     WHERE pe.provider_id = ? ORDER BY pe.id DESC`, [providerId]
  );
  return rows;
}

async function listWithdrawals(providerId = null) {
  const [rows] = providerId
    ? await db.execute("SELECT id, provider_id, amount, status, note, created_at, updated_at FROM withdrawal_requests WHERE provider_id = ? ORDER BY id DESC", [providerId])
    : await db.execute("SELECT id, provider_id, amount, status, note, created_at, updated_at FROM withdrawal_requests ORDER BY id DESC");
  return rows.map(row => ({ ...row, currency: "USD" }));
}

async function createWithdrawal({ providerId, amount, note }) {
  return withTransaction(async connection => {
    // FOR UPDATE on the earnings rows makes two simultaneous requests wait for each other,
    // so a provider cannot withdraw the same balance twice.
    const [earnings] = await connection.execute(
      "SELECT COALESCE(SUM(net_amount), 0) AS total FROM provider_earnings WHERE provider_id = ? FOR UPDATE", [providerId]
    );
    const [withdrawals] = await connection.execute(
      "SELECT COALESCE(SUM(amount), 0) AS committed FROM withdrawal_requests WHERE provider_id = ? AND status IN ('Requested', 'Approved', 'Paid')", [providerId]
    );
    const available = money(Number(earnings[0].total) - Number(withdrawals[0].committed));
    if (amount > available) {
      throw new HttpError(400, { error: "Withdrawal exceeds the available provider balance.", available_balance: available });
    }
    const [result] = await connection.execute(
      "INSERT INTO withdrawal_requests (provider_id, amount, status, note) VALUES (?, ?, 'Requested', ?)",
      [providerId, amount, note || null]
    );
    return {
      message: "Withdrawal request created (simulated).",
      withdrawal_id: result.insertId, provider_id: providerId, amount, currency: "USD",
      status: "Requested", available_balance_after_request: money(available - amount)
    };
  });
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
async function listNotifications({ recipientType, recipientId, unreadOnly = false }) {
  const [rows] = await db.execute(
    `SELECT id, recipient_type, recipient_id, notification_type, title, message, payment_id, refund_id, is_read, created_at
     FROM payment_notifications WHERE recipient_type = ? AND recipient_id = ? ${unreadOnly ? "AND is_read = 0" : ""}
     ORDER BY created_at DESC, id DESC`, [recipientType, recipientId]
  );
  return rows;
}

// recipient given = only that user's own notification can be changed.
async function markNotificationRead(id, recipient = null) {
  const [result] = recipient
    ? await db.execute(
        "UPDATE payment_notifications SET is_read = 1 WHERE id = ? AND recipient_type = ? AND recipient_id = ?",
        [id, recipient.type, recipient.id]
      )
    : await db.execute("UPDATE payment_notifications SET is_read = 1 WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

// ---------------------------------------------------------------------------
// Dashboard (admin)
// ---------------------------------------------------------------------------
async function getDashboard() {
  const one = async sql => (await db.execute(sql))[0][0];
  const invoiceTotals = await one(
    `SELECT COUNT(*) AS invoice_count,
            COALESCE(SUM(total), 0) AS invoiced_total,
            COALESCE(SUM(CASE WHEN status = 'Paid' THEN total ELSE 0 END), 0) AS paid_invoice_total,
            COALESCE(SUM(CASE WHEN status = 'Unpaid' THEN total ELSE 0 END), 0) AS unpaid_invoice_total
     FROM invoices`);
  const paymentTotals = await one(
    `SELECT COUNT(*) AS payment_count, COALESCE(SUM(amount), 0) AS successful_payment_total
     FROM payments WHERE status IN ('Succeeded', 'Refunded')`);
  const refundTotals = await one(
    "SELECT COUNT(*) AS refund_count, COALESCE(SUM(amount), 0) AS refund_total FROM refunds WHERE status = 'Succeeded'");
  const earningsTotals = await one(
    `SELECT COALESCE(SUM(gross_amount), 0) AS provider_gross_earnings,
            COALESCE(SUM(commission_amount), 0) AS platform_commission,
            COALESCE(SUM(net_amount), 0) AS provider_net_earnings
     FROM provider_earnings`);
  const withdrawalTotals = await one(
    `SELECT COUNT(*) AS withdrawal_request_count,
            COALESCE(SUM(CASE WHEN status IN ('Requested', 'Approved') THEN amount ELSE 0 END), 0) AS pending_withdrawal_total,
            COALESCE(SUM(CASE WHEN status = 'Requested' THEN 1 ELSE 0 END), 0) AS awaiting_review_count,
            COALESCE(SUM(CASE WHEN status = 'Paid' THEN amount ELSE 0 END), 0) AS paid_withdrawal_total
     FROM withdrawal_requests`);
  const discountTotals = await one(
    "SELECT COUNT(*) AS discount_code_count, COALESCE(SUM(used_count), 0) AS discount_redemption_count FROM discount_codes");
  const notificationTotals = await one(
    `SELECT COUNT(*) AS notification_count,
            COALESCE(SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END), 0) AS unread_notification_count
     FROM payment_notifications`);
  const refundRequestTotals = await one(
    `SELECT COALESCE(SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END), 0) AS pending_count,
            COALESCE(SUM(CASE WHEN status = 'Pending' THEN amount ELSE 0 END), 0) AS pending_total
     FROM refund_requests`);

  const paymentsTotal = money(paymentTotals.successful_payment_total);
  const refundsTotal = money(refundTotals.refund_total);
  return {
    currency: "USD",
    invoices: { count: Number(invoiceTotals.invoice_count), invoiced_total: money(invoiceTotals.invoiced_total), paid_total: money(invoiceTotals.paid_invoice_total), unpaid_total: money(invoiceTotals.unpaid_invoice_total) },
    payments: { count: Number(paymentTotals.payment_count), recorded_total: paymentsTotal },
    refunds: { count: Number(refundTotals.refund_count), total: refundsTotal },
    // Revenue: what customers paid, minus what was given back. platform_commission is the marketplace's own cut.
    revenue: { customer_payments: paymentsTotal, refunded: refundsTotal, net_revenue: money(paymentsTotal - refundsTotal), platform_commission: money(earningsTotals.platform_commission) },
    earnings: { provider_gross: money(earningsTotals.provider_gross_earnings), platform_commission: money(earningsTotals.platform_commission), provider_net: money(earningsTotals.provider_net_earnings) },
    withdrawals: { request_count: Number(withdrawalTotals.withdrawal_request_count), awaiting_review_count: Number(withdrawalTotals.awaiting_review_count), pending_total: money(withdrawalTotals.pending_withdrawal_total), paid_total: money(withdrawalTotals.paid_withdrawal_total) },
    refund_requests: { pending_count: Number(refundRequestTotals.pending_count), pending_total: money(refundRequestTotals.pending_total) },
    discounts: { code_count: Number(discountTotals.discount_code_count), redemption_count: Number(discountTotals.discount_redemption_count) },
    notifications: { count: Number(notificationTotals.notification_count), unread_count: Number(notificationTotals.unread_notification_count) }
  };
}

module.exports = {
  listPayments, deriveAllocations,
  applyRefund, listRefunds, createRefundRequest, listRefundRequests, decideRefundRequest,
  getEarnings, getEarningsForProvider, listEarningLines, listWithdrawals, createWithdrawal,
  listNotifications, markNotificationRead, getDashboard
};
