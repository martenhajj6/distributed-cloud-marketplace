
const dal = require("../../DAL/auth/twoFactorDAL");
const { createTwoFactorSetup, verifyTwoFactorCode } = require("./twoFactorService");

// Start Google Authenticator enrollment
async function startTwoFactorEnrollment(userId) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid user ID");
    }

    const connection = await dal.getConnection();

    try {
        await dal.beginTransaction(connection);

        // Lock and check the user's account
        const [users] = await dal.lockUserForEnrollment(connection, [userId]);

        if (users.length === 0)
            throw new Error("User not found");

        if (!users[0].email_verified_at)
            throw new Error("Verify your email first");

        // Check whether 2FA is already enabled
        const [existing] = await dal.lockEnrollmentStatus(connection, [userId]);

        if (existing.length && existing[0].enabled_at)
            throw new Error("2FA is already enabled");

        // Generate the secret and QR code
        const setup = await createTwoFactorSetup(
            userId,
            users[0].email
        );

        // Save encrypted secret to MySQL
        if (existing.length === 0) {
            await dal.insertEnrollment(connection, [userId, setup.encryptedSecret]);
        } else {
            // Replace a previous unfinished enrollment
            await dal.replaceEnrollment(connection, [setup.encryptedSecret, userId]);
        }

        await dal.commit(connection);

        return {
            qrCode: setup.qrCode,
            manualKey: setup.manualKey
        };

    } catch (error) {
        await dal.rollback(connection);
        throw error;
    } finally {
        dal.release(connection);
    }
}


async function confirmTwoFactorEnrollment(userId, code) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid user ID");
    }

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        throw new Error("Invalid 2FA code");
    }

    const connection = await dal.getConnection();

    try {
        await dal.beginTransaction(connection);

        // Lock the enrollment record
        const [rows] = await dal.lockEnrollmentForConfirmation(connection, [userId]);

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
        await dal.enableEnrollment(connection, [result.timeStep, userId]);

        await dal.commit(connection);

        return {
            success: true,
            message: "Two-factor authentication enabled"
        };

    } catch (error) {
        await dal.rollback(connection);
        throw error;
    } finally {
        dal.release(connection);
    }
}


async function verifyLoginTwoFactor(userId, code) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Invalid user ID");
    }

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
        return { valid: false };
    }

    const connection = await dal.getConnection();

    try {
        await dal.beginTransaction(connection);

        // Lock the user's 2FA configuration
        const [rows] = await dal.lockEnrollmentForLogin(connection, [userId]);

        if (!rows.length || !rows[0].enabled_at) {
            await dal.rollback(connection);
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
            await dal.rollback(connection);
            return { valid: false };
        }

        // Prevent replay of previously accepted codes
        const [update] = await dal.consumeTimeStep(connection, [result.timeStep, userId, result.timeStep]);

        if (update.affectedRows !== 1) {
            await dal.rollback(connection);
            return { valid: false };
        }

        await dal.commit(connection);

        return { valid: true };

    } catch (error) {
        await dal.rollback(connection);
        throw error;
    } finally {
        dal.release(connection);
    }
}


module.exports = {
    startTwoFactorEnrollment,
    confirmTwoFactorEnrollment,
    verifyLoginTwoFactor
};
