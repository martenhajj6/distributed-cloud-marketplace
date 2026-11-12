const { handle, requireRole } = require("../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../utils/util");
const { bad, cleanText } = require("../../utils/helpers");
const { REFUND_STATUSES } = require("../../utils/constants");
const refund = require("../../BLL/finance/refundService");
const earnings = require("../../BLL/finance/earningsService");
const dashboard = require("../../BLL/finance/dashboardService");

const router = express.Router();
router.use(requireRole("Admin"));

// Refund requests
router.get("/refunds", handle(async (req, res) => {
    const status = req.query.status || null;
    if (status && !REFUND_STATUSES.includes(status)) throw bad("Invalid status.");

    res.json(await refund.listRefundRequests({ status }));
}));

// Approve or reject refund
router.patch("/refunds/:id", handle(async (req, res) => {
    const requestId = positiveInteger(req.params.id);
    const { status, admin_note } = req.body || {};

    if (!requestId || !["Approved", "Rejected"].includes(status))
        throw bad("Invalid ID or status.");

    res.json(await refund.decideRefundRequest({
        requestId, status, adminNote: cleanText(admin_note), admin: req.user
    }));
}));

// Dashboard
router.get("/dashboard", handle(async (req, res) => {
    const [totals, providers] = await Promise.all([dashboard.getDashboard(), earnings.getEarnings()]);
    res.json({ ...totals, providers });
}));

// Audit log
router.get("/audit-log", handle(async (req, res) => {
    const entityId = req.query.entity_id ?? null;
    if (entityId !== null && !positiveInteger(entityId)) throw bad("Invalid entity ID.");

    if (req.query.entity_type !== undefined && typeof req.query.entity_type !== "string")
        throw bad("Invalid entity type.");

    res.json(await dashboard.listAudit({
        limit: Math.min(positiveInteger(req.query.limit) || 50, 200),
        entityType: req.query.entity_type ?? null,
        entityId
    }));
}));

module.exports = router;
