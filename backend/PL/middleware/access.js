const { HttpError, positiveInteger } = require("../../utils/util");
const { checkAuthorization } = require("../../BLL/auth/userService");

// Developer 1 stores lowercase roles in sessions and MySQL.
// Finance routes use capitalized roles, so normalize only for req.user.
const ROLE_ALIASES = {
    customer: "Customer",
    provider: "Provider",
    admin: "Admin"
};

function normalizeUser(raw) {
    if (!raw || typeof raw !== "object") return null;

    const id = positiveInteger(raw.userId ?? raw.user_id ?? raw.id);
    const role = ROLE_ALIASES[String(raw.role ?? "").trim().toLowerCase()];

    return id && role ? { id, role } : null;
}

// Must run AFTER express-session has populated req.session.
// Also rechecks the account's current role and verification in MySQL.
async function authenticate(req, res, next) {
    const user = normalizeUser(req.session?.user);
    if (!user) return res.status(401).json({ error: "Please log in." });

    try {
        const sessionRole = user.role.toLowerCase();
        const failure = await checkAuthorization(user.id, sessionRole, [sessionRole]);
        if (failure) return res.status(failure.status).json({ error: failure.message });

        req.user = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

// Use after authenticate(): requireRole("Admin") etc.
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: "Please log in." });
        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ error: "Access denied." });
        }
        return next();
    };
}

// Translate only recognized database failures into safe API messages.
// Never expose SQL statements, connection details, or server stack traces.
function sendError(res, error, fallbackMessage = "Request failed.") {
    if (error instanceof HttpError) return res.status(error.status).json(error.body);

    console.error(error);

    if (["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "PROTOCOL_CONNECTION_LOST", "ER_CON_COUNT_ERROR"].includes(error.code))
        return res.status(503).json({ error: "Database temporarily unavailable. Please try again later." });

    if (["ER_NO_REFERENCED_ROW", "ER_NO_REFERENCED_ROW_2"].includes(error.code))
        return res.status(400).json({ error: "A referenced record does not exist." });

    if (error.code === "ER_ROW_IS_REFERENCED_2")
        return res.status(409).json({ error: "This record is in use and cannot be deleted." });

    return res.status(500).json({ error: fallbackMessage });
}

// Preserve application-level HttpError details and handle common database conflicts.
const handle = (fn, message = "Request failed.", duplicate = "Record already exists.") =>
    async (req, res) => {
        try {
            if (req.body == null) req.body = {};
            await fn(req, res);
        } catch (error) {
            if (error instanceof HttpError) return sendError(res, error, message);
            if (error.code === "ER_DUP_ENTRY")
                return res.status(409).json({ error: duplicate });
            if (["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"].includes(error.code))
                return res.status(409).json({ error: "Another transaction is updating this record. Please retry." });
            return sendError(res, error, message);
        }
    };

module.exports = { handle, sendError, authenticate, requireRole, normalizeUser };