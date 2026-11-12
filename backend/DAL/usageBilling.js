// Data Access Layer: SQL statements for usageBillingService.
const db = require("./dbconn");

const statement1 = (connection = db, params = []) => connection.execute("SELECT DATE_FORMAT(LEAST(CAST(? AS DATETIME), NOW()), '%Y-%m-%d %H:%i:%s') AS cap", params);

async function loadUsage(db, customerId, start, cap) {
    const params = [customerId, cap, start];

    const [vms] = await db.execute(`
        SELECT provider_id, cloud_class, cpu_cores, ram_gb, gpu_units,
               started_at, stopped_at
        FROM VmUsage
        WHERE customer_id = ? AND started_at < CAST(? AS DATETIME)
          AND (stopped_at IS NULL OR stopped_at > CAST(? AS DATETIME))
    `, params);

    const [resources] = await db.execute(`
        SELECT provider_id, resource_type, cloud_class, quantity,
               started_at, ended_at
        FROM ResourceUsagePeriods
        WHERE customer_id = ? AND started_at < CAST(? AS DATETIME)
          AND (ended_at IS NULL OR ended_at > CAST(? AS DATETIME))
    `, params);

    return { vms, resources };
}

module.exports = { loadUsage, statement1 };
