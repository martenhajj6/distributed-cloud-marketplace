const bcrypt = require("bcrypt");
const users = require("../../DAL/auth/usersDAL");
const { createAndStoreToken } = require("./verificationService");
const { sendVerificationEmail } = require("./emailService");

// Public registration cannot create administrators.
async function register(input) {
    const firstName = typeof input.firstName === "string" ? input.firstName.trim() : "";
    const lastName = typeof input.lastName === "string" ? input.lastName.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = input.password;
    const role = input.role;

    if (!firstName || firstName.length > 100 || !lastName || lastName.length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        typeof password !== "string" || password.length < 12 ||
        Buffer.byteLength(password, "utf8") > 72 ||
        !["customer", "provider"].includes(role)) {
        const error = new Error("Enter a valid name, email, role and password (at least 12 characters).");
        error.status = 400;
        throw error;
    }
    // Do not create an unusable account when email delivery has not been configured.
    if (!process.env.APP_BASE_URL || !process.env.BREVO_SMTP_HOST || !process.env.BREVO_SMTP_LOGIN ||
        !process.env.BREVO_SMTP_KEY || !process.env.MAIL_FROM) {
        const error = new Error("Registration email is not configured. Ask the administrator to configure SMTP.");
        error.status = 503;
        throw error;
    }
    let baseUrl;
    try { baseUrl = new URL(process.env.APP_BASE_URL); }
    catch { throw new Error("Invalid APP_BASE_URL configuration"); }
    if (!["http:", "https:"].includes(baseUrl.protocol)) throw new Error("Invalid APP_BASE_URL configuration");

    const passwordHash = await bcrypt.hash(password, 12);
    let userId;
    try {
        userId = await users.createUser({ firstName, lastName, email, passwordHash, role });
    } catch (error) {
        if (error.code === "ER_DUP_ENTRY") {
            const conflict = new Error("An account with this email already exists.");
            conflict.status = 409;
            throw conflict;
        }
        throw error;
    }

    try {
        const token = await createAndStoreToken(userId);
        const link = new URL("/verify-email", baseUrl);
        link.searchParams.set("token", token);
        await sendVerificationEmail(email, firstName, link.toString());
        return { message: "Account created. Check your email to verify it before signing in." };
    } catch (error) {
        // The user was already created, and can use /resend-verification.
        console.error("Unable to send first verification email:", error.message);
        return { message: "Account created, but verification email could not be sent. Use Resend verification later." };
    }
}
module.exports = { register };
