// Customer endpoints for Swagger UI.
module.exports = {
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
        },
        "post": {
            "tags": ["Customer"],
            "summary": "Pay one of my unpaid invoices (simulated)",
            "description": "Only the authenticated customer may pay their own unpaid invoice. Automatically records the payment, changes invoice to Paid, and allocates provider earnings. Requires provider-linked invoice items.",
            "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "object", "required": ["invoice_id"], "properties": {"invoice_id": {"type": "integer", "minimum": 1}}}}}},
            "responses": {"201": {"description": "Payment succeeded"}, "400": {"description": "Invalid invoice or missing provider allocation"}, "404": {"description": "Invoice not found for this customer"}, "409": {"description": "Invoice already paid or cancelled"}}
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
            "parameters": [{ "name": "Idempotency-Key", "in": "header", "required": false, "description": "Reuse for retries of the same operation; changed data returns 409.", "schema": { "type": "string", "maxLength": 128, "pattern": "^[!-~]+$" } }],
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
    }
};
