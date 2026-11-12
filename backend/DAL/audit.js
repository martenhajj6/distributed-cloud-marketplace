const db = require("./dbconn");
const { positiveInteger } = require("../utils/util");

async function logAudit(db, actor, action, entityType, entityId, details = null) {
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
        details == null ? null : JSON.stringify(details)
    ]);
}

async function listAudit({ limit = 50, entityType = null, entityId = null } = {}) {
    const filters = [];
    const params = [];
    if (entityType != null) {
        filters.push("entity_type = ?");
        params.push(entityType);
    }
    if (entityId != null) {
        filters.push("entity_id = ?");
        params.push(positiveInteger(entityId));
    }

    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const safeLimit = Math.min(positiveInteger(limit) || 50, 200);
    const [rows] = await db.query(`
        SELECT id, actor_id, actor_role, action, entity_type, entity_id, details, created_at
        FROM financial_audit_log
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT ${safeLimit}
    `, params);
    return rows;
}

module.exports = { logAudit, listAudit };
