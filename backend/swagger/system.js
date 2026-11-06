// System endpoints for Swagger UI.
module.exports = {
    "/": {
        "get": {
            "tags": [
                "System"
            ],
            "summary": "API welcome",
            "responses": {
                "200": {
                    "description": "API is running"
                }
            }
        }
    },
    "/api/health": {
        "get": {
            "tags": [
                "System"
            ],
            "summary": "Health check",
            "responses": {
                "200": {
                    "description": "API health status"
                }
            }
        }
    },
    "/api/pricing": {
        "get": {
            "tags": [
                "Pricing"
            ],
            "summary": "List pricing rules",
            "responses": {
                "200": {
                    "description": "Pricing rules"
                }
            }
        },
        "post": {
            "tags": [
                "Pricing"
            ],
            "summary": "Create a pricing rule",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": "#/components/schemas/PricingRule"
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Rule created"
                },
                "400": {
                    "description": "Invalid input"
                },
                "409": {
                    "description": "Resource and class combination already exists"
                }
            }
        }
    },
    "/api/pricing/calculate": {
        "post": {
            "tags": [
                "Pricing"
            ],
            "summary": "Calculate resource price",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "$ref": "#/components/schemas/CalculatePrice"
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Calculated price"
                },
                "400": {
                    "description": "Invalid input"
                }
            }
        }
    },
    "/api/pricing/{id}": {
        "put": {
            "tags": [
                "Pricing"
            ],
            "summary": "Update a pricing rule",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "unit_price"
                            ],
                            "properties": {
                                "unit_price": {
                                    "type": "number",
                                    "minimum": 0
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Price updated"
                },
                "400": {
                    "description": "Invalid input"
                },
                "404": {
                    "description": "Rule not found"
                }
            }
        }
    },
    "/api/pricing/{id}/history": {
        "get": {
            "tags": [
                "Pricing"
            ],
            "summary": "Get pricing history",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Pricing history"
                },
                "404": {
                    "description": "Rule not found"
                }
            }
        }
    },
    "/api/billing/invoices": {
        "get": {
            "tags": [
                "Billing"
            ],
            "summary": "List invoices",
            "parameters": [
                {
                    "name": "customer_id",
                    "in": "query",
                    "required": false,
                    "description": "Filter invoices by customer",
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Invoice list"
                },
                "400": {
                    "description": "Invalid customer ID"
                }
            }
        },
        "post": {
            "tags": [
                "Billing"
            ],
            "summary": "Generate a simulated invoice",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "customer_id",
                                "billing_period_start",
                                "billing_period_end",
                                "resources"
                            ],
                            "properties": {
                                "customer_id": {
                                    "type": "integer",
                                    "minimum": 1
                                },
                                "billing_period_start": {
                                    "type": "string",
                                    "format": "date",
                                    "example": "2026-10-01"
                                },
                                "billing_period_end": {
                                    "type": "string",
                                    "format": "date",
                                    "example": "2026-11-01"
                                },
                                "discount_code": {
                                    "type": "string",
                                    "nullable": true
                                },
                                "resources": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "required": [
                                            "resource_type",
                                            "cloud_class",
                                            "quantity"
                                        ],
                                        "properties": {
                                            "resource_type": {
                                                "type": "string",
                                                "enum": [
                                                    "CPU",
                                                    "RAM",
                                                    "Storage",
                                                    "GPU"
                                                ]
                                            },
                                            "cloud_class": {
                                                "type": "string",
                                                "enum": [
                                                    "Economy",
                                                    "Business",
                                                    "Critical"
                                                ]
                                            },
                                            "quantity": {
                                                "type": "number",
                                                "exclusiveMinimum": 0
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Invoice generated"
                },
                "400": {
                    "description": "Invalid input or discount code"
                },
                "409": {
                    "description": "Invoice already exists for this period"
                }
            }
        }
    },
    "/api/billing/invoices/{id}": {
        "get": {
            "tags": [
                "Billing"
            ],
            "summary": "Get invoice details and items",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Invoice details"
                },
                "400": {
                    "description": "Invalid invoice ID"
                },
                "404": {
                    "description": "Invoice not found"
                }
            }
        }
    },
    "/api/finance/payments": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "List payments",
            "parameters": [
                {
                    "name": "invoice_id",
                    "in": "query",
                    "required": false,
                    "description": "Filter by invoice",
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Payment list"
                }
            }
        },
        "post": {
            "tags": [
                "Finance"
            ],
            "summary": "Simulate payment and allocate provider earnings (Admin)",
            "description": "provider_allocations is required for manual invoices. For usage-based invoices it can be omitted: the split is taken from the provider recorded on each invoice line.",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "invoice_id"
                            ],
                            "properties": {
                                "invoice_id": {
                                    "type": "integer",
                                    "minimum": 1
                                },
                                "provider_allocations": {
                                    "type": "array",
                                    "minItems": 1,
                                    "items": {
                                        "type": "object",
                                        "required": [
                                            "provider_id",
                                            "gross_amount"
                                        ],
                                        "properties": {
                                            "provider_id": {
                                                "type": "integer",
                                                "minimum": 1
                                            },
                                            "gross_amount": {
                                                "type": "number",
                                                "exclusiveMinimum": 0
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Simulated payment succeeded"
                },
                "400": {
                    "description": "Invalid input or allocations do not match invoice total"
                },
                "404": {
                    "description": "Invoice not found"
                },
                "409": {
                    "description": "Invoice cannot be paid"
                }
            }
        }
    },
    "/api/finance/refunds": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "List refunds",
            "parameters": [
                {
                    "name": "payment_id",
                    "in": "query",
                    "required": false,
                    "description": "Filter by payment",
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Refund list"
                }
            }
        },
        "post": {
            "tags": [
                "Finance"
            ],
            "summary": "Record a simulated refund",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "payment_id",
                                "amount"
                            ],
                            "properties": {
                                "payment_id": {
                                    "type": "integer",
                                    "minimum": 1
                                },
                                "amount": {
                                    "type": "number",
                                    "exclusiveMinimum": 0
                                },
                                "reason": {
                                    "type": "string",
                                    "nullable": true
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Refund recorded"
                },
                "400": {
                    "description": "Invalid amount or exceeds refundable balance"
                },
                "404": {
                    "description": "Payment not found"
                },
                "409": {
                    "description": "Refund conflicts with payment or withdrawals"
                }
            }
        }
    },
    "/api/finance/earnings": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "Get provider earnings and available balances",
            "parameters": [
                {
                    "name": "provider_id",
                    "in": "query",
                    "required": false,
                    "description": "Filter by provider",
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Earnings summary"
                }
            }
        }
    },
    "/api/finance/withdrawals": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "List withdrawal requests",
            "parameters": [
                {
                    "name": "provider_id",
                    "in": "query",
                    "required": false,
                    "description": "Filter by provider",
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Withdrawal requests"
                }
            }
        },
        "post": {
            "tags": [
                "Finance"
            ],
            "summary": "Create a withdrawal request",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "provider_id",
                                "amount"
                            ],
                            "properties": {
                                "provider_id": {
                                    "type": "integer",
                                    "minimum": 1
                                },
                                "amount": {
                                    "type": "number",
                                    "exclusiveMinimum": 0
                                },
                                "note": {
                                    "type": "string",
                                    "nullable": true
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Withdrawal request created"
                },
                "400": {
                    "description": "Invalid input or insufficient balance"
                }
            }
        }
    },
    "/api/finance/withdrawals/{id}": {
        "patch": {
            "tags": [
                "Finance"
            ],
            "summary": "Update withdrawal status (simulated admin action)",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "status"
                            ],
                            "properties": {
                                "status": {
                                    "type": "string",
                                    "enum": [
                                        "Approved",
                                        "Rejected",
                                        "Paid"
                                    ]
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Status updated"
                },
                "400": {
                    "description": "Invalid ID or status"
                },
                "404": {
                    "description": "Withdrawal not found"
                },
                "409": {
                    "description": "Invalid status transition"
                }
            }
        }
    },
    "/api/finance/discount-codes": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "List discount codes",
            "responses": {
                "200": {
                    "description": "Discount codes"
                }
            }
        },
        "post": {
            "tags": [
                "Finance"
            ],
            "summary": "Create a discount code",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "code",
                                "discount_type",
                                "discount_value"
                            ],
                            "properties": {
                                "code": {
                                    "type": "string",
                                    "minLength": 3,
                                    "maxLength": 40,
                                    "example": "SAVE10"
                                },
                                "discount_type": {
                                    "type": "string",
                                    "enum": [
                                        "Percentage",
                                        "Fixed"
                                    ]
                                },
                                "discount_value": {
                                    "type": "number",
                                    "exclusiveMinimum": 0,
                                    "example": 10
                                },
                                "max_uses": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "nullable": true
                                },
                                "expires_at": {
                                    "type": "string",
                                    "format": "date-time",
                                    "nullable": true
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Discount code created"
                },
                "400": {
                    "description": "Invalid discount code data"
                },
                "409": {
                    "description": "Code already exists"
                }
            }
        }
    },
    "/api/finance/discount-codes/{id}": {
        "patch": {
            "tags": [
                "Finance"
            ],
            "summary": "Activate or deactivate a discount code",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "active"
                            ],
                            "properties": {
                                "active": {
                                    "type": "boolean"
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Discount status updated"
                },
                "400": {
                    "description": "Invalid input"
                },
                "404": {
                    "description": "Discount code not found"
                }
            }
        }
    },
    "/api/finance/notifications": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "List customer or provider notifications",
            "parameters": [
                {
                    "name": "recipient_type",
                    "in": "query",
                    "required": true,
                    "schema": {
                        "type": "string",
                        "enum": [
                            "Customer",
                            "Provider"
                        ]
                    }
                },
                {
                    "name": "recipient_id",
                    "in": "query",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                },
                {
                    "name": "unread_only",
                    "in": "query",
                    "schema": {
                        "type": "boolean",
                        "default": false
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Notifications"
                },
                "400": {
                    "description": "Invalid recipient details"
                }
            }
        }
    },
    "/api/finance/notifications/{id}/read": {
        "patch": {
            "tags": [
                "Finance"
            ],
            "summary": "Mark notification as read",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Notification marked as read"
                },
                "400": {
                    "description": "Invalid notification ID"
                },
                "404": {
                    "description": "Notification not found"
                }
            }
        }
    },
    "/api/finance/dashboard": {
        "get": {
            "tags": [
                "Finance"
            ],
            "summary": "Get aggregated dashboard totals",
            "responses": {
                "200": {
                    "description": "Dashboard totals in USD"
                }
            }
        }
    },
    "/api/billing/usage-invoices": {
        "post": {
            "tags": [
                "Billing"
            ],
            "summary": "Generate a usage-based invoice (Admin)",
            "description": "Bills running VM time (vm_usage) and existing resources (resource_usage_periods) inside the period. Stopped VMs are not billed. Prices are monthly, so usage is converted to unit-months (720-hour month by default). Use dry_run to preview without saving.",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "customer_id",
                                "billing_period_start",
                                "billing_period_end"
                            ],
                            "properties": {
                                "customer_id": {
                                    "type": "integer",
                                    "minimum": 1
                                },
                                "billing_period_start": {
                                    "type": "string",
                                    "format": "date",
                                    "example": "2026-09-01"
                                },
                                "billing_period_end": {
                                    "type": "string",
                                    "format": "date",
                                    "example": "2026-10-01"
                                },
                                "discount_code": {
                                    "type": "string",
                                    "nullable": true
                                },
                                "dry_run": {
                                    "type": "boolean",
                                    "default": false
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Dry-run preview (nothing saved)"
                },
                "201": {
                    "description": "Invoice generated"
                },
                "400": {
                    "description": "Invalid input or discount code"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                },
                "409": {
                    "description": "Period not finished, invoice already exists, or no billable usage"
                }
            }
        }
    },
    "/api/customers/me/invoices": {
        "get": {
            "tags": [
                "Customer"
            ],
            "summary": "My invoices (Customer)",
            "responses": {
                "200": {
                    "description": "Invoices of the logged-in customer"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    },
    "/api/customers/me/invoices/{id}": {
        "get": {
            "tags": [
                "Customer"
            ],
            "summary": "One of my invoices with line items (Customer)",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Invoice and items"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                },
                "404": {
                    "description": "Not found (or not yours)"
                }
            }
        }
    },
    "/api/customers/me/payments": {
        "get": {
            "tags": [
                "Customer"
            ],
            "summary": "My payments (Customer)",
            "responses": {
                "200": {
                    "description": "Payments for my invoices"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    },
    "/api/customers/me/refunds": {
        "get": {
            "tags": [
                "Customer"
            ],
            "summary": "My refund requests (Customer)",
            "responses": {
                "200": {
                    "description": "Refund requests and their status"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        },
        "post": {
            "tags": [
                "Customer"
            ],
            "summary": "Request a refund (Customer)",
            "description": "Creates a Pending request; nothing is refunded until an admin approves it. Omit amount to request everything still refundable.",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "payment_id",
                                "reason"
                            ],
                            "properties": {
                                "payment_id": {
                                    "type": "integer",
                                    "minimum": 1
                                },
                                "amount": {
                                    "type": "number",
                                    "exclusiveMinimum": 0
                                },
                                "reason": {
                                    "type": "string",
                                    "minLength": 3,
                                    "maxLength": 255
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Refund request submitted"
                },
                "400": {
                    "description": "Invalid input or amount above what is still refundable"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                },
                "404": {
                    "description": "Payment not found (or not yours)"
                },
                "409": {
                    "description": "Payment cannot be refunded"
                }
            }
        }
    },
    "/api/providers/me/earnings": {
        "get": {
            "tags": [
                "Provider"
            ],
            "summary": "My earnings (Provider)",
            "description": "Gross, commission, net, committed withdrawals, available balance, and the individual earning lines.",
            "responses": {
                "200": {
                    "description": "Earnings summary"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    },
    "/api/providers/me/withdrawals": {
        "get": {
            "tags": [
                "Provider"
            ],
            "summary": "My withdrawal requests (Provider)",
            "responses": {
                "200": {
                    "description": "Withdrawals"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        },
        "post": {
            "tags": [
                "Provider"
            ],
            "summary": "Request a withdrawal (Provider)",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "amount"
                            ],
                            "properties": {
                                "amount": {
                                    "type": "number",
                                    "exclusiveMinimum": 0
                                },
                                "note": {
                                    "type": "string",
                                    "nullable": true
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Withdrawal requested"
                },
                "400": {
                    "description": "Invalid amount or above available balance"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    },
    "/api/notifications": {
        "get": {
            "tags": [
                "Notifications"
            ],
            "summary": "My notifications (Customer or Provider)",
            "parameters": [
                {
                    "name": "unread_only",
                    "in": "query",
                    "schema": {
                        "type": "boolean",
                        "default": false
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Notifications for the logged-in user"
                },
                "401": {
                    "description": "Not logged in"
                }
            }
        }
    },
    "/api/notifications/{id}/read": {
        "patch": {
            "tags": [
                "Notifications"
            ],
            "summary": "Mark my notification as read",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Marked as read"
                },
                "401": {
                    "description": "Not logged in"
                },
                "404": {
                    "description": "Not found (or not yours)"
                }
            }
        }
    },
    "/api/discounts": {
        "get": {
            "tags": [
                "Discounts"
            ],
            "summary": "List discount codes (Admin)",
            "responses": {
                "200": {
                    "description": "All discount codes, including inactive codes"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        },
        "post": {
            "tags": [
                "Discounts"
            ],
            "summary": "Create a discount code (Admin)",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "code",
                                "discount_type",
                                "discount_value"
                            ],
                            "properties": {
                                "code": {
                                    "type": "string",
                                    "maxLength": 40,
                                    "example": "SAVE10"
                                },
                                "discount_type": {
                                    "type": "string",
                                    "enum": [
                                        "Percentage",
                                        "Fixed"
                                    ]
                                },
                                "discount_value": {
                                    "type": "number",
                                    "exclusiveMinimum": 0,
                                    "example": 10
                                },
                                "max_uses": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "nullable": true
                                },
                                "expires_at": {
                                    "type": "string",
                                    "format": "date-time",
                                    "nullable": true
                                },
                                "active": {
                                    "type": "boolean",
                                    "default": true
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "201": {
                    "description": "Discount code created"
                },
                "400": {
                    "description": "Invalid fields"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                },
                "409": {
                    "description": "Code already exists"
                }
            }
        }
    },
    "/api/discounts/{id}": {
        "patch": {
            "tags": [
                "Discounts"
            ],
            "summary": "Update or activate/deactivate a discount code (Admin)",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "properties": {
                                "code": {
                                    "type": "string",
                                    "maxLength": 40
                                },
                                "discount_type": {
                                    "type": "string",
                                    "enum": [
                                        "Percentage",
                                        "Fixed"
                                    ]
                                },
                                "discount_value": {
                                    "type": "number",
                                    "exclusiveMinimum": 0
                                },
                                "max_uses": {
                                    "type": "integer",
                                    "minimum": 1,
                                    "nullable": true
                                },
                                "expires_at": {
                                    "type": "string",
                                    "format": "date-time",
                                    "nullable": true
                                },
                                "active": {
                                    "type": "boolean"
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Discount updated"
                },
                "400": {
                    "description": "Invalid fields"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                },
                "404": {
                    "description": "Code not found"
                },
                "409": {
                    "description": "Code already exists"
                }
            }
        }
    },
    "/api/discounts/validate": {
        "post": {
            "tags": [
                "Discounts"
            ],
            "summary": "Validate a discount code (any logged-in user)",
            "description": "Does not consume a use. Invalid, expired, inactive or used-up codes return 200 with valid=false and a reason.",
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "code"
                            ],
                            "properties": {
                                "code": {
                                    "type": "string",
                                    "example": "SAVE10"
                                },
                                "subtotal": {
                                    "type": "number",
                                    "minimum": 0,
                                    "example": 50
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Validation result"
                },
                "400": {
                    "description": "Missing code or invalid subtotal"
                },
                "401": {
                    "description": "Not logged in"
                }
            }
        }
    },
    "/api/admin/refunds": {
        "get": {
            "tags": [
                "Admin"
            ],
            "summary": "List customer refund requests (Admin)",
            "parameters": [
                {
                    "name": "status",
                    "in": "query",
                    "schema": {
                        "type": "string",
                        "enum": [
                            "Pending",
                            "Approved",
                            "Rejected"
                        ]
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Refund requests"
                },
                "400": {
                    "description": "Invalid status"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    },
    "/api/admin/refunds/{id}": {
        "patch": {
            "tags": [
                "Admin"
            ],
            "summary": "Approve or reject a refund request (Admin)",
            "description": "Approving records the refund (provider earnings and commission are reduced proportionally). If a provider has already withdrawn the money the approval fails with 409 and the request stays Pending.",
            "parameters": [
                {
                    "name": "id",
                    "in": "path",
                    "required": true,
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                }
            ],
            "requestBody": {
                "required": true,
                "content": {
                    "application/json": {
                        "schema": {
                            "type": "object",
                            "required": [
                                "status"
                            ],
                            "properties": {
                                "status": {
                                    "type": "string",
                                    "enum": [
                                        "Approved",
                                        "Rejected"
                                    ]
                                },
                                "admin_note": {
                                    "type": "string",
                                    "nullable": true
                                }
                            }
                        }
                    }
                }
            },
            "responses": {
                "200": {
                    "description": "Decision saved"
                },
                "400": {
                    "description": "Invalid ID or status"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                },
                "404": {
                    "description": "Request not found"
                },
                "409": {
                    "description": "Already decided, or conflicts with a withdrawal"
                }
            }
        }
    },
    "/api/admin/dashboard": {
        "get": {
            "tags": [
                "Admin"
            ],
            "summary": "Financial dashboard (Admin)",
            "description": "Revenue, commissions, provider earnings (totals and per provider), refunds, pending refund requests and pending withdrawals.",
            "responses": {
                "200": {
                    "description": "Dashboard totals in USD"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    },
    "/api/admin/audit-log": {
        "get": {
            "tags": [
                "Admin"
            ],
            "summary": "Financial audit log (Admin)",
            "parameters": [
                {
                    "name": "entity_type",
                    "in": "query",
                    "schema": {
                        "type": "string",
                        "example": "pricing_rule"
                    }
                },
                {
                    "name": "entity_id",
                    "in": "query",
                    "schema": {
                        "type": "integer",
                        "minimum": 1
                    }
                },
                {
                    "name": "limit",
                    "in": "query",
                    "schema": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 200,
                        "default": 50
                    }
                }
            ],
            "responses": {
                "200": {
                    "description": "Newest entries first"
                },
                "401": {
                    "description": "Not logged in"
                },
                "403": {
                    "description": "Your role may not use this endpoint"
                }
            }
        }
    }
};
