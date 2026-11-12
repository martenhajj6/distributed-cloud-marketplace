// Billing endpoints for Swagger UI.
module.exports = {
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
    }
};
