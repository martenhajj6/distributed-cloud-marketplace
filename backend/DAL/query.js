const db = require("./dbconn");

const query = async (sql, params = []) => (await db.execute(sql, params))[0];

const where = filters => {
    const entries = Object.entries(filters).filter(([, v]) => v != null);

    return {
        sql: entries.length ? "WHERE " + entries.map(([k]) => `${k} = ?`).join(" AND ") : "",
        params: entries.map(([, v]) => v)
    };
};

module.exports = { query, where };
