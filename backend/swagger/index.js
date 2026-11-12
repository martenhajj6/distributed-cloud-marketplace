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
        "description": "Pricing, billing, payments, refunds, provider earnings and dashboard APIs. Payments and refunds are simulated. /api/finance, /api/billing and /api/admin are Admin only; /api/customers/me, /api/providers/me are role-specific; prices can be read by any logged-in user. Use Authorize to send a login token (or the x-user-id / x-user-role headers when DEV_AUTH=true)."
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
