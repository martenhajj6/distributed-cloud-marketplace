require("dotenv").config();

const express = require("express");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./swagger");
const pricingRoutes = require("./routes/pricing");
const billingRoutes = require("./routes/billing");
const financeRoutes = require("./routes/finance");
const customerRoutes = require("./routes/customer");
const providerRoutes = require("./routes/provider");
const notificationRoutes = require("./routes/notifications");
const discountRoutes = require("./routes/discounts");
const adminRoutes = require("./routes/admin");
const { authenticate, requireRole } = require("./middleware/access");

const app = express();
app.use(express.json());
app.use(express.static(require("path").join(__dirname, "public")));

// Interactive API documentation. Keep this before app.listen().
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

app.get("/", (req, res) => {
  res.sendFile(require("path").join(__dirname, "public", "index.html"));
});

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
app.use("/api/notifications", authenticate, notificationRoutes);
app.use("/api/discounts", authenticate, discountRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
