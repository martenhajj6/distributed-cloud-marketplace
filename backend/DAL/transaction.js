const db = require('./dbconn');
// BLL selects transaction boundaries; only DAL accesses the MySQL connection API.
module.exports = {
    getConnection: () => db.getConnection(),
    beginTransaction: connection => connection.beginTransaction(),
    commit: connection => connection.commit(),
    rollback: connection => connection.rollback(),
    release: connection => connection.release()
};
