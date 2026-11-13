// Real authentication endpoints: browser automatically handles the HTTP-only session cookie.
const loginBody = { required: true, content: { "application/json": { schema: {
    type: "object", required: ["email", "password"], properties: {
        email: { type: "string", format: "email", example: "admin@test.com" },
        password: { type: "string", format: "password", example: "Test12345!" }
    }
} } } };
module.exports = {
    "/api/auth/login": { post: { tags: ["Authentication"], summary: "Log in with a real test or registered account", security: [], requestBody: loginBody,
        description: "Creates a cookie-based Express session. Swagger in this same browser sends the cookie automatically on subsequent requests. Test accounts must first be seeded locally.",
        responses: { 200: { description: "Logged in; session cookie saved by browser" }, 202: { description: "2FA required; continue with /api/auth/login/2fa" }, 400: { description: "Invalid request" }, 401: { description: "Invalid credentials or unverified account" }, 429: { description: "Too many attempts" } } } },
    "/api/auth/login/2fa": { post: { tags: ["Authentication"], summary: "Complete two-factor login", security: [], requestBody: {
        required: true, content: { "application/json": { schema: { type: "object", required: ["code"], properties: { code: { type: "string", example: "123456" } } } } }
    }, responses: { 200: { description: "Authenticated" }, 400: { description: "Invalid code format" }, 401: { description: "Invalid or expired challenge" } } } },
    "/api/auth/me": { get: { tags: ["Authentication"], summary: "Show current logged-in user", responses: { 200: { description: "Authenticated user" }, 401: { description: "Not logged in" } } } },
    "/api/auth/logout": { post: { tags: ["Authentication"], summary: "Log out and clear session cookie", responses: { 200: { description: "Logged out" } } } }
};
