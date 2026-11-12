// Provider endpoints for Swagger UI.
module.exports = {
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
    }
};
