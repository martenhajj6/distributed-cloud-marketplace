// Admin-only routes: /api/admin/... (mounted behind authenticate + requireRole("Admin")).
const express = require("express");
const db = require("../config/db");
const { sendError, positiveInteger, money, logAudit } = require("../utils/util");
const { requireRole } = require("../middleware/access");
const discounts = require("../services/discountService");
const finance = require("../services/financeService");

const router = express.Router();
const discountRouter = express.Router();

// Refund requests from customers. Optional ?status=Pending|Approved|Rejected
router.get("/refunds", async (req, res) => {
  const status = req.query.status === undefined ? null : req.query.status;
  if (status !== null && !["Pending", "Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ error: "status must be Pending, Approved or Rejected." });
  }
  try {
    res.json(await finance.listRefundRequests({ status }));
  } catch (error) {
    return sendError(res, error, "Could not load refund requests.");
  }
});

// Approve or reject a customer's refund request. Body: { status: "Approved" | "Rejected", admin_note? }
// Approving records the refund through the same code as POST /api/finance/refunds.
router.patch("/refunds/:id", async (req, res) => {
  const requestId = positiveInteger(req.params.id);
  const status = req.body.status;
  const adminNote = req.body.admin_note === undefined || req.body.admin_note === null ? null : String(req.body.admin_note).trim().slice(0, 255);
  if (!requestId || !["Approved", "Rejected"].includes(status)) {
    return res.status(400).json({ error: "Provide a valid refund request ID and status: Approved or Rejected." });
  }
  try {
    res.json(await finance.decideRefundRequest({ requestId, status, adminNote, admin: req.user, audit: logAudit }));
  } catch (error) {
    return sendError(res, error, "Could not update refund request.");
  }
});

// Financial dashboard: revenue, commissions, provider earnings, refunds, pending withdrawals, plus one row per provider.
router.get("/dashboard", async (req, res) => {
  try {
    const [totals, providers] = await Promise.all([finance.getDashboard(), finance.getEarnings()]);
    res.json({ ...totals, providers });
  } catch (error) {
    return sendError(res, error, "Could not load the dashboard. Run all SQL scripts through database/migrations/usage_refunds_audit.sql.");
  }
});

// Financial audit log, newest first. Optional ?entity_type=pricing_rule&entity_id=3&limit=50
router.get("/audit-log", async (req, res) => {
  const limit = req.query.limit === undefined ? 50 : Math.min(positiveInteger(req.query.limit) || 50, 200);
  const where = [];
  const params = [];
  if (req.query.entity_type !== undefined) { where.push("entity_type = ?"); params.push(String(req.query.entity_type)); }
  if (req.query.entity_id !== undefined) {
    const entityId = positiveInteger(req.query.entity_id);
    if (!entityId) return res.status(400).json({ error: "entity_id must be a positive integer." });
    where.push("entity_id = ?"); params.push(entityId);
  }
  try {
    const [rows] = await db.query(
      `SELECT id, actor_id, actor_role, action, entity_type, entity_id, details, created_at
       FROM financial_audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""}
       ORDER BY id DESC LIMIT ${limit}`, params
    );
    res.json(rows.map(row => ({ ...row, details: row.details ? JSON.parse(row.details) : null })));
  } catch (error) {
    return sendError(res, error, "Could not load the audit log. Run database/migrations/usage_refunds_audit.sql first.");
  }
});

// Discount routes, formerly routes/discounts.js.
const REASONS = {
  invalid: "This discount code does not exist.", inactive: "This discount code is not active.",
  expired: "This discount code has expired.", limit_reached: "This discount code has reached its usage limit."
};
const SELECT_FIELDS = "id, code, discount_type, discount_value, max_uses, used_count, expires_at, active, created_at";

function validateDefinition(body, partial = false) {
  const out = {};
  if (!partial || body.code !== undefined) {
    const code = discounts.normalizeCode(body.code);
    if (!code || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code)) return { error: "code must be 1–40 characters using letters, numbers, _ or -." };
    out.code = code;
  }
  if (!partial || body.discount_type !== undefined) {
    if (!["Percentage", "Fixed"].includes(body.discount_type)) return { error: "discount_type must be Percentage or Fixed." };
    out.discount_type = body.discount_type;
  }
  if (!partial || body.discount_value !== undefined) {
    const value = Number(body.discount_value);
    if (body.discount_value === "" || !Number.isFinite(value) || value <= 0 || ((out.discount_type || body.discount_type) === "Percentage" && value > 100)) {
      return { error: "discount_value must be positive; Percentage discounts cannot exceed 100." };
    }
    out.discount_value = money(value);
  }
  if (!partial || body.max_uses !== undefined) {
    if (body.max_uses === null || body.max_uses === "") out.max_uses = null;
    else {
      const max = Number(body.max_uses);
      if (!Number.isInteger(max) || max < 1) return { error: "max_uses must be a positive integer or null." };
      out.max_uses = max;
    }
  }
  if (!partial || body.expires_at !== undefined) {
    if (body.expires_at === null || body.expires_at === "") out.expires_at = null;
    else {
      const date = new Date(body.expires_at);
      if (Number.isNaN(date.getTime())) return { error: "expires_at must be a valid date/time or null." };
      out.expires_at = body.expires_at;
    }
  }
  if (body.active !== undefined) {
    if (![true, false, 0, 1].includes(body.active)) return { error: "active must be a boolean." };
    out.active = body.active ? 1 : 0;
  }
  if (partial && !Object.keys(out).length) return { error: "Provide at least one field to update." };
  return { values: out };
}

// Admin: list all codes, including inactive/expired codes.
discountRouter.get("/", requireRole("Admin"), async (req, res) => {
  try {
    const [rows] = await db.execute(`SELECT ${SELECT_FIELDS} FROM discount_codes ORDER BY id DESC`);
    res.json(rows);
  } catch (error) { return sendError(res, error, "Could not load discount codes. Run database/migrations/discounts_notifications_dashboard.sql first."); }
});

// Admin: create a discount code.
discountRouter.post("/", requireRole("Admin"), async (req, res) => {
  const parsed = validateDefinition(req.body || {});
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const v = parsed.values;
  try {
    const [result] = await db.execute(
      "INSERT INTO discount_codes (code, discount_type, discount_value, max_uses, expires_at, active) VALUES (?, ?, ?, ?, ?, ?)",
      [v.code, v.discount_type, v.discount_value, v.max_uses, v.expires_at, v.active === undefined ? 1 : v.active]
    );
    await logAudit(db, req.user, "discount_created", "discount_code", result.insertId, { code: v.code, discount_type: v.discount_type, discount_value: v.discount_value });
    const [rows] = await db.execute(`SELECT ${SELECT_FIELDS} FROM discount_codes WHERE id = ?`, [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That discount code already exists." });
    return sendError(res, error, "Could not create discount code.");
  }
});

// Admin: update code details or deactivate/reactivate it. Redemption count is system-managed.
discountRouter.patch("/:id", requireRole("Admin"), async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ error: "Use a valid discount ID." });
  const parsed = validateDefinition(req.body || {}, true);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const v = parsed.values;
  try {
    const [existing] = await db.execute(`SELECT ${SELECT_FIELDS} FROM discount_codes WHERE id = ?`, [id]);
    if (!existing.length) return res.status(404).json({ error: "Discount code not found." });
    const old = existing[0];
    const nextType = v.discount_type ?? old.discount_type;
    const nextValue = v.discount_value ?? Number(old.discount_value);
    if (nextType === "Percentage" && nextValue > 100) return res.status(400).json({ error: "Percentage discounts cannot exceed 100." });
    const fields = Object.keys(v);
    await db.execute(`UPDATE discount_codes SET ${fields.map(field => `${field} = ?`).join(", ")} WHERE id = ?`, [...fields.map(field => v[field]), id]);
    await logAudit(db, req.user, "discount_updated", "discount_code", id, { changed_fields: fields, before: { code: old.code, active: old.active }, after: v });
    const [rows] = await db.execute(`SELECT ${SELECT_FIELDS} FROM discount_codes WHERE id = ?`, [id]);
    res.json(rows[0]);
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "That discount code already exists." });
    return sendError(res, error, "Could not update discount code.");
  }
});

// Any signed-in user can validate a code; this does not consume a use.
discountRouter.post("/validate", async (req, res) => {
  const code = discounts.normalizeCode(req.body && req.body.code);
  const hasSubtotal = req.body && req.body.subtotal !== undefined && req.body.subtotal !== null;
  const subtotal = hasSubtotal ? money(req.body.subtotal) : null;
  if (!code || code.length > 40 || (hasSubtotal && (!Number.isFinite(Number(req.body.subtotal)) || subtotal < 0))) {
    return res.status(400).json({ error: "Provide a discount code and, optionally, a subtotal of 0 or more." });
  }
  try {
    const discount = await discounts.findByCode(db, code);
    const reason = discount ? discounts.unusableReason(discount) : "invalid";
    if (reason) return res.json({ valid: false, code, reason, message: REASONS[reason] });
    const result = { valid: true, code: discount.code, discount_type: discount.discount_type, discount_value: Number(discount.discount_value), expires_at: discount.expires_at };
    if (subtotal !== null) {
      const discountAmount = discounts.calculateDiscount(discount, subtotal);
      Object.assign(result, { subtotal, discount_amount: discountAmount, total: Math.max(0, money(subtotal - discountAmount)), currency: "USD" });
    }
    res.json(result);
  } catch (error) { return sendError(res, error, "Could not validate discount code. Run database/migrations/discounts_notifications_dashboard.sql first."); }
});

// Export both routers from this file.
// /api/admin remains admin-only; /api/discounts/validate remains available to signed-in users.
router.discountsRouter = discountRouter;
module.exports = router;
