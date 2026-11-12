
const db = require("../db");

// Find a user by ID
async function findById(userId) {
    const [rows] = await db.execute(
        `SELECT user_id, first_name, last_name,
                email, role, email_verified_at
         FROM Users
         WHERE user_id = ?`,
        [userId]
    );

    return rows[0] || null;
}

// Find user credentials and 2FA status
async function findForLogin(email) {
    const [rows] = await db.execute(
        `SELECT u.user_id, u.password_hash, u.role,
                u.email_verified_at, t.enabled_at
         FROM Users u
         LEFT JOIN UserTwoFactor t
           ON u.user_id = t.user_id
         WHERE u.email = ?
         LIMIT 1`,
        [email]
    );

    return rows[0] || null;
}

// Find a verified user with 2FA enabled
async function findVerifiedTwoFactorUser(userId) {
    const [rows] = await db.execute(
        `SELECT u.user_id, u.role
         FROM Users u
         INNER JOIN UserTwoFactor t
           ON u.user_id = t.user_id
         WHERE u.user_id = ?
           AND u.email_verified_at IS NOT NULL
           AND t.enabled_at IS NOT NULL`,
        [userId]
    );

    return rows[0] || null;
}

async function findAuthorization(userId) {
    const [rows] = await db.execute(
        `SELECT role, email_verified_at
                 FROM Users WHERE user_id = ?`,
        [userId]
    );
    return rows[0] || null;
}

module.exports = {
    findAuthorization,
    findById,
    findForLogin,
    findVerifiedTwoFactorUser
};
