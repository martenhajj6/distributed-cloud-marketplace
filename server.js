
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const express = require("express");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./backend/swagger");

const pricingRoutes = require("./backend/PL/routes/pricing");
const billingRoutes = require("./backend/PL/routes/billing");
const financeRoutes = require("./backend/PL/routes/finance");
const customerRoutes = require("./backend/PL/routes/customer");
const providerRoutes = require("./backend/PL/routes/provider");
const adminRoutes = require("./backend/PL/routes/admin");
const discountRoutes = require("./backend/PL/routes/discount");

const { authenticate, requireRole } = require("./backend/PL/middleware/access");

const app = express();
const port = Number(process.env.PORT) || 3000;
const frontend = path.join(__dirname, "frontend");

// Middleware
app.use(express.json());
app.use("/css", express.static(path.join(frontend, "css")));
app.use("/js", express.static(path.join(frontend, "js")));

// EJS
app.set("view engine", "ejs");
app.set("views", path.join(frontend, "views"));

// Swagger
app.get("/api-docs.json", (req, res) => {
    res.json(swaggerSpec);
});

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    explorer: true
}));

// Frontend pages
const screens = [
    ["overview", "Overview", "A snapshot of your marketplace financial activity."],
    ["pricing", "Resource pricing", "Review and manage cloud resource rates."],
    ["invoices", "Invoices", "Billing periods, invoice history and usage billing."],
    ["payments", "Payments", "Simulated transactions and payment tracking."],
    ["refunds", "Refunds", "Track refund requests and decisions."],
    ["earnings", "Provider earnings", "Gross, commission, net and available earnings."],
    ["withdrawals", "Withdrawals", "Review provider withdrawal requests."],
    ["discounts", "Discount codes", "Manage promotions and pricing incentives."],
    ["audit", "Audit log", "Inspect financial activity records."],
    ["settings", "Settings", "Choose your local development identity."]
];

const symbols = ["▦", "◇", "▤", "↔", "↶", "◫", "⇧", "％", "≡", "⚙"];

const pageRoles = {
    overview: "Admin Customer Provider",
    pricing: "Admin Customer Provider",
    invoices: "Admin Customer",
    payments: "Admin Customer",
    refunds: "Admin Customer",
    earnings: "Admin Provider",
    withdrawals: "Admin Provider",
    discounts: "Admin",
    audit: "Admin",
    settings: "Admin Customer Provider"
};

const menu = screens.map(([id, label], index) => ({
    id,
    label,
    icon: symbols[index],
    roles: pageRoles[id]
}));

app.get("/", (req, res) => {
    res.redirect("/overview");
});

for (const [page, title, subtitle] of screens) {
    app.get(`/${page}`, (req, res) => {
        res.render(page, { page, title, subtitle, menu });
    });
}

// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        message: "API is running"
    });
});

// API routes
app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH"].includes(req.method)) {
        if (req.body == null) req.body = {};
        if (typeof req.body !== "object" || Array.isArray(req.body))
            return res.status(400).json({ error: "Request body must be a JSON object." });
    }
    next();
});
app.use("/api/pricing", authenticate, pricingRoutes);
app.use("/api/billing", authenticate, requireRole("Admin"), billingRoutes);
app.use("/api/finance", authenticate, requireRole("Admin"), financeRoutes);
app.use("/api/admin", authenticate, requireRole("Admin"), adminRoutes);

app.use("/api/customers/me", authenticate, requireRole("Customer"), customerRoutes);
app.use("/api/providers/me", authenticate, requireRole("Provider"), providerRoutes);

app.use("/api/notifications", authenticate, customerRoutes.notificationsRouter);
app.use("/api/discounts", authenticate, discountRoutes);

app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON body." });
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
    console.error(error);
    return res.status(500).json({ error: "Request failed." });
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}
module.exports = app;
