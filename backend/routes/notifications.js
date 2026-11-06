const express = require("express");
const { positiveInteger } = require("../utils/util");
const { handle, bad, notFound } = require("../utils/helpers");
const notifications = require("../services/notificationService");

const router = express.Router();
const RECIPIENTS = ["Customer", "Provider"];

// Admins pick the recipient via query; everyone else sees only their own
const scope = req => req.user.role === "Admin"
    ? { type: req.query.recipient_type, id: positiveInteger(req.query.recipient_id) }
    : { type: req.user.role, id: req.user.id };

router.get("/", handle(async (req, res) => {
    const { type, id } = scope(req);

    if (!RECIPIENTS.includes(type) || !id) {
        if (req.user.role === "Admin") throw bad("Invalid recipient type or ID.");
        return res.json([]);
    }

    res.json(await notifications.listNotifications({
        recipientType: type,
        recipientId: id,
        unreadOnly: req.query.unread_only === "true"
    }));
}, "Could not load notifications."));

router.patch("/:id/read", handle(async (req, res) => {
    const id = positiveInteger(req.params.id);
    if (!id) throw bad("Invalid notification ID.");

    const isAdmin = req.user.role === "Admin";
    const { type, id: recipientId } = scope(req);

    if (!isAdmin && !RECIPIENTS.includes(type)) throw notFound("Notification not found.");

    if (!(await notifications.markNotificationRead(id, isAdmin ? null : { type, id: recipientId })))
        throw notFound("Notification not found.");

    res.json({ message: "Notification marked as read.", id, is_read: true });
}, "Could not update notification."));

module.exports = router;
