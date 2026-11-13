// Authorization schemes described in Swagger UI.
module.exports = {
    "securitySchemes": {
        "bearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Bearer token only if the configured Developer 1 middleware accepts Bearer tokens. This application does not itself issue JWTs."
        },
        "devUserId": {
            "type": "apiKey",
            "in": "header",
            "name": "x-user-id",
            "description": "Local testing only, when DEV_AUTH=true and NODE_ENV is not production. Provide with x-user-role."
        },
        "devUserRole": {
            "type": "apiKey",
            "in": "header",
            "name": "x-user-role",
            "description": "Local testing only, when DEV_AUTH=true and NODE_ENV is not production. Use Customer, Provider or Admin and supply x-user-id."
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
