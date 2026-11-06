require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const express = require("express");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
const pricingRoutes = require("./routes/pricing");
const billingRoutes = require("./routes/billing");
const financeRoutes = require("./routes/finance");
const customerRoutes = require("./routes/customer");
const providerRoutes = require("./routes/provider");
const adminRoutes = require("./routes/admin");
const { authenticate, requireRole } = require("./middleware/access");
const app = express();
app.use(express.json());
const frontend = path.join(__dirname, '..', 'frontend');
app.set('view engine', 'ejs');
app.set('views', path.join(frontend, 'views'));
// CSS/JS are static; the application pages are rendered using EJS.
app.use(express.static(frontend, { index: false }));
// Interactive API documentation. Keep this before app.listen().
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
const screens = [
    ['overview', 'Overview', 'A snapshot of your marketplace financial activity.'],
    ['pricing', 'Resource pricing', 'Review and manage cloud resource rates.'],
    ['invoices', 'Invoices', 'Billing periods, invoice history and usage billing.'],
    ['payments', 'Payments', 'Simulated transactions and payment tracking.'],
    ['refunds', 'Refunds', 'Track refund requests and decisions.'],
    ['earnings', 'Provider earnings', 'Gross, commission, net and available earnings.'],
    ['withdrawals', 'Withdrawals', 'Review provider withdrawal requests.'],
    ['discounts', 'Discount codes', 'Manage promotions and pricing incentives.'],
    ['audit', 'Audit log', 'Inspect financial activity records.'],
    ['settings', 'Settings', 'Choose your local development identity.']
];
const symbols = ['▦', '◇', '▤', '↔', '↶', '◫', '⇧', '％', '≡', '⚙'];
const pageRoles = {
    overview: 'Admin Customer Provider', pricing: 'Admin Customer Provider',
    invoices: 'Admin Customer', payments: 'Admin Customer', refunds: 'Admin Customer',
    earnings: 'Admin Provider', withdrawals: 'Admin Provider', discounts: 'Admin',
    audit: 'Admin', settings: 'Admin Customer Provider'
};
const menu = screens.map(([id, label], index) => ({ id, label, icon: symbols[index], roles: pageRoles[id] }));
app.get('/', (req, res) => res.redirect('/overview'));
for (const [page, title, subtitle] of screens) {
    app.get('/' + page, (req, res) => res.render(page, { page, title, subtitle, menu }));
}
app.get("/api/health", (req, res) => {
    res.json({ status: "OK", message: "API is running" });
});
// Access control: authenticate first (Developer 1's middleware, see middleware/access.js), then check the role.
// Pricing: any logged-in user may read prices/estimates; routes/pricing.js limits changes to Admin.
app.use("/api/pricing", authenticate, pricingRoutes);
app.use("/api/billing", authenticate, requireRole("Admin"), billingRoutes);
app.use("/api/finance", authenticate, requireRole("Admin"), financeRoutes);
app.use("/api/admin", authenticate, requireRole("Admin"), adminRoutes);
app.use("/api/customers/me", authenticate, requireRole("Customer"), customerRoutes);
app.use("/api/providers/me", authenticate, requireRole("Provider"), providerRoutes);
app.use("/api/notifications", authenticate, customerRoutes.notificationsRouter);
app.use("/api/discounts", authenticate, adminRoutes.discountsRouter);
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
