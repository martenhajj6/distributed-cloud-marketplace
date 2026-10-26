// OpenAPI additions for finance routes. Merged into the main spec by swagger.js.
const idParam = { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1 } };
const json = (schema, required = true) => ({ required, content: { "application/json": { schema } } });

const paths = {
  "/api/billing/usage-invoices": {
    post: {
      tags: ["Billing"],
      summary: "Generate a usage-based invoice (Admin)",
      description: "Bills running VM time (vm_usage) and existing resources (resource_usage_periods) inside the period. Stopped VMs are not billed. Prices are monthly, so usage is converted to unit-months (720-hour month by default). Use dry_run to preview without saving.",
      requestBody: json({
        type: "object",
        required: ["customer_id", "billing_period_start", "billing_period_end"],
        properties: {
          customer_id: { type: "integer", minimum: 1 },
          billing_period_start: { type: "string", format: "date", example: "2026-09-01" },
          billing_period_end: { type: "string", format: "date", example: "2026-10-01" },
          discount_code: { type: "string", nullable: true },
          dry_run: { type: "boolean", default: false }
        }
      }),
      responses: { 
        "200": { description: "Dry-run preview (nothing saved)" },
        "201": { description: "Invoice generated" },
        "400": { description: "Invalid input or discount code" },
        "409": { description: "Period not finished, invoice already exists, or no billable usage" },
        
      }
    }
  },

  "/api/customers/me/invoices": {
    get: { tags: ["Customer"], summary: "My invoices (Customer)", responses: { "200": { description: "Invoices of the default demo customer" } } }
  },
  "/api/customers/me/invoices/{id}": {
    get: {
      tags: ["Customer"], summary: "One of my invoices with line items (Customer)", parameters: [idParam],
      responses: { "200": { description: "Invoice and items" }, "404": { description: "Not found (or not yours)" } }
    }
  },
  "/api/customers/me/payments": {
    get: { tags: ["Customer"], summary: "My payments (Customer)", responses: { "200": { description: "Payments for my invoices" } } }
  },
  "/api/customers/me/refunds": {
    get: { tags: ["Customer"], summary: "My refund requests (Customer)", responses: { "200": { description: "Refund requests and their status" } } },
    post: {
      tags: ["Customer"],
      summary: "Request a refund (Customer)",
      description: "Creates a Pending request; nothing is refunded until an admin approves it. Omit amount to request everything still refundable.",
      requestBody: json({
        type: "object",
        required: ["payment_id", "reason"],
        properties: {
          payment_id: { type: "integer", minimum: 1 },
          amount: { type: "number", exclusiveMinimum: 0 },
          reason: { type: "string", minLength: 3, maxLength: 255 }
        }
      }),
      responses: {
        "201": { description: "Refund request submitted" },
        "400": { description: "Invalid input or amount above what is still refundable" },
        "404": { description: "Payment not found (or not yours)" },
        "409": { description: "Payment cannot be refunded" },
        
      }
    }
  },

  "/api/providers/me/earnings": {
    get: { tags: ["Provider"], summary: "My earnings (Provider)", description: "Gross, commission, net, committed withdrawals, available balance, and the individual earning lines.", responses: { "200": { description: "Earnings summary" } } }
  },
  "/api/providers/me/withdrawals": {
    get: { tags: ["Provider"], summary: "My withdrawal requests (Provider)", responses: { "200": { description: "Withdrawals" } } },
    post: {
      tags: ["Provider"], summary: "Request a withdrawal (Provider)",
      requestBody: json({ type: "object", required: ["amount"], properties: { amount: { type: "number", exclusiveMinimum: 0 }, note: { type: "string", nullable: true } } }),
      responses: { "201": { description: "Withdrawal requested" }, "400": { description: "Invalid amount or above available balance" } }
    }
  },

  "/api/notifications": {
    get: {
      tags: ["Notifications"], summary: "My notifications (Customer or Provider)",
      parameters: [{ name: "unread_only", in: "query", schema: { type: "boolean", default: false } }],
      responses: { "200": { description: "Notifications for the caller" } }
    }
  },
  "/api/notifications/{id}/read": {
    patch: {
      tags: ["Notifications"], summary: "Mark my notification as read", parameters: [idParam],
      responses: { "200": { description: "Marked as read" }, "404": { description: "Not found (or not yours)" } }
    }
  },

  "/api/discounts": {
    get: {
      tags: ["Discounts"], summary: "List discount codes (Admin)",
      responses: { "200": { description: "All discount codes, including inactive codes" } }
    },
    post: {
      tags: ["Discounts"], summary: "Create a discount code (Admin)",
      requestBody: json({ type: "object", required: ["code", "discount_type", "discount_value"], properties: {
        code: { type: "string", maxLength: 40, example: "SAVE10" },
        discount_type: { type: "string", enum: ["Percentage", "Fixed"] },
        discount_value: { type: "number", exclusiveMinimum: 0, example: 10 },
        max_uses: { type: "integer", minimum: 1, nullable: true },
        expires_at: { type: "string", format: "date-time", nullable: true },
        active: { type: "boolean", default: true }
      }}),
      responses: { "201": { description: "Discount code created" }, "400": { description: "Invalid fields" }, "409": { description: "Code already exists" } }
    }
  },
  "/api/discounts/{id}": {
    patch: {
      tags: ["Discounts"], summary: "Update or activate/deactivate a discount code (Admin)", parameters: [idParam],
      requestBody: json({ type: "object", properties: {
        code: { type: "string", maxLength: 40 }, discount_type: { type: "string", enum: ["Percentage", "Fixed"] },
        discount_value: { type: "number", exclusiveMinimum: 0 }, max_uses: { type: "integer", minimum: 1, nullable: true },
        expires_at: { type: "string", format: "date-time", nullable: true }, active: { type: "boolean" }
      }}),
      responses: { "200": { description: "Discount updated" }, "400": { description: "Invalid fields" }, "404": { description: "Code not found" }, "409": { description: "Code already exists" } }
    }
  },

  "/api/discounts/validate": {
    post: {
      tags: ["Discounts"], summary: "Validate a discount code (any caller)",
      description: "Does not consume a use. Invalid, expired, inactive or used-up codes return 200 with valid=false and a reason.",
      requestBody: json({ type: "object", required: ["code"], properties: { code: { type: "string", example: "SAVE10" }, subtotal: { type: "number", minimum: 0, example: 50 } } }),
      responses: { "200": { description: "Validation result" }, "400": { description: "Missing code or invalid subtotal" } }
    }
  },

  "/api/admin/refunds": {
    get: {
      tags: ["Admin"], summary: "List customer refund requests (Admin)",
      parameters: [{ name: "status", in: "query", schema: { type: "string", enum: ["Pending", "Approved", "Rejected"] } }],
      responses: { "200": { description: "Refund requests" }, "400": { description: "Invalid status" } }
    }
  },
  "/api/admin/refunds/{id}": {
    patch: {
      tags: ["Admin"], summary: "Approve or reject a refund request (Admin)",
      description: "Approving records the refund (provider earnings and commission are reduced proportionally). If a provider has already withdrawn the money the approval fails with 409 and the request stays Pending.",
      parameters: [idParam],
      requestBody: json({ type: "object", required: ["status"], properties: { status: { type: "string", enum: ["Approved", "Rejected"] }, admin_note: { type: "string", nullable: true } } }),
      responses: { "200": { description: "Decision saved" }, "400": { description: "Invalid ID or status" }, "404": { description: "Request not found" }, "409": { description: "Already decided, or conflicts with a withdrawal" } }
    }
  },
  "/api/admin/dashboard": {
    get: { tags: ["Admin"], summary: "Financial dashboard (Admin)", description: "Revenue, commissions, provider earnings (totals and per provider), refunds, pending refund requests and pending withdrawals.", responses: { "200": { description: "Dashboard totals in USD" } } }
  },
  "/api/admin/audit-log": {
    get: {
      tags: ["Admin"], summary: "Financial audit log (Admin)",
      parameters: [
        { name: "entity_type", in: "query", schema: { type: "string", example: "pricing_rule" } },
        { name: "entity_id", in: "query", schema: { type: "integer", minimum: 1 } },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } }
      ],
      responses: { "200": { description: "Newest entries first" } }
    }
  }
};

module.exports = {
  paths,
  tags: [{ name: "Customer" }, { name: "Provider" }, { name: "Notifications" }, { name: "Discounts" }, { name: "Admin" }],
};
