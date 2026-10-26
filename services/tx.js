const db = require("../db");

// Runs fn(connection) inside one transaction: commit on success, rollback if anything throws.
async function withTransaction(fn) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch (rollbackError) { console.error(rollbackError); }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { withTransaction };
