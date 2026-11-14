const { HttpError } = require("../../utils/util");

// The unique key serializes retries across processes; the enclosing business
// transaction commits the cached result and financial effects together.
async function replayOrRun(connection, actor, key, hash, operation) {
    if (key == null) return operation();
    await connection.execute(`
        INSERT INTO api_idempotency (actor_role, actor_id, request_key, request_hash)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE request_key = request_key
    `, [actor.role, actor.id, key, hash]);
    const [[row]] = await connection.execute(`
        SELECT request_hash, response_json FROM api_idempotency
        WHERE actor_role = ? AND actor_id = ? AND request_key = ? FOR UPDATE
    `, [actor.role, actor.id, key]);

    if (row.request_hash !== hash)
        throw new HttpError(409, { error: "Idempotency key was already used for a different request." });
    
    if (row.response_json != null)
        return typeof row.response_json === "string" ? JSON.parse(row.response_json) : row.response_json;
    const result = await operation();
    await connection.execute(`
        UPDATE api_idempotency SET response_json = ?
        WHERE actor_role = ? AND actor_id = ? AND request_key = ?
    `, [JSON.stringify(result), actor.role, actor.id, key]);
    return result;
}

module.exports = { replayOrRun };
