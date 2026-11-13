// Central Swagger configuration. Endpoints are grouped by feature.
const system = require("./system");
const auth = require("./auth");
const pricing = require("./pricing");
const billing = require("./billing");
const finance = require("./finance");
const customer = require("./customer");
const provider = require("./provider");
const notifications = require("./notifications");
const discounts = require("./discounts");
const admin = require("./admin");
const instances = require("./instances");
const schemas = require("./schemas");
const { securitySchemes, security } = require("./security");

module.exports = {
    openapi: "3.0.0",
    info: {
        "title": "Cloud Marketplace API",
        "version": "1.0.0",
        "description": "Marketplace APIs secured with Developer 1 session authentication. Admin bills actual resource usage through /api/billing/usage-invoices. Monthly billing can be run with npm run billing:preview and npm run billing:run. Provider IDs are required for manually created invoices. No real money is transferred."
    },
    servers: [
        {
            "url": "/"
        }
    ],
    tags: [
        { "name": "Authentication" },
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
        },
        {
            "name": "Instances"
        }
    ],
    paths: {
        ...auth,
        ...system,
        ...pricing,
        ...billing,
        ...finance,
        ...customer,
        ...provider,
        ...notifications,
        ...discounts,
        ...admin,
        ...instances,
    },
    components: { schemas, securitySchemes },
    security
};
