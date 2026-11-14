// Real authentication endpoints: browser automatically handles the HTTP-only session cookie.
const loginBody = { required: true, content: { "application/json": { schema: {
    type: "object", required: ["email", "password"], properties: {
        email: { type: "string", format: "email", example: "admin@test.com" },
        password: { type: "string", format: "password", example: "Test12345!" }
    }
} } } };
module.exports = {
    "/api/auth/register": {
        post: {
            tags: ["Authentication"],
            summary: "Register a customer or provider",
            description: "Public registration. Administrator accounts cannot be created here. Requires email configuration (APP_BASE_URL and Brevo SMTP environment variables). The new account must verify its email before login. Password must be at least 12 characters and no more than 72 UTF-8 bytes.",
            security: [],
            requestBody: {
                required: true,
                content: { "application/json": { schema: {
                    type: "object",
                    required: ["firstName", "lastName", "email", "password", "role"],
                    properties: {
                        firstName: { type: "string", minLength: 1, maxLength: 100, example: "Jane" },
                        lastName: { type: "string", minLength: 1, maxLength: 100, example: "Doe" },
                        email: { type: "string", format: "email", maxLength: 254, example: "jane@example.com" },
                        password: { type: "string", format: "password", minLength: 12, description: "12 or more characters (maximum 72 UTF-8 bytes)", example: "ExamplePass123!" },
                        role: { type: "string", enum: ["customer", "provider"], example: "customer" }
                    }
                } } }
            },
            responses: {
                201: { description: "Account created; verification email attempted. May report email delivery failure and suggest resending." },
                400: { description: "Invalid registration fields or password" },
                409: { description: "Email address already registered" },
                429: { description: "Too many registrations (5 per 15 minutes)" },
                503: { description: "Registration email not configured" },
                500: { description: "Unable to register due to a server error" }
            }
        }
    },
    "/api/auth/verify-email": {
        post: {
            tags: ["Authentication"],
            summary: "Verify email using the token from the verification link",
            description: "Copy the 64-character token value from the email verification URL and send it as JSON. Tokens expire after 30 minutes and can only be used once. No login is required.",
            security: [],
            requestBody: {
                required: true,
                content: { "application/json": { schema: {
                    type: "object",
                    required: ["token"],
                    properties: {
                        token: { type: "string", pattern: "^[a-fA-F0-9]{64}$", minLength: 64, maxLength: 64, description: "Actual token from the verification email's URL, not a sample value" }
                    }
                } } }
            },
            responses: {
                200: { description: "Email verified", content: { "application/json": { schema: {
                    type: "object",
                    properties: { success: { type: "boolean", example: true }, message: { type: "string", example: "Email verified successfully" } }
                } } } },
                400: { description: "Invalid, expired, or previously used verification token" },
                429: { description: "Too many verification attempts (10 per 15 minutes)" },
                500: { description: "Unable to verify email due to a server error" }
            }
        }
    },
    "/api/auth/resend-verification": {
        post: {
            tags: ["Authentication"],
            summary: "Resend account verification email",
            description: "Submit an email address. For privacy, the response is the same whether or not an unverified account exists. Requests may be internally throttled, including a one-minute wait between tokens. No login required.",
            security: [],
            requestBody: {
                required: true,
                content: { "application/json": { schema: {
                    type: "object",
                    required: ["email"],
                    properties: { email: { type: "string", format: "email", maxLength: 254, example: "jane@example.com" } }
                } } }
            },
            responses: {
                200: { description: "Request accepted; verification email may be sent if account is eligible", content: { "application/json": { schema: {
                    type: "object",
                    properties: { message: { type: "string", example: "If an unverified account exists, a verification email will be sent." } }
                } } } },
                400: { description: "Invalid email request" },
                429: { description: "Too many resend attempts (5 per 15 minutes)" },
                500: { description: "Unable to process resend request" }
            }
        }
    },
    "/api/auth/login": { post: { tags: ["Authentication"], summary: "Log in with a real test or registered account", security: [], requestBody: loginBody,
        description: "Creates a cookie-based Express session. Swagger in this same browser sends the cookie automatically on subsequent requests. Test accounts must first be seeded locally.",
        responses: { 200: { description: "Logged in; session cookie saved by browser" }, 202: { description: "2FA required; continue with /api/auth/login/2fa" }, 400: { description: "Invalid request" }, 401: { description: "Invalid credentials or unverified account" }, 429: { description: "Too many attempts" } } } },
    "/api/auth/login/2fa": { post: { tags: ["Authentication"], summary: "Complete two-factor login", security: [], requestBody: {
        required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string", example: "123456" } } } } }
    }, responses: { 200: { description: "Authenticated" }, 400: { description: "Invalid code format" }, 401: { description: "Invalid or expired challenge" } } } },
    "/api/auth/me": { get: { tags: ["Authentication"], summary: "Show current logged-in user", responses: { 200: { description: "Authenticated user" }, 401: { description: "Not logged in" } } } },
    "/api/auth/logout": { post: { tags: ["Authentication"], summary: "Log out and clear session cookie", responses: { 200: { description: "Logged out" } } } },

    "/api/auth/2fa/status": {
        get: {
            tags: ["Authentication"],
            summary: "Check whether 2FA is enabled for the logged-in account",
            responses: {
                200: { description: "Returns { enabled: true/false }" },
                401: { description: "Login required" }
            }
        }
    },
    "/api/auth/2fa/setup": {
        post: {
            tags: ["Authentication"],
            summary: "Start Google Authenticator setup",
            description: "Requires an authenticated, email-verified user. Returns a manualKey and a QR code as a data URL. Keep the secret private. No request body is required.",
            responses: {
                200: { description: "Returns qrCode and manualKey for Google Authenticator" },
                400: { description: "Email not verified or 2FA already enabled" },
                401: { description: "Login required" },
                500: { description: "Setup failed (check TOTP_ENCRYPTION_KEY and database)" }
            }
        }
    },
    "/api/auth/2fa/confirm": {
        post: {
            tags: ["Authentication"],
            summary: "Confirm and enable 2FA",
            description: "Enter the current 6-digit code from the authenticator app after /api/auth/2fa/setup.",
            requestBody: {
                required: true,
                content: { "application/json": { schema: {
                    type: "object",
                    required: ["code"],
                    properties: { code: { type: "string", pattern: "^[0-9]{6}$", example: "123456", description: "Replace the example with the current authenticator code" } }
                } } }
            },
            responses: {
                200: { description: "2FA enabled" },
                400: { description: "Invalid code or enrollment not found" },
                401: { description: "Login required" }
            }
        }
    }

};
