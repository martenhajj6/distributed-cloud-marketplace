// Data Access Layer: SQL statements for pricing.
const db = require("./dbconn");

const statement1 = (params = []) => db.execute(`
        SELECT id, pricing_rule_id, old_price, new_price, changed_at
        FROM pricing_history WHERE pricing_rule_id = ?
        ORDER BY changed_at DESC, id DESC
    `, params);

const statement2 = (connection, params = []) => connection.execute("UPDATE pricing_rules SET unit_price = ? WHERE id = ?", params);

const statement3 = (connection, params = []) => connection.execute("SELECT resource_type, cloud_class, unit_price, active FROM pricing_rules WHERE id = ? FOR UPDATE", params);

const statement4 = (connection, params = []) => connection.execute("INSERT INTO pricing_rules (resource_type, cloud_class, unit_price) VALUES (?, ?, ?)", params);

const statement5 = (params = []) => db.execute("SELECT resource_type, unit_price FROM pricing_rules WHERE cloud_class = ? AND active = TRUE", params);

const statement6 = (params = []) => db.execute(`
        SELECT id, resource_type, cloud_class, unit_price, created_at
        FROM pricing_rules WHERE active = TRUE ORDER BY resource_type, cloud_class
    `, params);

const statement7 = (connection, params = []) => connection.execute("INSERT INTO pricing_history (pricing_rule_id, old_price, new_price) VALUES (?, ?, ?)", params);

const statement8 = (connection, params = []) => connection.execute("UPDATE pricing_rules SET active = FALSE WHERE id = ?", params);
const statement9 = (connection, params = []) => connection.execute("SELECT id, unit_price, active FROM pricing_rules WHERE resource_type = ? AND cloud_class = ? FOR UPDATE", params);
const statement10 = (connection, params = []) => connection.execute("UPDATE pricing_rules SET unit_price = ?, active = TRUE WHERE id = ?", params);

module.exports = { statement1, statement2, statement3, statement4, statement5, statement6, statement7, statement8, statement9, statement10 };
