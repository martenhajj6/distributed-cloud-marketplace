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

const app = express();
app.use(express.json());

// Interactive API documentation. Keep this before app.listen().
app.get("/api-docs.json", (req, res) => res.json(swaggerSpec));
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

app.get("/", (req, res) => {
  res.send("Cloud Marketplace API is running.");
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "API is running" });
});

// All endpoints are open. This context is only a local default for user-scoped demo data;
// it does not verify identity or restrict access.
const setContext = role => (req, res, next) => {
  req.context = { id: 1, role };
  next();
};

app.use("/api/pricing", setContext("Admin"), pricingRoutes);
app.use("/api/billing", setContext("Admin"), billingRoutes);
app.use("/api/finance", setContext("Admin"), financeRoutes);
app.use("/api/admin", setContext("Admin"), adminRoutes);
app.use("/api/customers/me", setContext("Customer"), customerRoutes);
app.use("/api/providers/me", setContext("Provider"), providerRoutes);
app.use("/api/notifications", setContext("Customer"), notificationRoutes);
app.use("/api/discounts", setContext("Admin"), discountRoutes);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
