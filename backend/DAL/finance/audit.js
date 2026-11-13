const db = require("../dbconn");
const { positiveInteger } = require("../../utils/util");

async function logAudit(connection, actor, action, entityType, entityId, details = null) {
    // Development/test identities may not correspond to a real Users row.
    // Only store an actor_id when its foreign-key target exists.
    const requestedId = positiveInteger(actor?.id);
    let actorId = null;
    let auditDetails = details;

    if (requestedId) {
        const [users] = await connection.execute(
            "SELECT user_id FROM Users WHERE user_id = ? LIMIT 1",
            [requestedId]
        );
        if (users.length) {
            actorId = requestedId;
        } else {
            // Preserve the attempted identity for troubleshooting, not as a valid FK.
            auditDetails = {
                ...(details && typeof details === "object" ? details : { value: details }),
                unverified_actor_id: requestedId
            };
        }
    }

    await connection.execute(`
        INSERT INTO financial_audit_log
            (actor_id, actor_role, action, entity_type, entity_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
    `, [
        actorId,
        actor?.role ?? null,
        action,
        entityType,
        entityId ?? null,
        auditDetails == null ? null : JSON.stringify(auditDetails)
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
