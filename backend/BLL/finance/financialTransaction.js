const { createHash } = require("crypto");
const { withTransaction } = require("../../DAL/dbconn");
const { replayOrRun } = require("../../DAL/finance/idempotency");

function financialTransaction(actor, requestKey, operation, payload, callback) {
    const hash = createHash("sha256").update(JSON.stringify({ operation, ...payload })).digest("hex");
    return withTransaction(connection => replayOrRun(
        connection, actor, requestKey, hash, () => callback(connection)
    ));
}

module.exports = { financialTransaction };
