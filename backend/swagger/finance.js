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
            "description": "Optional Idempotency-Key replays a successful admin refund without applying it again. Reuse a key only for retries of the same refund; changed data returns 409.",
            "parameters": [{ "name": "Idempotency-Key", "in": "header", "required": false, "schema": { "type": "string", "minLength": 1, "maxLength": 128, "pattern": "^[!-~]+$" } }],
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
                                    "maxLength": 255,
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
    }
};
