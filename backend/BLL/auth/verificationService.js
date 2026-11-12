
const dal = require("../../DAL/auth/verificationDAL");
const {
    createVerificationToken,
    hashVerificationToken
} = require("./verificationToken");
const { sendVerificationEmail } = require("./emailService");


// 1. Generate and store a verification token
async function createAndStoreToken(userId) {
    const { token, tokenHash } = createVerificationToken();
    const connection = await dal.getConnection();

    try {
        await dal.beginTransaction(connection);

        const [users] = await dal.lockUserForToken(connection, [userId]);

        if (users.length === 0)
            throw new Error("User not found");

        if (users[0].email_verified_at)
            throw new Error("Email already verified");

        // Prevent repeated requests within one minute
        const [recent] = await dal.findRecentToken(connection, [userId]);

        if (recent.length > 0)
            throw new Error("Please wait before requesting another email");

        // Invalidate previous unused tokens
        await dal.invalidateUnusedTokens(connection, [userId]);

        // Store the hashed token with 30-minute expiration
        await dal.insertToken(connection, [userId, tokenHash]);

        await dal.commit(connection);
        return token;

    } catch (error) {
        await dal.rollback(connection);
        throw error;
    } finally {
        dal.release(connection);
    }
}


// 2. Verify the customer's email
async function verifyEmailToken(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        throw new Error("Invalid verification token");
    }

    const tokenHash = hashVerificationToken(token);
    const connection = await dal.getConnection();

    try {
        await dal.beginTransaction(connection);

        // Find the token
        const [tokens] = await dal.findToken(connection, [tokenHash]);

        if (tokens.length === 0)
            throw new Error("Invalid or expired verification link");

        const { token_id, user_id } = tokens[0];

        // Lock the user record
        const [users] = await dal.lockUserForVerification(connection, [user_id]);

        if (users.length === 0 || users[0].email_verified_at)
            throw new Error("Invalid or already verified account");

        // Accept only an unused, unexpired token
        const [result] = await dal.consumeToken(connection, [token_id]);

        if (result.affectedRows !== 1)
            throw new Error("Invalid or expired verification link");

        // Mark the email as verified
        await dal.markEmailVerified(connection, [user_id]);

        await dal.commit(connection);

        return {
            success: true,
            userId: user_id
        };

    } catch (error) {
        await dal.rollback(connection);
        throw error;
    } finally {
        dal.release(connection);
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
        const [users] = await dal.findUnverifiedByEmail(undefined, [normalizedEmail]);

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

