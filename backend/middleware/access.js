// Authentication + role-based access control (RBAC) for the finance routes.
//
// The finance code only needs ONE thing from the login system: after authentication,
// `req.user` must be { id, role } where role is "Customer", "Provider" or "Admin".
//
// HOW TO PLUG IN DEVELOPER 1'S MIDDLEWARE
//   1. Copy their auth middleware file into this project (or point to it) and set in .env:
//        DEVELOPER1_AUTH_PATH=./middleware/developer1Auth.js
//        DEVELOPER1_AUTH_EXPORT=verifyToken        (only if the file exports an object)
//      The export must be a normal Express middleware: (req, res, next) => ...
//   2. That middleware must fill req.user. Field names are normalised below, so { id | userId |
//      user_id } and { role | userRole | roles[0] } are all accepted, in any letter case.
//   3. If their role names differ ("client", "vendor" ...), add them to ROLE_ALIASES.
//
// LOCAL TESTING WITHOUT DEVELOPER 1 (never in production)
//   Set DEV_AUTH=true in .env, then send headers:  x-user-id: 1   x-user-role: Customer
//   With neither option configured every protected route answers 401 (fail closed).
const path = require("path");
const ROLE_ALIASES = {
    customer: "Customer",
    provider: "Provider",
    admin: "Admin",
    administrator: "Admin"
};
function normalizeUser(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const id = Number(raw.id ?? raw.userId ?? raw.user_id);
    const roleValue = raw.role ?? raw.userRole ?? raw.user_role ?? (Array.isArray(raw.roles) ? raw.roles[0] : undefined);
    const role = ROLE_ALIASES[String(roleValue ?? "").toLowerCase()];
    if (!Number.isInteger(id) || id < 1 || !role)
        return null;
    return { id, role };
}
function loadDeveloper1Middleware() {
    if (!process.env.DEVELOPER1_AUTH_PATH)
        return null;
    const loaded = require(path.resolve(__dirname, "..", process.env.DEVELOPER1_AUTH_PATH));
    const middleware = typeof loaded === "function" ? loaded : loaded[process.env.DEVELOPER1_AUTH_EXPORT];
    if (typeof middleware !== "function") {
        throw new Error("DEVELOPER1_AUTH_PATH must export a middleware function (set DEVELOPER1_AUTH_EXPORT if it exports an object).");
    }
    return middleware;
}
const developer1Middleware = loadDeveloper1Middleware();
function authenticate(req, res, next) {
    if (developer1Middleware) {
        return developer1Middleware(req, res, error => {
            if (error)
                return next(error);
            const user = normalizeUser(req.user);
            if (!user) {
                return res.status(403).json({ error: "Your account has no recognised role (Customer, Provider or Admin)." });
            }
            req.user = user;
            return next();
        });
    }
    if (process.env.DEV_AUTH === "true" && process.env.NODE_ENV !== "production") {
        const user = normalizeUser({ id: req.get("x-user-id"), role: req.get("x-user-role") });
        if (!user) {
            return res.status(401).json({ error: "DEV_AUTH is on: send x-user-id (positive integer) and x-user-role (Customer, Provider or Admin) headers." });
        }
        req.user = user;
        return next();
    }
    return res.status(401).json({
        error: "Authentication is not configured. Set DEVELOPER1_AUTH_PATH in .env, or DEV_AUTH=true for local testing only."
    });
}
// Use after authenticate(): requireRole("Admin") or requireRole("Customer", "Admin").
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user)
            return res.status(401).json({ error: "Please log in." });
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: `This action requires one of these roles: ${allowedRoles.join(", ")}.` });
        }
        return next();
    };
}
module.exports = { authenticate, requireRole, normalizeUser };
