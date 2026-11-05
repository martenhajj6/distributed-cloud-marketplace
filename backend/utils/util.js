
const money = value =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function isDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

class HttpError extends Error {
  constructor(status, body) {
    const payload = typeof body === "string"
      ? { error: body }
      : body;

    super(payload.error || "Request failed");

    this.status = status;
    this.body = payload;
  }
}

function sendError(res, error, fallbackMessage) {
  if (error instanceof HttpError) {
    return res.status(error.status).json(error.body);
  }

  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}

// Financial audit logging, using the same database connection as the transaction.
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

module.exports = {
  money,
  positiveInteger,
  isDate,
  HttpError,
  sendError,
  logAudit
};
