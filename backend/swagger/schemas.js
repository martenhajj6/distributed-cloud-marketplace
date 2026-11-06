// Shared OpenAPI request/response schemas.
module.exports = {
    "PricingRule": {
        "type": "object",
        "required": [
            "resource_type",
            "cloud_class",
            "unit_price"
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
            "unit_price": {
                "type": "number",
                "minimum": 0
            }
        }
    },
    "CalculatePrice": {
        "type": "object",
        "required": [
            "cloud_class",
            "cpu_cores",
            "ram_gb",
            "storage_gb"
        ],
        "properties": {
            "cloud_class": {
                "type": "string",
                "enum": [
                    "Economy",
                    "Business",
                    "Critical"
                ]
            },
            "cpu_cores": {
                "type": "number",
                "minimum": 0
            },
            "ram_gb": {
                "type": "number",
                "minimum": 0
            },
            "storage_gb": {
                "type": "number",
                "minimum": 0
            },
            "gpu_units": {
                "type": "number",
                "minimum": 0,
                "default": 0
            }
        }
    }
};
