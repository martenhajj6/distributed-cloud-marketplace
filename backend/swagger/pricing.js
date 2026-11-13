// Pricing endpoints for Swagger UI.
module.exports = {
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
        "delete": {
            "tags": ["Pricing"],
            "summary": "Deactivate pricing rule (preserves price history)",
            "parameters": [{ "name": "id", "in": "path", "required": true, "schema": { "type": "integer", "minimum": 1 } }],
            "responses": { "200": { "description": "Rule deactivated" }, "404": { "description": "Active rule not found" } }
        },
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
    }
};
