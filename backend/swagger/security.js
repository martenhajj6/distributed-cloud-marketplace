// Login through /api/auth/login; the browser sends the Express session cookie.
module.exports = {
    securitySchemes: {
        sessionCookie: {
            type: "apiKey",
            in: "cookie",
            name: "cortexops.sid",
            description: "Real login session. Authenticate through /api/auth/login first."
        }
    },
    security: [{ sessionCookie: [] }]
};
