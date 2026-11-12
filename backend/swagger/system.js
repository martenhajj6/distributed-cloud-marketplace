// System endpoints for Swagger UI.
module.exports = {
    "/": {
        "get": {
            "tags": [
                "System"
            ],
            "summary": "Redirect to overview",
            "responses": {
                "302": {
                    "description": "Redirect to the overview page"
                }
            },
            "security": []
        }
    },
    "/api/health": {
        "get": {
            "tags": [
                "System"
            ],
            "summary": "Health check",
            "responses": {
                "200": {
                    "description": "API health status"
                }
            },
            "security": []
        }
    }
};
