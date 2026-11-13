const { handle } = require("../middleware/access");
const express = require("express");
const { positiveInteger } = require("../../utils/util");
const { bad, notFound } = require("../../utils/helpers");
const notifications = require("../../BLL/finance/notificationService");

const router = express.Router();
const RECIPIENTS = ["Customer", "Provider", "Admin"];

// By default everyone, including an admin, sees only their own inbox.
// Preserve the existing admin recipient-lookup option when explicitly requested.
const scope = req => {
    if (req.user.role === "Admin" &&
        (req.query.recipient_type !== undefined || req.query.recipient_id !== undefined)) {
        return { type: req.query.recipient_type, id: positiveInteger(req.query.recipient_id) };
    }
    return { type: req.user.role, id: req.user.id };
};

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

    const { type, id: recipientId } = scope(req);
    if (!RECIPIENTS.includes(type) || !recipientId) throw notFound("Notification not found.");

    if (!(await notifications.markNotificationRead(id, { type, id: recipientId })))
        throw notFound("Notification not found.");

    res.json({ message: "Notification marked as read.", id, is_read: true });
}, "Could not update notification."));

module.exports = router;
