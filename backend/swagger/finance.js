// Finance endpoints for Swagger UI.
module.exports = {
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
    "/api/finance/discount-codes/validate": {
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
    }
};
