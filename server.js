require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const path = require("path");
const session = require("express-session");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./backend/swagger");

// Developer 1's real login endpoints.
const authRoutes = require("./backend/PL/routes/auth/authRoutes");

const pricingRoutes = require("./backend/PL/routes/finance/pricing");
const billingRoutes = require("./backend/PL/routes/finance/billing");
const financeRoutes = require("./backend/PL/routes/finance/finance");
const customerRoutes = require("./backend/PL/routes/finance/customer");
const providerRoutes = require("./backend/PL/routes/finance/provider");
const adminRoutes = require("./backend/PL/routes/finance/admin");
const discountRoutes = require("./backend/PL/routes/finance/discount");
const instanceRoutes = require("./backend/PL/routes/instances/instances");

const { authenticate, requireRole } = require("./backend/PL/middleware/access");

const app = express();
const port = Number(process.env.PORT) || 3000;

// Validate session configuration before starting the server.
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters long.");
}

// Express sessions use the built-in in-memory store for local development.
// Sessions are lost when the server restarts; do not use MemoryStore in production.
// Middleware order matters: JSON -> session -> auth routes -> protected routes.
app.use(express.json());
app.use(session({
    name: "cortexops.sid",
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 2 * 60 * 60 * 1000
    }
}));

// Swagger
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true
}));

// Backend-only mode: open Swagger UI at the root URL.
app.get("/", (req, res) => res.redirect("/api-docs/"));

// Health check
app.get("/api/health", (req, res) => {
    res.json({ status: "OK", message: "API is running" });
});

// Consistent validation for JSON API requests.
app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (req.body == null) req.body = {};
        if (typeof req.body !== "object" || Array.isArray(req.body)) {
            return res.status(400).json({ error: "Request body must be a JSON object." });
        }
    }
    next();
});

// Dev 1 login, 2FA challenge, current user, logout, and email verification.
// This must be mounted AFTER session() and WITHOUT finance authenticate().
app.use("/api/auth", authRoutes);

// Dev 2 finance API routes.
app.use("/api/pricing", authenticate, pricingRoutes);
app.use("/api/billing", authenticate, requireRole("Admin"), billingRoutes);
app.use("/api/finance", authenticate, requireRole("Admin"), financeRoutes);
app.use("/api/admin", authenticate, requireRole("Admin"), adminRoutes);
app.use("/api/customers/me", authenticate, requireRole("Customer"), customerRoutes);
app.use("/api/providers/me", authenticate, requireRole("Provider"), providerRoutes);
app.use("/api/notifications", authenticate, customerRoutes.notificationsRouter);
app.use("/api/discounts", authenticate, discountRoutes);
app.use("/api/instances", instanceRoutes());

app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON body." });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body is too large." });
    }
    console.error(error);
    return res.status(500).json({ error: "Request failed." });
});

if (require.main === module) {
    const host = process.env.HOST || "127.0.0.1";
    app.listen(port, host, () => {
        console.log(`Server running at http://${host}:${port}`);
    });
}

module.exports = app;
