// Central Swagger configuration. Endpoints are grouped by feature.
const system = require("./system");
const pricing = require("./pricing");
const billing = require("./billing");
const finance = require("./finance");
const customer = require("./customer");
const provider = require("./provider");
const notifications = require("./notifications");
const discounts = require("./discounts");
const admin = require("./admin");
const schemas = require("./schemas");
const { securitySchemes, security } = require("./security");

module.exports = {
    openapi: "3.0.0",
    info: {
        "title": "Cloud Marketplace API",
        "version": "1.0.0",
        "description": "Simulated marketplace finance APIs: pricing, billing, payments, refunds, earnings, withdrawals, discounts, notifications and dashboards. No real payments are processed. Manual invoices require a provider ID for each item; usage invoices derive providers from recorded resource usage. Monthly billing uses npm run billing:preview and npm run billing:run. Authentication is handled by Developer 1's configured middleware (if DEVELOPER1_AUTH_PATH is set), or by local testing headers x-user-id and x-user-role when DEV_AUTH=true and NODE_ENV is not production. Select the appropriate Authorize method. /api/billing, /api/finance and /api/admin require Admin; /api/customers/me and /api/providers/me require their respective roles. The optional database health route requires ENABLE_DB_HEALTH_CHECK=true."
    },
    servers: [
        {
            "url": "/"
        }
    ],
    tags: [
        {
            "name": "System"
        },
        {
            "name": "Pricing"
        },
        {
            "name": "Billing"
        },
        {
            "name": "Finance"
        },
        {
            "name": "Customer"
        },
        {
            "name": "Provider"
        },
        {
            "name": "Notifications"
        },
        {
            "name": "Discounts"
        },
        {
            "name": "Admin"
        }
    ],
    paths: {
        ...system,
        ...pricing,
        ...billing,
        ...finance,
        ...customer,
        ...provider,
        ...notifications,
        ...discounts,
        ...admin,
    },
    components: { schemas, securitySchemes },
    security
};
