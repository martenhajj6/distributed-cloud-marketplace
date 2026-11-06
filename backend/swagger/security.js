// Authorization schemes described in Swagger UI.
module.exports = {
    "securitySchemes": {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Developer 1's login token (once DEVELOPER1_AUTH_PATH is configured)."
        },
        "devUserId": {
            "type": "apiKey",
            "in": "header",
            "name": "x-user-id",
            "description": "Local testing only (DEV_AUTH=true)."
        },
        "devUserRole": {
            "type": "apiKey",
            "in": "header",
            "name": "x-user-role",
            "description": "Local testing only: Customer, Provider or Admin."
        }
    },
    "security": [
        {
            "bearerAuth": []
        },
        {
            "devUserId": [],
            "devUserRole": []
        }
    ]
};
