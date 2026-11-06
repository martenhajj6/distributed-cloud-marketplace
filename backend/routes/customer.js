
const express = require("express");
const db = require("../dbconn");
const { sendError, positiveInteger } = require("../utils/util");
const billing = require("../services/billingService");
const finance = require("../services/financeService");

const router = express.Router();
const notificationsRouter = express.Router();

const handle = (fn, message) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        sendError(res, error, message);
    }
};

const recipientType = role => ["Customer", "Provider"].includes(role) ? role : null;

// Customer invoices
router.get("/invoices", handle(async (req, res) => {
    res.json(await billing.listInvoices(db, req.user.id));
}, "Could not load your invoices."));

router.get("/invoices/:id", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid invoice ID." });

    const invoice = await billing.getInvoice(db, id, req.user.id);
    if (!invoice) return res.status(404).json({ error: "Invoice not found." });

    invoice.items = invoice.items.map(({ provider_id, ...item }) => item);
    res.json(invoice);
}, "Could not load your invoice."));

// Customer payments
router.get("/payments", handle(async (req, res) => {
    res.json(await finance.listPayments({ customerId: req.user.id }));
}, "Could not load your payments."));

// Request refund
router.post("/refunds", handle(async (req, res) => {
    const paymentId = positiveInteger(req.body.payment_id);
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    const hasAmount = req.body.amount != null;
    const amount = hasAmount ? Number(req.body.amount) : undefined;

    if (!paymentId || reason.length < 3 || reason.length > 255 ||
        (hasAmount && (!Number.isFinite(amount) || amount <= 0)))
        return res.status(400).json({ error: "Invalid payment ID, reason, or amount." });

    const request = await finance.createRefundRequest({
        customerId: req.user.id,
        paymentId,
        amount,
        reason
    });

    res.status(201).json({
        message: "Refund request submitted. An administrator will review it.",
        ...request
    });
}, "Could not submit refund request."));

// List refund requests
router.get("/refunds", handle(async (req, res) => {
    const rows = await finance.listRefundRequests({ customerId: req.user.id });
    res.json(rows.map(({ decided_by, ...row }) => row));
}, "Could not load your refund requests."));

// Notifications
notificationsRouter.get("/", handle(async (req, res) => {
    const type = recipientType(req.user.role);
    if (!type) return res.json([]);

    res.json(await finance.listNotifications({
        recipientType: type,
        recipientId: req.user.id,
        unreadOnly: req.query.unread_only === "true"
    }));
}, "Could not load notifications."));

// Mark notification as read
notificationsRouter.patch("/:id/read", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid notification ID." });

    const type = recipientType(req.user.role);
    if (!type || !(await finance.markNotificationRead(id, {
        type,
        id: req.user.id
    }))) {
        return res.status(404).json({ error: "Notification not found." });
    }

    res.json({ message: "Notification marked as read.", id, is_read: true });
}, "Could not update notification."));

router.notificationsRouter = notificationsRouter;
module.exports = router;
