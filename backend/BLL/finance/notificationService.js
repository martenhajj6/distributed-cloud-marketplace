const repository = require("../../DAL/notification");

const { listNotifications, markNotificationRead } = repository;

// Insert a notification (pass a transaction connection to keep it atomic)
const notify = (conn, { to, id, type, title, message, paymentId, refundId = null }) =>
    repository.statement1(conn, [to, id, type, title, message, paymentId, refundId]);

module.exports = { listNotifications, markNotificationRead, notify };
