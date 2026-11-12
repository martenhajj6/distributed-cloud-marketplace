
const session = require("express-session");
const MySQLStore = require("express-mysql-session")(session);

// Validate our session secret
const secret = process.env.SESSION_SECRET;

if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or invalid");
}

// Configure MySQL session storage
const sessionStore = new MySQLStore({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    createDatabaseTable: false,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 2 * 60 * 60 * 1000
});

// Configure Express sessions
const sessionMiddleware = session({
    name: "cortexops.sid",
    secret,
    store: sessionStore,

    resave: false,
    saveUninitialized: false,
    rolling: true,

    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 2 * 60 * 60 * 1000
    }
});

module.exports = {
    sessionMiddleware,
    sessionStore
};

