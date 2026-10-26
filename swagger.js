const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "integer", minimum: 1 }
};

const queryInt = (name, description) => ({
  name,
  in: "query",
  required: false,
  description,
  schema: { type: "integer", minimum: 1 }
});

const jsonBody = (schema, required = true) => ({
  required,
  content: {
    "application/json": { schema }
  }
});

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const resource = {
  type: "object",
  required: ["resource_type", "cloud_class", "quantity"],
  properties: {
    resource_type: { type: "string", enum: ["CPU", "RAM", "Storage", "GPU"] },
    cloud_class: { type: "string", enum: ["Economy", "Business", "Critical"] },
    quantity: { type: "number", exclusiveMinimum: 0 }
  }
};

const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Cloud Marketplace API",
    version: "1.0.0",
    description: "Open development API for pricing, billing, payments, refunds, provider earnings, discounts, notifications and dashboards. Payments and refunds are simulated."
  },
  servers: [{ url: "http://localhost:3000" }],
  tags: [
    { name: "System" },
    { name: "Pricing" },
    { name: "Billing" },
    { name: "Finance" }
  ],
  paths: {
    "/": {
      get: {
        tags: ["System"],
        summary: "API welcome",
        responses: { "200": { description: "API is running" } }
      }
    },
    "/api/health": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: { "200": { description: "API health status" } }
      }
    },

    "/api/pricing": {
      get: {
        tags: ["Pricing"],
        summary: "List pricing rules",
        responses: { "200": { description: "Pricing rules" } }
      },
      post: {
        tags: ["Pricing"],
        summary: "Create a pricing rule",
        requestBody: jsonBody(ref("PricingRule")),
        responses: {
          "201": { description: "Rule created" },
          "400": { description: "Invalid input" },
          "409": { description: "Resource and class combination already exists" }
        }
      }
    },
    "/api/pricing/calculate": {
      post: {
        tags: ["Pricing"],
        summary: "Calculate resource price",
        requestBody: jsonBody(ref("CalculatePrice")),
        responses: {
          "200": { description: "Calculated price" },
          "400": { description: "Invalid input" }
        }
      }
    },
    "/api/pricing/{id}": {
      put: {
        tags: ["Pricing"],
        summary: "Update a pricing rule",
        parameters: [idParam],
        requestBody: jsonBody({
          type: "object",
          required: ["unit_price"],
          properties: {
            unit_price: { type: "number", minimum: 0 }
          }
        }),
        responses: {
          "200": { description: "Price updated" },
          "400": { description: "Invalid input" },
          "404": { description: "Rule not found" }
        }
      }
    },
    "/api/pricing/{id}/history": {
      get: {
        tags: ["Pricing"],
        summary: "Get pricing history",
        parameters: [idParam],
        responses: {
          "200": { description: "Pricing history" },
          "404": { description: "Rule not found" }
        }
      }
    },

    "/api/billing/invoices": {
      get: {
        tags: ["Billing"],
        summary: "List invoices",
        parameters: [queryInt("customer_id", "Filter invoices by customer")],
        responses: {
          "200": { description: "Invoice list" },
          "400": { description: "Invalid customer ID" }
        }
      },
      post: {
        tags: ["Billing"],
        summary: "Generate a simulated invoice",
        requestBody: jsonBody({
          type: "object",
          required: ["customer_id", "billing_period_start", "billing_period_end", "resources"],
          properties: {
            customer_id: { type: "integer", minimum: 1 },
            billing_period_start: { type: "string", format: "date", example: "2026-10-01" },
            billing_period_end: { type: "string", format: "date", example: "2026-11-01" },
            discount_code: { type: "string", nullable: true },
            resources: {
              type: "array",
              minItems: 1,
              items: resource
            }
          }
        }),
        responses: {
          "201": { description: "Invoice generated" },
          "400": { description: "Invalid input or discount code" },
          "409": { description: "Invoice already exists for this period" }
        }
      }
    },
    "/api/billing/invoices/{id}": {
      get: {
        tags: ["Billing"],
        summary: "Get invoice details and items",
        parameters: [idParam],
        responses: {
          "200": { description: "Invoice details" },
          "400": { description: "Invalid invoice ID" },
          "404": { description: "Invoice not found" }
        }
      }
    },

    "/api/finance/payments": {
      get: {
        tags: ["Finance"],
        summary: "List payments",
        parameters: [queryInt("invoice_id", "Filter by invoice")],
        responses: { "200": { description: "Payment list" } }
      },
      post: {
        tags: ["Finance"],
        summary: "Simulate payment and allocate provider earnings (Admin)",
        description: "provider_allocations is required for manual invoices. For usage-based invoices it can be omitted: the split is taken from the provider recorded on each invoice line.",
        requestBody: jsonBody({
          type: "object",
          required: ["invoice_id"],
          properties: {
            invoice_id: { type: "integer", minimum: 1 },
            provider_allocations: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["provider_id", "gross_amount"],
                properties: {
                  provider_id: { type: "integer", minimum: 1 },
                  gross_amount: { type: "number", exclusiveMinimum: 0 }
                }
              }
            }
          }
        }),
        responses: {
          "201": { description: "Simulated payment succeeded" },
          "400": { description: "Invalid input or allocations do not match invoice total" },
          "404": { description: "Invoice not found" },
          "409": { description: "Invoice cannot be paid" }
        }
      }
    },

    "/api/finance/refunds": {
      get: {
        tags: ["Finance"],
        summary: "List refunds",
        parameters: [queryInt("payment_id", "Filter by payment")],
        responses: { "200": { description: "Refund list" } }
      },
      post: {
        tags: ["Finance"],
        summary: "Record a simulated refund",
        requestBody: jsonBody({
          type: "object",
          required: ["payment_id", "amount"],
          properties: {
            payment_id: { type: "integer", minimum: 1 },
            amount: { type: "number", exclusiveMinimum: 0 },
            reason: { type: "string", nullable: true }
          }
        }),
        responses: {
          "201": { description: "Refund recorded" },
          "400": { description: "Invalid amount or exceeds refundable balance" },
          "404": { description: "Payment not found" },
          "409": { description: "Refund conflicts with payment or withdrawals" }
        }
      }
    },

    "/api/finance/earnings": {
      get: {
        tags: ["Finance"],
        summary: "Get provider earnings and available balances",
        parameters: [queryInt("provider_id", "Filter by provider")],
        responses: { "200": { description: "Earnings summary" } }
      }
    },

    "/api/finance/withdrawals": {
      get: {
        tags: ["Finance"],
        summary: "List withdrawal requests",
        parameters: [queryInt("provider_id", "Filter by provider")],
        responses: { "200": { description: "Withdrawal requests" } }
      },
      post: {
        tags: ["Finance"],
        summary: "Create a withdrawal request",
        requestBody: jsonBody({
          type: "object",
          required: ["provider_id", "amount"],
          properties: {
            provider_id: { type: "integer", minimum: 1 },
            amount: { type: "number", exclusiveMinimum: 0 },
            note: { type: "string", nullable: true }
          }
        }),
        responses: {
          "201": { description: "Withdrawal request created" },
          "400": { description: "Invalid input or insufficient balance" }
        }
      }
    },
    "/api/finance/withdrawals/{id}": {
      patch: {
        tags: ["Finance"],
        summary: "Update withdrawal status (simulated admin action)",
        parameters: [idParam],
        requestBody: jsonBody({
          type: "object",
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["Approved", "Rejected", "Paid"] }
          }
        }),
        responses: {
          "200": { description: "Status updated" },
          "400": { description: "Invalid ID or status" },
          "404": { description: "Withdrawal not found" },
          "409": { description: "Invalid status transition" }
        }
      }
    },

    "/api/finance/discount-codes": {
      get: {
        tags: ["Finance"],
        summary: "List discount codes",
        responses: { "200": { description: "Discount codes" } }
      },
      post: {
        tags: ["Finance"],
        summary: "Create a discount code",
        requestBody: jsonBody({
          type: "object",
          required: ["code", "discount_type", "discount_value"],
          properties: {
            code: { type: "string", minLength: 3, maxLength: 40, example: "SAVE10" },
            discount_type: { type: "string", enum: ["Percentage", "Fixed"] },
            discount_value: { type: "number", exclusiveMinimum: 0, example: 10 },
            max_uses: { type: "integer", minimum: 1, nullable: true },
            expires_at: { type: "string", format: "date-time", nullable: true }
          }
        }),
        responses: {
          "201": { description: "Discount code created" },
          "400": { description: "Invalid discount code data" },
          "409": { description: "Code already exists" }
        }
      }
    },
    "/api/finance/discount-codes/{id}": {
      patch: {
        tags: ["Finance"],
        summary: "Activate or deactivate a discount code",
        parameters: [idParam],
        requestBody: jsonBody({
          type: "object",
          required: ["active"],
          properties: { active: { type: "boolean" } }
        }),
        responses: {
          "200": { description: "Discount status updated" },
          "400": { description: "Invalid input" },
          "404": { description: "Discount code not found" }
        }
      }
    },

    "/api/finance/notifications": {
      get: {
        tags: ["Finance"],
        summary: "List customer or provider notifications",
        parameters: [
          {
            name: "recipient_type",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["Customer", "Provider"] }
          },
          {
            name: "recipient_id",
            in: "query",
            required: true,
            schema: { type: "integer", minimum: 1 }
          },
          {
            name: "unread_only",
            in: "query",
            schema: { type: "boolean", default: false }
          }
        ],
        responses: {
          "200": { description: "Notifications" },
          "400": { description: "Invalid recipient details" }
        }
      }
    },
    "/api/finance/notifications/{id}/read": {
      patch: {
        tags: ["Finance"],
        summary: "Mark notification as read",
        parameters: [idParam],
        responses: {
          "200": { description: "Notification marked as read" },
          "400": { description: "Invalid notification ID" },
          "404": { description: "Notification not found" }
        }
      }
    },

    "/api/finance/dashboard": {
      get: {
        tags: ["Finance"],
        summary: "Get aggregated dashboard totals",
        responses: { "200": { description: "Dashboard totals in USD" } }
      }
    }
  },

  components: {
    schemas: {
      PricingRule: {
        type: "object",
        required: ["resource_type", "cloud_class", "unit_price"],
        properties: {
          resource_type: { type: "string", enum: ["CPU", "RAM", "Storage", "GPU"] },
          cloud_class: { type: "string", enum: ["Economy", "Business", "Critical"] },
          unit_price: { type: "number", minimum: 0 }
        }
      },
      CalculatePrice: {
        type: "object",
        required: ["cloud_class", "cpu_cores", "ram_gb", "storage_gb"],
        properties: {
          cloud_class: { type: "string", enum: ["Economy", "Business", "Critical"] },
          cpu_cores: { type: "number", minimum: 0 },
          ram_gb: { type: "number", minimum: 0 },
          storage_gb: { type: "number", minimum: 0 },
          gpu_units: { type: "number", minimum: 0, default: 0 }
        }
      }
    }
  }
};

// Additional finance, customer, provider, discount, notification and dashboard routes.
const roleRoutes = require("./swaggerRoleRoutes");
swaggerSpec.tags.push(...roleRoutes.tags);
Object.assign(swaggerSpec.paths, roleRoutes.paths);

module.exports = swaggerSpec;