const { checkConnection } = require('../DAL/healthDAL');
async function checkDatabaseHealth() { await checkConnection(); }
module.exports = { checkDatabaseHealth };
