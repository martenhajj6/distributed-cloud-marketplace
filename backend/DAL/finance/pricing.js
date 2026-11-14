// Data Access Layer: SQL statements for pricing.
const db = require("../dbconn");

const listHistory = (params = []) => db.execute(`
        SELECT id, pricing_rule_id, old_price, new_price, changed_at
        FROM pricing_history WHERE pricing_rule_id = ?
        ORDER BY changed_at DESC, id DESC
    `, params);

const updatePrice = (connection, params = []) => connection.execute("UPDATE pricing_rules SET unit_price = ? WHERE id = ?", params);

const lockRule = (connection, params = []) => connection.execute("SELECT resource_type, cloud_class, unit_price, active FROM pricing_rules WHERE id = ? FOR UPDATE", params);

const insertRule = (connection, params = []) => connection.execute("INSERT INTO pricing_rules (resource_type, cloud_class, unit_price) VALUES (?, ?, ?)", params);

const listClassPrices = (params = []) => db.execute("SELECT resource_type, unit_price FROM pricing_rules WHERE cloud_class = ? AND active = TRUE", params);

const listActiveRules = (params = []) => db.execute(`
        SELECT id, resource_type, cloud_class, unit_price, created_at
        FROM pricing_rules WHERE active = TRUE ORDER BY resource_type, cloud_class
    `, params);

const insertHistory = (connection, params = []) => connection.execute("INSERT INTO pricing_history (pricing_rule_id, old_price, new_price) VALUES (?, ?, ?)", params);

const deactivateRule = (connection, params = []) => connection.execute("UPDATE pricing_rules SET active = FALSE WHERE id = ?", params);
const lockResourceClass = (connection, params = []) => connection.execute("SELECT id, unit_price, active FROM pricing_rules WHERE resource_type = ? AND cloud_class = ? FOR UPDATE", params);
const reactivateRule = (connection, params = []) => connection.execute("UPDATE pricing_rules SET unit_price = ?, active = TRUE WHERE id = ?", params);

module.exports = { listHistory, updatePrice, lockRule, insertRule, listClassPrices, listActiveRules, insertHistory, deactivateRule, lockResourceClass, reactivateRule };
