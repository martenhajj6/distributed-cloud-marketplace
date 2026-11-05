// /api/notifications - the logged-in customer's or provider's own notifications.
// Mounted behind authenticate. The recipient always comes from req.user, never from the URL or body.
const express = require("express");
const { sendError } = require("../services/errors");
const { positiveInteger } = require("../services/util");
const finance = require("../services/financeService");

const router = express.Router();
const recipientTypeFor = role => (role === "Customer" || role === "Provider" ? role : null);

router.get("/", async (req, res) => {
  const type = recipientTypeFor(req.user.role);
  if (!type) return res.json([]); // admins have no notification inbox in the current design
  try {
    res.json(await finance.listNotifications({ recipientType: type, recipientId: req.user.id, unreadOnly: req.query.unread_only === "true" }));
  } catch (error) {
    return sendError(res, error, "Could not load notifications.");
  }
});

// Only your own notification can be marked; anyone else's answers 404.
router.patch("/:id/read", async (req, res) => {
  const id = positiveInteger(req.params.id);
  if (!id) return res.status(400).json({ error: "Use a valid notification ID." });
  const type = recipientTypeFor(req.user.role);
  if (!type) return res.status(404).json({ error: "Notification not found." });
  try {
    if (!(await finance.markNotificationRead(id, { type, id: req.user.id }))) {
      return res.status(404).json({ error: "Notification not found." });
    }
    res.json({ message: "Notification marked as read.", id, is_read: true });
  } catch (error) {
    return sendError(res, error, "Could not update notification.");
  }
});

module.exports = router;
