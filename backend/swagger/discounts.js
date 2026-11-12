// Discounts endpoints for Swagger UI.
module.exports = {
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
    }
};
