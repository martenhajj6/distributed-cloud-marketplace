const db = require('../db');
const transaction = require('../transaction');

async function lockUserForToken(connection, parameters) {
    return connection.execute(
        `SELECT email_verified_at
             FROM Users
             WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function findRecentToken(connection, parameters) {
    return connection.execute(
        `SELECT token_id
             FROM EmailVerificationTokens
             WHERE user_id = ?
               AND expires_at > DATE_ADD(
                   UTC_TIMESTAMP(), INTERVAL 29 MINUTE
               )
             LIMIT 1`,
        parameters
    );
}

async function invalidateUnusedTokens(connection, parameters) {
    return connection.execute(
        `UPDATE EmailVerificationTokens
             SET used_at = UTC_TIMESTAMP()
             WHERE user_id = ?
               AND used_at IS NULL`,
        parameters
    );
}

async function insertToken(connection, parameters) {
    return connection.execute(
        `INSERT INTO EmailVerificationTokens
             (user_id, token_hash, expires_at)
             VALUES (
                 ?, ?,
                 DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
             )`,
        parameters
    );
}

async function findToken(connection, parameters) {
    return connection.execute(
        `SELECT token_id, user_id
             FROM EmailVerificationTokens
             WHERE token_hash = ?`,
        parameters
    );
}

async function lockUserForVerification(connection, parameters) {
    return connection.execute(
        `SELECT email_verified_at
             FROM Users
             WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function consumeToken(connection, parameters) {
    return connection.execute(
        `UPDATE EmailVerificationTokens
             SET used_at = UTC_TIMESTAMP()
             WHERE token_id = ?
               AND used_at IS NULL
               AND expires_at > UTC_TIMESTAMP()`,
        parameters
    );
}

async function markEmailVerified(connection, parameters) {
    return connection.execute(
        `UPDATE Users
             SET email_verified_at = UTC_TIMESTAMP()
             WHERE user_id = ?`,
        parameters
    );
}

async function findUnverifiedByEmail(connection = db, parameters) {
    return connection.execute(
        `SELECT user_id, first_name
             FROM Users
             WHERE email = ?
               AND email_verified_at IS NULL`,
        parameters
    );
}

module.exports = { ...transaction, lockUserForToken, findRecentToken, invalidateUnusedTokens, insertToken, findToken, lockUserForVerification, consumeToken, markEmailVerified, findUnverifiedByEmail };
