// Financial audit log. Pass the SAME connection used by the surrounding transaction so the audit
// row is saved or rolled back together with the change it describes.
// `actor` is req.context ({ id, role }) or null for system actions.
async function logAudit(executor, actor, action, entityType, entityId, details) {
  await executor.execute(
    `INSERT INTO financial_audit_log (actor_id, actor_role, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      actor ? actor.id : null,
      actor ? actor.role : null,
      action,
      entityType,
      entityId === undefined ? null : entityId,
      details === undefined ? null : JSON.stringify(details)
    ]
  );
}

module.exports = { logAudit };
