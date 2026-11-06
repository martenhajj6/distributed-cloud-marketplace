const db = require("../dbconn");
const { query, where } = require("../utils/helpers");

const listNotifications = ({ recipientType, recipientId, unreadOnly = false }) => query(`
    SELECT id, recipient_type, recipient_id, notification_type,
           title, message, payment_id, refund_id, is_read, created_at
    FROM payment_notifications
    WHERE recipient_type = ? AND recipient_id = ?
    ${unreadOnly ? "AND is_read = 0" : ""}
    ORDER BY created_at DESC, id DESC
`, [recipientType, recipientId]);

// recipient = { type, id } restricts the update to that recipient; omit for admins
async function markNotificationRead(id, recipient = null) {
    const w = where({ id, recipient_type: recipient?.type, recipient_id: recipient?.id });
    const [result] = await db.execute(
        `UPDATE payment_notifications SET is_read = 1 ${w.sql}`, w.params
    );

    return result.affectedRows > 0;
}

// Insert a notification (pass a transaction connection to keep it atomic)
const notify = (conn, { to, id, type, title, message, paymentId, refundId = null }) =>
    conn.execute(`
        INSERT INTO payment_notifications
        (recipient_type, recipient_id, notification_type, title, message, payment_id, refund_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [to, id, type, title, message, paymentId, refundId]);

module.exports = { listNotifications, markNotificationRead, notify };
