// Admin endpoints for Swagger UI.
module.exports = {
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
