// Notifications endpoints for Swagger UI.
module.exports = {
    "/api/notifications": {
        "get": {
            "tags": [
                "Notifications"
            ],
            "summary": "List my notifications (Admin can also query a recipient)",
            "parameters": [
                {
                    "name": "recipient_type",
                    "in": "query",
                    "description": "Admin only: look up a specific recipient instead of your own inbox. Requires recipient_id too.",
                    "schema": { "type": "string", "enum": ["Customer", "Provider", "Admin"] }
                },
                {
                    "name": "recipient_id",
                    "in": "query",
                    "description": "Admin only: recipient user ID. Requires recipient_type too.",
                    "schema": { "type": "integer", "minimum": 1 }
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
                    "description": "Notifications for the logged-in user"
                },
                "401": {
                    "description": "Not logged in"
                },
                "400": {
                    "description": "Invalid admin recipient type or ID"
                }
            }
        }
    },
    "/api/notifications/{id}/read": {
        "patch": {
            "tags": [
                "Notifications"
            ],
            "summary": "Mark notification as read (own inbox; Admin may select recipient)",
            "description": "By default marks a notification in your own inbox. Admins may pass recipient_type and recipient_id together to target another inbox.",
            "parameters": [
                { "name": "id", "in": "path", "required": true, "schema": { "type": "integer", "minimum": 1 } },
                { "name": "recipient_type", "in": "query", "description": "Admin only; requires recipient_id", "schema": { "type": "string", "enum": ["Customer", "Provider", "Admin"] } },
                { "name": "recipient_id", "in": "query", "description": "Admin only; requires recipient_type", "schema": { "type": "integer", "minimum": 1 } }
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
    }
};
