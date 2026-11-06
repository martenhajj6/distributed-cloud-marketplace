
const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function positiveInteger(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function isDate(value) {
    return typeof value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value));
}

class HttpError extends Error {
    constructor(status, body) {
        const payload = typeof body === "string" ? { error: body } : body;
        super(payload.error || "Request failed");
        this.status = status;
        this.body = payload;
    }
}

function sendError(res, error, fallbackMessage) {
    if (error instanceof HttpError)
        return res.status(error.status).json(error.body);

    console.error(error);
    return res.status(500).json({ error: fallbackMessage });
}

// Financial audit logging
async function logAudit(db, actor, action, entityType, entityId, details) {
    await db.execute(`
        INSERT INTO financial_audit_log
        (actor_id, actor_role, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [
        actor?.id ?? null,
        actor?.role ?? null,
        action,
        entityType,
        entityId ?? null,
        details === undefined ? null : JSON.stringify(details)
    ]);
}

module.exports = { money, positiveInteger, isDate, HttpError, sendError, logAudit };
