// Finance operations and reporting routes.
// The business rules live in services/financeService.js and are shared with the
// customer, provider, notification and admin routes.
const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { HttpError, sendError } = require("../services/errors");
const { money, positiveInteger } = require("../services/util");
const { withTransaction } = require("../services/tx");
const { logAudit } = require("../services/audit");
const finance = require("../services/financeService");

const router = express.Router();
const commissionRate = Number(process.env.PLATFORM_COMMISSION_RATE ?? 15);

// Simulate a successful payment and allocate its value to providers.
// provider_allocations gross amounts must add up to the invoice total. For usage-based invoices
// the allocations can be left out: they are taken from the provider recorded on each invoice line.
router.post("/payments", async (req, res) => {
  const invoiceId = positiveInteger(req.body.invoice_id);
  const allocations = req.body.provider_allocations;
  const hasAllocations = allocations !== undefined && allocations !== null;

  if (!invoiceId || (hasAllocations && (!Array.isArray(allocations) || allocations.length === 0))) {
    return res.status(400).json({ error: "Provide invoice_id and a non-empty provider_allocations array (or omit provider_allocations for a usage-based invoice)." });
  }
  if (!Number.isFinite(commissionRate) || commissionRate < 0 || commissionRate > 100) {
    return res.status(500).json({ error: "PLATFORM_COMMISSION_RATE must be between 0 and 100." });
  }

  let normalized = [];
  if (hasAllocations) {
    for (const item of allocations) {
      const providerId = positiveInteger(item.provider_id);
      const grossAmount = Number(item.gross_amount);
      if (!providerId || !Number.isFinite(grossAmount) || grossAmount <= 0) {
        return res.status(400).json({ error: "Each allocation needs a positive provider_id and gross_amount." });
      }
      if (normalized.some(row => row.provider_id === providerId)) {
        return res.status(400).json({ error: "Each provider_id can appear only once per payment." });
      }
      normalized.push({ provider_id: providerId, gross_amount: money(grossAmount) });
    }
  }

  try {
    const result = await withTransaction(async connection => {
      const [invoiceRows] = await connection.execute(
        `SELECT i.id, i.total, i.status, bp.customer_id
         FROM invoices i JOIN billing_periods bp ON bp.id = i.billing_period_id
         WHERE i.id = ? FOR UPDATE`, [invoiceId]
      );
      if (!invoiceRows.length) throw new HttpError(404, { error: "Invoice not found." });
      const invoice = invoiceRows[0];
      if (invoice.status !== "Unpaid") {
        throw new HttpError(409, { error: "Only unpaid invoices can be paid.", invoice_status: invoice.status });
      }

      if (!hasAllocations) {
        normalized = await finance.deriveAllocations(connection, invoiceId, invoice.total);
        if (!normalized || normalized.length === 0) {
          throw new HttpError(400, { error: "This invoice has no provider information, so provider_allocations are required." });
        }
      }
      const allocationTotal = money(normalized.reduce((sum, item) => sum + item.gross_amount, 0));
      if (allocationTotal !== money(invoice.total)) {
        throw new HttpError(400, { error: "Provider allocations must add up exactly to the invoice total.", invoice_total: money(invoice.total), allocation_total: allocationTotal });
      }

      const paymentReference = `PAY-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      const [paymentResult] = await connection.execute(
        "INSERT INTO payments (payment_reference, invoice_id, amount, status, simulated) VALUES (?, ?, ?, 'Succeeded', 1)",
        [paymentReference, invoiceId, allocationTotal]
      );
      const earnings = [];
      for (const allocation of normalized) {
        const commissionAmount = money(allocation.gross_amount * commissionRate / 100);
        const netAmount = money(allocation.gross_amount - commissionAmount);
        await connection.execute(
          `INSERT INTO provider_earnings
           (payment_id, provider_id, gross_amount, commission_rate, commission_amount, net_amount)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [paymentResult.insertId, allocation.provider_id, allocation.gross_amount, commissionRate, commissionAmount, netAmount]
        );
        earnings.push({ ...allocation, commission_rate: commissionRate, commission_amount: commissionAmount, net_amount: netAmount });
      }
      await connection.execute("UPDATE invoices SET status = 'Paid' WHERE id = ?", [invoiceId]);
      await connection.execute(
        `INSERT INTO payment_notifications
         (recipient_type, recipient_id, notification_type, title, message, payment_id)
         VALUES ('Customer', ?, 'PaymentSucceeded', 'Payment successful', ?, ?)`,
        [invoice.customer_id, `Payment ${paymentReference} succeeded for $${allocationTotal.toFixed(2)}.`, paymentResult.insertId]
      );
      for (const allocation of normalized) {
        await connection.execute(
          `INSERT INTO payment_notifications
           (recipient_type, recipient_id, notification_type, title, message, payment_id)
           VALUES ('Provider', ?, 'PaymentSucceeded', 'Earnings recorded', ?, ?)`,
          [allocation.provider_id, `Payment ${paymentReference} recorded. Your net earnings are $${money(allocation.gross_amount * (1 - commissionRate / 100)).toFixed(2)}.`, paymentResult.insertId]
        );
      }
      return {
        message: "Simulated payment successful; no real money was charged.",
        payment_id: paymentResult.insertId,
        payment_reference: paymentReference,
        invoice_id: invoiceId,
        amount: allocationTotal,
        currency: "USD",
        status: "Succeeded",
        platform_commission_rate: commissionRate,
        provider_earnings: earnings
      };
    });
    return res.status(201).json(result);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "This invoice already has a payment." });
    return sendError(res, error, "Could not simulate payment. Run sql/03_create_finance_tables.sql first.");
  }
});

router.get("/payments", async (req, res) => {
  const invoiceId = req.query.invoice_id === undefined ? null : positiveInteger(req.query.invoice_id);
  if (req.query.invoice_id !== undefined && !invoiceId) return res.status(400).json({ error: "invoice_id must be a positive integer." });
  try {
    res.json(await finance.listPayments({ invoiceId }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load payments." });
  }
});

// Record a simulated full or partial refund directly (admin). Customers use
// POST /api/customers/me/refunds and an admin approves it with PATCH /api/admin/refunds/:id.
router.post("/refunds", async (req, res) => {
  const paymentId = positiveInteger(req.body.payment_id);
  const amount = Number(req.body.amount);
  const reason = req.body.reason === undefined ? null : String(req.body.reason).trim().slice(0, 255);
  if (!paymentId || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: "Provide a positive payment_id and refund amount." });
  }
  try {
    const refund = await withTransaction(async connection => {
      const created = await finance.applyRefund(connection, { paymentId, amount, reason });
      await logAudit(connection, req.context, "REFUND_RECORDED_BY_ADMIN", "refund", created.refund_id, { payment_id: paymentId, amount: created.amount, reason });
      return created;
    });
    return res.status(201).json({ message: "Simulated refund recorded; no real money was transferred.", ...refund });
  } catch (error) {
    return sendError(res, error, "Could not record refund. Run sql/03_create_finance_tables.sql first.");
  }
});

router.get("/refunds", async (req, res) => {
  const paymentId = req.query.payment_id === undefined ? null : positiveInteger(req.query.payment_id);
  if (req.query.payment_id !== undefined && !paymentId) return res.status(400).json({ error: "payment_id must be a positive integer." });
  try {
    res.json(await finance.listRefunds({ paymentId }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load refunds." });
  }
});

// Provider earnings summary, including gross sales, platform commission, net earnings and available balance.
router.get("/earnings", async (req, res) => {
  const providerId = req.query.provider_id === undefined ? null : positiveInteger(req.query.provider_id);
  if (req.query.provider_id !== undefined && !providerId) return res.status(400).json({ error: "provider_id must be a positive integer." });
  try {
    res.json(await finance.getEarnings(providerId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not calculate provider earnings." });
  }
});

router.get("/withdrawals", async (req, res) => {
  const providerId = req.query.provider_id === undefined ? null : positiveInteger(req.query.provider_id);
  if (req.query.provider_id !== undefined && !providerId) return res.status(400).json({ error: "provider_id must be a positive integer." });
  try {
    res.json(await finance.listWithdrawals(providerId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load withdrawal requests." });
  }
});

router.post("/withdrawals", async (req, res) => {
  const providerId = positiveInteger(req.body.provider_id);
  const amount = money(req.body.amount);
  const note = req.body.note === undefined ? null : String(req.body.note).trim().slice(0, 255);
  if (!providerId || !Number.isFinite(Number(req.body.amount)) || amount <= 0) {
    return res.status(400).json({ error: "Provide a positive provider_id and withdrawal amount." });
  }
  try {
    return res.status(201).json(await finance.createWithdrawal({ providerId, amount, note }));
  } catch (error) {
    return sendError(res, error, "Could not create withdrawal request.");
  }
});

// Admin review of a withdrawal request (simulated). Every decision is written to the audit log.
router.patch("/withdrawals/:id", async (req, res) => {
  const withdrawalId = positiveInteger(req.params.id);
  const status = req.body.status;
  if (!withdrawalId || !["Approved", "Rejected", "Paid"].includes(status)) {
    return res.status(400).json({ error: "Provide a valid withdrawal ID and status: Approved, Rejected, or Paid." });
  }
  try {
    const result = await withTransaction(async connection => {
      const [rows] = await connection.execute("SELECT id, provider_id, amount, status FROM withdrawal_requests WHERE id = ? FOR UPDATE", [withdrawalId]);
      if (!rows.length) throw new HttpError(404, { error: "Withdrawal request not found." });
      const current = rows[0].status;
      const allowed = (current === "Requested" && ["Approved", "Rejected"].includes(status)) || (current === "Approved" && ["Paid", "Rejected"].includes(status));
      if (!allowed) throw new HttpError(409, { error: `Cannot change withdrawal status from ${current} to ${status}.` });
      await connection.execute("UPDATE withdrawal_requests SET status = ? WHERE id = ?", [status, withdrawalId]);
      await logAudit(connection, req.context, `WITHDRAWAL_${status.toUpperCase()}`, "withdrawal", withdrawalId, {
        provider_id: rows[0].provider_id, amount: money(rows[0].amount), previous_status: current
      });
      return { message: "Withdrawal status updated (simulated).", withdrawal_id: withdrawalId, previous_status: current, status };
    });
    res.json(result);
  } catch (error) {
    return sendError(res, error, "Could not update withdrawal status.");
  }
});

// Create a discount code (admin).
router.post("/discount-codes", async (req, res) => {
  const code = typeof req.body.code === "string" ? req.body.code.trim().toUpperCase() : "";
  const discountType = req.body.discount_type;
  const discountValue = money(req.body.discount_value);
  const maxUses = req.body.max_uses === undefined || req.body.max_uses === null || req.body.max_uses === ""
    ? null : positiveInteger(req.body.max_uses);
  const expiresAt = req.body.expires_at || null;
  if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !["Percentage", "Fixed"].includes(discountType) ||
      !Number.isFinite(Number(req.body.discount_value)) || discountValue <= 0 ||
      (discountType === "Percentage" && discountValue > 100) ||
      (req.body.max_uses !== undefined && req.body.max_uses !== null && req.body.max_uses !== "" && !maxUses) ||
      (expiresAt && Number.isNaN(Date.parse(expiresAt)))) {
    return res.status(400).json({ error: "Provide code (3-40 letters/numbers/_/-), discount_type (Percentage or Fixed), valid discount_value, optional positive max_uses, and optional valid expires_at." });
  }
  try {
    const created = await withTransaction(async connection => {
      const [result] = await connection.execute(
        `INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, expires_at, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [code, discountType, discountValue, maxUses, expiresAt]
      );
      await logAudit(connection, req.context, "DISCOUNT_CODE_CREATED", "discount_code", result.insertId, { code, discount_type: discountType, discount_value: discountValue, max_uses: maxUses, expires_at: expiresAt });
      return result.insertId;
    });
    res.status(201).json({ message: "Discount code created.", id: created, code, discount_type: discountType, discount_value: discountValue, max_uses: maxUses, expires_at: expiresAt, active: true });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That discount code already exists." });
    return sendError(res, error, "Could not create discount code. Run sql/04_discounts_notifications_dashboard.sql first.");
  }
});

router.get("/discount-codes", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, code, discount_type, discount_value, max_uses, used_count, expires_at, active, created_at
       FROM discount_codes ORDER BY id DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load discount codes." });
  }
});

router.patch("/discount-codes/:id", async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id || typeof req.body.active !== "boolean") return res.status(400).json({ error: "Provide a valid code ID and boolean active value." });
  try {
    await withTransaction(async connection => {
      const [result] = await connection.execute("UPDATE discount_codes SET active = ? WHERE id = ?", [req.body.active, id]);
      if (!result.affectedRows) throw new HttpError(404, { error: "Discount code not found." });
      await logAudit(connection, req.context, req.body.active ? "DISCOUNT_CODE_ACTIVATED" : "DISCOUNT_CODE_DEACTIVATED", "discount_code", id, {});
    });
    res.json({ message: "Discount code status updated.", id, active: req.body.active });
  } catch (error) {
    return sendError(res, error, "Could not update discount code.");
  }
});

// Admin view of any customer's or provider's notifications (the users themselves use /api/notifications).
router.get("/notifications", async (req, res) => {
  const recipientType = req.query.recipient_type;
  const recipientId = positiveInteger(req.query.recipient_id);
  const unreadOnly = req.query.unread_only === "true";
  if (!recipientType || !["Customer", "Provider"].includes(recipientType) || !recipientId) {
    return res.status(400).json({ error: "Provide recipient_type (Customer or Provider) and positive recipient_id." });
  }
  try {
    res.json(await finance.listNotifications({ recipientType, recipientId, unreadOnly }));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load notifications. Run sql/04_discounts_notifications_dashboard.sql first." });
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ error: "Use a valid notification ID." });
  try {
    if (!(await finance.markNotificationRead(id))) return res.status(404).json({ error: "Notification not found." });
    res.json({ message: "Notification marked as read.", id, is_read: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not update notification." });
  }
});

// Aggregated dashboard totals; values are simulated financial records, not bank balances.
// (GET /api/admin/dashboard returns the same data plus a per-provider breakdown.)
router.get("/dashboard", async (req, res) => {
  try {
    res.json(await finance.getDashboard());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Could not load dashboard totals. Run all SQL scripts through sql/usage_refunds_audit.sql." });
  }
});

module.exports = router;
