
const db = require("./db");
const { createTwoFactorSetup, verifyTwoFactorCode } = require("./twoFactorService");

// Start Google Authenticator enrollment
async function startTwoFactorEnrollment(userId) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid user ID");
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Lock and check the user's account
        const [users] = await connection.execute(
            `SELECT email, email_verified_at
             FROM Users
             WHERE user_id = ? FOR UPDATE`,
            [userId]
        );

        if (users.length === 0)
            throw new Error("User not found");

        if (!users[0].email_verified_at)
            throw new Error("Verify your email first");

        // Check whether 2FA is already enabled
        const [existing] = await connection.execute(
            `SELECT enabled_at
             FROM UserTwoFactor
             WHERE user_id = ? FOR UPDATE`,
            [userId]
        );

        if (existing.length && existing[0].enabled_at)
            throw new Error("2FA is already enabled");

        // Generate the secret and QR code
        const setup = await createTwoFactorSetup(
            userId,
            users[0].email
        );

        // Save encrypted secret to MySQL
        if (existing.length === 0) {
            await connection.execute(
                `INSERT INTO UserTwoFactor
                 (user_id, encrypted_secret, enabled_at, last_used_step)
                 VALUES (?, ?, NULL, NULL)`,
                [userId, setup.encryptedSecret]
            );
        } else {
            // Replace a previous unfinished enrollment
            await connection.execute(
                `UPDATE UserTwoFactor
                 SET encrypted_secret = ?,
                     enabled_at = NULL,
                     last_used_step = NULL
                 WHERE user_id = ?`,
                [setup.encryptedSecret, userId]
            );
        }

        await connection.commit();

        return {
            qrCode: setup.qrCode,
            manualKey: setup.manualKey
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


async function confirmTwoFactorEnrollment(userId, code) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid user ID");
    }

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        throw new Error("Invalid 2FA code");
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Lock the enrollment record
        const [rows] = await connection.execute(
            `SELECT encrypted_secret, enabled_at, last_used_step
             FROM UserTwoFactor
             WHERE user_id = ? FOR UPDATE`,
            [userId]
        );

        if (rows.length === 0) {
            throw new Error("2FA enrollment not found");
        }

        const enrollment = rows[0];

        if (enrollment.enabled_at !== null) {
            throw new Error("2FA is already enabled");
        }

        // Verify the Google Authenticator code
        const result = await verifyTwoFactorCode(
            userId,
            enrollment.encrypted_secret,
            code,
            enrollment.last_used_step
        );

        if (!result.valid) {
            throw new Error("Invalid or expired 2FA code");
        }

        // Activate 2FA and record the consumed time step
        await connection.execute(
            `UPDATE UserTwoFactor
             SET enabled_at = UTC_TIMESTAMP(),
                 last_used_step = ?
             WHERE user_id = ?`,
            [result.timeStep, userId]
        );

        await connection.commit();

        return {
            success: true,
            message: "Two-factor authentication enabled"
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


async function verifyLoginTwoFactor(userId, code) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid user ID");
    }

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        return { valid: false };
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Lock the user's 2FA configuration
        const [rows] = await connection.execute(
            `SELECT encrypted_secret, enabled_at, last_used_step
             FROM UserTwoFactor
             WHERE user_id = ? FOR UPDATE`,
            [userId]
        );

        if (!rows.length || !rows[0].enabled_at) {
            await connection.rollback();
            return { valid: false };
        }

        const twoFactor = rows[0];

        // Verify Google Authenticator code
        const result = await verifyTwoFactorCode(
            userId,
            twoFactor.encrypted_secret,
            code,
            twoFactor.last_used_step
        );

        if (!result.valid) {
            await connection.rollback();
            return { valid: false };
        }

        // Prevent replay of previously accepted codes
        const [update] = await connection.execute(
            `UPDATE UserTwoFactor
             SET last_used_step = ?
             WHERE user_id = ?
               AND (last_used_step IS NULL OR last_used_step < ?)`,
            [result.timeStep, userId, result.timeStep]
        );

        if (update.affectedRows !== 1) {
            await connection.rollback();
            return { valid: false };
        }

        await connection.commit();

        return { valid: true };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


module.exports = { startTwoFactorEnrollment };

module.exports = {
    startTwoFactorEnrollment,
    confirmTwoFactorEnrollment,
    verifyLoginTwoFactor
};
