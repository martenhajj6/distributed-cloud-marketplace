// Administrative operations and reporting routes.
const express = require("express");
const db = require("../db");
const { sendError } = require("../services/errors");
const { positiveInteger } = require("../services/util");
const { logAudit } = require("../services/audit");
const finance = require("../services/financeService");

const router = express.Router();

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
    res.json(await finance.decideRefundRequest({ requestId, status, adminNote, admin: req.context, audit: logAudit }));
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
    return sendError(res, error, "Could not load the dashboard. Run all SQL scripts through sql/usage_refunds_audit.sql.");
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
    return sendError(res, error, "Could not load the audit log. Run sql/usage_refunds_audit.sql first.");
  }
});

module.exports = router;
