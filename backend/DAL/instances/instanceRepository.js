// SQL only: all writes use the caller's transaction connection.
const findVM = async (db, vmId) => {
    const [rows] = await db.execute(`
        SELECT vm.vm_id, vm.status, d.customer_id, d.provider_id, d.host_id,
               d.cloud_class, d.cpu_cores, d.ram_gb, d.storage_gb, d.gpu_units, d.ip_address, d.deleted_at
        FROM VirtualMachines vm JOIN InstanceDetails d ON d.vm_id = vm.vm_id
        WHERE vm.vm_id = ?`, [vmId]);
    return rows[0] || null;
};
const lockVM = async (db, vmId) => {
    const [rows] = await db.execute(`
        SELECT vm.vm_id, vm.status, d.customer_id, d.provider_id, d.host_id,
               d.cloud_class, d.cpu_cores, d.ram_gb, d.storage_gb, d.gpu_units, d.ip_address, d.deleted_at
        FROM VirtualMachines vm JOIN InstanceDetails d ON d.vm_id = vm.vm_id
        WHERE vm.vm_id = ? FOR UPDATE`, [vmId]);
    return rows[0] || null;
};
const vmExists = async (db, vmId) => {
    const [rows] = await db.execute("SELECT vm_id FROM VirtualMachines WHERE vm_id = ? FOR UPDATE", [vmId]);
    return rows.length > 0;
};
const insertDetails = (db, vm) => db.execute(`
    INSERT INTO InstanceDetails
      (vm_id, customer_id, provider_id, host_id, cloud_class, cpu_cores, ram_gb, storage_gb, gpu_units)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [vm.vm_id, vm.customer_id, vm.provider_id, vm.host_id ?? null,
     vm.cloud_class, vm.cpu_cores, vm.ram_gb, vm.storage_gb, vm.gpu_units]);
const lockFreeIP = async db => {
    const [rows] = await db.execute(`SELECT ip_address FROM InstanceIPPool
      WHERE vm_id IS NULL ORDER BY ip_address LIMIT 1 FOR UPDATE`);
    return rows[0]?.ip_address || null;
};
const assignIP = async (db, vmId, ip) => {
    await db.execute("UPDATE InstanceIPPool SET vm_id = ?, allocated_at = UTC_TIMESTAMP() WHERE ip_address = ? AND vm_id IS NULL", [vmId, ip]);
    await db.execute("UPDATE InstanceDetails SET ip_address = ? WHERE vm_id = ?", [ip, vmId]);
};
const releaseIP = async (db, vmId) => {
    await db.execute("UPDATE InstanceIPPool SET vm_id = NULL, allocated_at = NULL WHERE vm_id = ?", [vmId]);
    await db.execute("UPDATE InstanceDetails SET ip_address = NULL WHERE vm_id = ?", [vmId]);
};
const markDeleted = (db, vmId) => db.execute(
    "UPDATE InstanceDetails SET deleted_at = UTC_TIMESTAMP() WHERE vm_id = ? AND deleted_at IS NULL", [vmId]);
const setVMStatus = (db, vmId, status) => db.execute(
    "UPDATE VirtualMachines SET status = ? WHERE vm_id = ?", [status, vmId]);
const startUsage = (db, vm) => db.execute(`
    INSERT INTO VmUsage (vm_id, customer_id, provider_id, cloud_class,
      cpu_cores, ram_gb, gpu_units, started_at, stopped_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), NULL)`,
    [vm.vm_id, vm.customer_id, vm.provider_id, vm.cloud_class,
     vm.cpu_cores, vm.ram_gb, vm.gpu_units]);
const stopUsage = (db, vmId) => db.execute(`
    UPDATE VmUsage SET stopped_at = UTC_TIMESTAMP()
    WHERE vm_id = ? AND stopped_at IS NULL`, [vmId]);
// Storage is charged for the entire allocation, including VM stopped time.
const startStorageUsage = (db, vm) => db.execute(`
    INSERT INTO InstanceStorageUsage
      (vm_id, customer_id, provider_id, cloud_class, quantity, started_at)
    VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [vm.vm_id, vm.customer_id, vm.provider_id, vm.cloud_class, vm.storage_gb]);
const stopStorageUsage = (db, vmId) => db.execute(`
    UPDATE InstanceStorageUsage SET ended_at = UTC_TIMESTAMP()
    WHERE vm_id = ? AND ended_at IS NULL`, [vmId]);
const openUsageCount = async (db, vmId) => {
    const [rows] = await db.execute("SELECT COUNT(*) AS total FROM VmUsage WHERE vm_id = ? AND stopped_at IS NULL", [vmId]);
    return Number(rows[0].total);
};
const logActivity = (db, vmId, actorId, action, details = null) => db.execute(`
    INSERT INTO InstanceActivity (vm_id, actor_id, action, details)
    VALUES (?, ?, ?, ?)`, [vmId, actorId, action, details]);
const listActivity = async (db, vmId) => {
    const [rows] = await db.execute(`SELECT activity_id, vm_id, actor_id, action, details, created_at
      FROM InstanceActivity WHERE vm_id = ? ORDER BY activity_id DESC LIMIT 100`, [vmId]);
    return rows;
};
module.exports = { findVM, lockVM, vmExists, insertDetails, lockFreeIP, assignIP,
    releaseIP, markDeleted, setVMStatus, startUsage, stopUsage, openUsageCount,
    logActivity, listActivity, startStorageUsage, stopStorageUsage };
