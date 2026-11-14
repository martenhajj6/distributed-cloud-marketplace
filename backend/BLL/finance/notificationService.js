const repository = require("../../DAL/finance/notification");

const { listNotifications, markNotificationRead } = repository;

// Insert a notification (pass a transaction connection to keep it atomic)
const notify = (conn, { to, id, type, title, message, paymentId, refundId = null }) =>
    repository.insertNotification(conn, [to, id, type, title, message, paymentId, refundId]);

// Create a personal inbox entry for each admin within the same transaction.
const notifyAdmins = (conn, details) => repository.notifyAdmins(conn, details);

module.exports = { listNotifications, markNotificationRead, notify, notifyAdmins };
