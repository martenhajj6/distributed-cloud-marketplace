
const session = require("express-session");
const { createSessionStore } = require("../DAL/auth/sessionDAL");

// Validate our session secret
const secret = process.env.SESSION_SECRET;

if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET is missing or invalid");
}

// Configure MySQL session storage
const sessionStore = createSessionStore();

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

