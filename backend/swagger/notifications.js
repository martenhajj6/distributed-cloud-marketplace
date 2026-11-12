// Notifications endpoints for Swagger UI.
module.exports = {
    "/api/notifications": {
        "get": {
            "tags": [
                "Notifications"
            ],
            "summary": "My notifications (Customer or Provider)",
            "parameters": [
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
                }
            }
        }
    },
    "/api/notifications/{id}/read": {
        "patch": {
            "tags": [
                "Notifications"
            ],
            "summary": "Mark my notification as read",
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
