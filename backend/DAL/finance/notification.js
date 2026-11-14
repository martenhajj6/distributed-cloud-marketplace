const db = require("../dbconn");
// Finance notifications now share Developer 1's Notifications table.
// Keep the original function arguments and returned field names for BLL compatibility.

async function insertNotification(connection, params = []) {
    const [recipientType, recipientId, notificationType, title, message, paymentId, refundId] = params;
    const role = String(recipientType || "").toLowerCase();
    if (!["customer", "provider", "admin"].includes(role)) {
        throw new Error("Invalid notification recipient role");
    }

    const category = /withdraw|earning|payout/i.test(String(notificationType || ""))
        ? "payout" : "billing";

    // Do not send billing messages to another account by mistake.
    const result = await connection.execute(`
        INSERT INTO Notifications
            (user_id, category, channel, title, message, payment_id, refund_id, notification_type)
        SELECT user_id, ?, 'in_app', ?, ?, ?, ?, ?
        FROM Users
        WHERE user_id = ? AND role = ?
    `, [category, title, message, paymentId ?? null, refundId ?? null, notificationType ?? null, recipientId, role]);

    if (result[0].affectedRows !== 1) {
        throw new Error("Notification recipient not found or has a different role");
    }
    return result;
}

async function listNotifications({ recipientType, recipientId, unreadOnly = false }) {
    const [rows] = await db.execute(`
        SELECT n.notification_id AS id,
               CONCAT(UPPER(LEFT(u.role, 1)), SUBSTRING(u.role, 2)) AS recipient_type,
               n.user_id AS recipient_id,
               n.notification_type, n.title, n.message,
               n.payment_id, n.refund_id,
               (n.read_at IS NOT NULL) AS is_read, n.created_at
        FROM Notifications n
        JOIN Users u ON u.user_id = n.user_id
        WHERE n.user_id = ? AND u.role = ? AND n.category IN ('billing', 'payout')
          AND n.channel = 'in_app'
          ${unreadOnly ? "AND n.read_at IS NULL" : ""}
        ORDER BY n.created_at DESC, n.notification_id DESC
    `, [recipientId, String(recipientType || "").toLowerCase()]);
    return rows;
}

// Keep admin mode (no recipient) compatible with the old implementation.
async function markNotificationRead(id, recipient = null) {
    const params = [id];
    let recipientFilter = "";
    if (recipient != null) {
        recipientFilter = ` AND n.user_id = ? AND EXISTS
            (SELECT 1 FROM Users u WHERE u.user_id = n.user_id AND u.role = ?)`;
        params.push(recipient.id, String(recipient.type || "").toLowerCase());
    }
    const [result] = await db.execute(`
        UPDATE Notifications n
        SET n.read_at = COALESCE(n.read_at, CURRENT_TIMESTAMP)
        WHERE n.notification_id = ? AND n.category IN ('billing', 'payout')
          AND n.channel = 'in_app'${recipientFilter}
    `, params);
    return result.affectedRows > 0;
}

// Alert every administrator when a new refund request requires review.
async function notifyAdmins(connection, { title, message, paymentId, notificationType }) {
    const [result] = await connection.execute(`
        INSERT INTO Notifications
            (user_id, category, channel, title, message, payment_id, notification_type)
        SELECT user_id, 'billing', 'in_app', ?, ?, ?, ?
        FROM Users
        WHERE role = 'admin'
    `, [title, message, paymentId ?? null, notificationType ?? null]);
    return result.affectedRows;
}

module.exports = { listNotifications, markNotificationRead, notifyAdmins, insertNotification };
