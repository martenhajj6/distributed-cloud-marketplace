const db = require("../dbconn");
const transaction = require('../transaction');

async function lockUserForEnrollment(connection, parameters) {
    return connection.execute(
        `SELECT email, email_verified_at
             FROM Users
             WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function lockEnrollmentStatus(connection, parameters) {
    return connection.execute(
        `SELECT enabled_at
             FROM UserTwoFactor
             WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function insertEnrollment(connection, parameters) {
    return connection.execute(
        `INSERT INTO UserTwoFactor
                 (user_id, encrypted_secret, enabled_at, last_used_step)
                 VALUES (?, ?, NULL, NULL)`,
        parameters
    );
}

async function replaceEnrollment(connection, parameters) {
    return connection.execute(
        `UPDATE UserTwoFactor
                 SET encrypted_secret = ?,
                     enabled_at = NULL,
                     last_used_step = NULL
                 WHERE user_id = ?`,
        parameters
    );
}

async function lockEnrollmentForConfirmation(connection, parameters) {
    return connection.execute(
        `SELECT encrypted_secret, enabled_at, last_used_step
             FROM UserTwoFactor
             WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function enableEnrollment(connection, parameters) {
    return connection.execute(
        `UPDATE UserTwoFactor
             SET enabled_at = UTC_TIMESTAMP(),
                 last_used_step = ?
             WHERE user_id = ?`,
        parameters
    );
}

async function lockEnrollmentForLogin(connection, parameters) {
    return connection.execute(
        `SELECT encrypted_secret, enabled_at, last_used_step
             FROM UserTwoFactor
             WHERE user_id = ? FOR UPDATE`,
        parameters
    );
}

async function consumeTimeStep(connection, parameters) {
    return connection.execute(
        `UPDATE UserTwoFactor
             SET last_used_step = ?
             WHERE user_id = ?
               AND (last_used_step IS NULL OR last_used_step < ?)`,
        parameters
    );
}

module.exports = { ...transaction, lockUserForEnrollment, lockEnrollmentStatus, insertEnrollment, replaceEnrollment, lockEnrollmentForConfirmation, enableEnrollment, lockEnrollmentForLogin, consumeTimeStep };
