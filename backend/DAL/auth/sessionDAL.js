const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const db = require('../db');

function createSessionStore() {
    return new MySQLStore({
        createDatabaseTable: false,
        clearExpired: true,
        checkExpirationInterval: 15 * 60 * 1000,
        expiration: 2 * 60 * 60 * 1000,
        endConnectionOnClose: false
    }, db);
}
module.exports = { createSessionStore };
