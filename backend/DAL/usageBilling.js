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

// A running VM with missing runtime usage must not be silently billed as zero.
async function unmeteredRunningVms(connection, customerId, start, end) {
    const [rows] = await connection.execute(`
        SELECT vm.vm_id FROM VirtualMachines vm
        JOIN ResourceRegistry r ON r.vm_id = vm.vm_id
        WHERE r.customer_user_id = ? AND vm.status = 'running'
          AND vm.created_at < ?
          AND NOT EXISTS (
              SELECT 1 FROM VmUsage u WHERE u.vm_id = vm.vm_id
                AND u.started_at < ? AND (u.stopped_at IS NULL OR u.stopped_at > ?)
          ) LIMIT 10
    `, [customerId, end, end, start]);
    return rows.map(row => row.vm_id);
}

async function customersWithUsage(connection, start, end) {
    const [rows] = await connection.execute(`
        SELECT DISTINCT customer_id FROM (
            SELECT customer_id FROM VmUsage
             WHERE started_at < ? AND (stopped_at IS NULL OR stopped_at > ?)
            UNION
            SELECT customer_id FROM ResourceUsagePeriods
             WHERE started_at < ? AND (ended_at IS NULL OR ended_at > ?)
        ) usage_customers ORDER BY customer_id
    `, [end, start, end, start]);
    return rows.map(row => Number(row.customer_id));
}

module.exports = { loadUsage, statement1, customersWithUsage, unmeteredRunningVms };
