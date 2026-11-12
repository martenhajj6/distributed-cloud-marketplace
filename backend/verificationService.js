
const db = require("./db");
const {
    createVerificationToken,
    hashVerificationToken
} = require("./verificationToken");
const { sendVerificationEmail } = require("./emailService");


// 1. Generate and store a verification token
async function createAndStoreToken(userId) {
    const { token, tokenHash } = createVerificationToken();
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [users] = await connection.execute(
            `SELECT email_verified_at
             FROM Users
             WHERE user_id = ? FOR UPDATE`,
            [userId]
        );

        if (users.length === 0)
            throw new Error("User not found");

        if (users[0].email_verified_at)
            throw new Error("Email already verified");

        // Prevent repeated requests within one minute
        const [recent] = await connection.execute(
            `SELECT token_id
             FROM EmailVerificationTokens
             WHERE user_id = ?
               AND expires_at > DATE_ADD(
                   UTC_TIMESTAMP(), INTERVAL 29 MINUTE
               )
             LIMIT 1`,
            [userId]
        );

        if (recent.length > 0)
            throw new Error("Please wait before requesting another email");

        // Invalidate previous unused tokens
        await connection.execute(
            `UPDATE EmailVerificationTokens
             SET used_at = UTC_TIMESTAMP()
             WHERE user_id = ?
               AND used_at IS NULL`,
            [userId]
        );

        // Store the hashed token with 30-minute expiration
        await connection.execute(
            `INSERT INTO EmailVerificationTokens
             (user_id, token_hash, expires_at)
             VALUES (
                 ?, ?,
                 DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)
             )`,
            [userId, tokenHash]
        );

        await connection.commit();
        return token;

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


// 2. Verify the customer's email
async function verifyEmailToken(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        throw new Error("Invalid verification token");
    }

    const tokenHash = hashVerificationToken(token);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        // Find the token
        const [tokens] = await connection.execute(
            `SELECT token_id, user_id
             FROM EmailVerificationTokens
             WHERE token_hash = ?`,
            [tokenHash]
        );

        if (tokens.length === 0)
            throw new Error("Invalid or expired verification link");

        const { token_id, user_id } = tokens[0];

        // Lock the user record
        const [users] = await connection.execute(
            `SELECT email_verified_at
             FROM Users
             WHERE user_id = ? FOR UPDATE`,
            [user_id]
        );

        if (users.length === 0 || users[0].email_verified_at)
            throw new Error("Invalid or already verified account");

        // Accept only an unused, unexpired token
        const [result] = await connection.execute(
            `UPDATE EmailVerificationTokens
             SET used_at = UTC_TIMESTAMP()
             WHERE token_id = ?
               AND used_at IS NULL
               AND expires_at > UTC_TIMESTAMP()`,
            [token_id]
        );

        if (result.affectedRows !== 1)
            throw new Error("Invalid or expired verification link");

        // Mark the email as verified
        await connection.execute(
            `UPDATE Users
             SET email_verified_at = UTC_TIMESTAMP()
             WHERE user_id = ?`,
            [user_id]
        );

        await connection.commit();

        return {
            success: true,
            userId: user_id
        };

    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


// 3. Resend verification email
async function resendVerification(email) {
    const message =
        "If an unverified account exists, a verification email will be sent.";

    if (typeof email !== "string" || !email.includes("@")) {
        return { message };
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        // Find an existing unverified account
        const [users] = await db.execute(
            `SELECT user_id, first_name
             FROM Users
             WHERE email = ?
               AND email_verified_at IS NULL`,
            [normalizedEmail]
        );

        if (users.length === 0)
            return { message };

        if (!process.env.APP_BASE_URL)
            throw new Error("APP_BASE_URL is not configured");

        const user = users[0];

        // Generate a new verification token
        const token = await createAndStoreToken(user.user_id);

        // Construct verification URL
        const url = new URL(
            "/verify-email",
            process.env.APP_BASE_URL
        );

        url.searchParams.set("token", token);

        // Send verification email using Brevo
        await sendVerificationEmail(
            normalizedEmail,
            user.first_name,
            url.toString()
        );

    } catch (error) {
        // Avoid revealing account existence or status
        console.error("Verification resend failed:", error.message);
    }

    return { message };
}


// Export all functions
module.exports = {
    createAndStoreToken,
    verifyEmailToken,
    resendVerification
};

