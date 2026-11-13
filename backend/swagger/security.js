// Login through /api/auth/login; the browser sends the Express session cookie.
module.exports = {
    securitySchemes: {
        sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "cortexops.sid",
            description: "Browser-managed login cookie. Call POST /api/auth/login in Swagger first, then GET /api/auth/me to verify. Do not manually paste a cookie into Authorize."
        }
    },
    security: [{ sessionCookie: [] }]
};
