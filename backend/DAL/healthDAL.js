const db = require('./db');
async function checkConnection() { await db.query('SELECT 1'); }
module.exports = { checkConnection };
