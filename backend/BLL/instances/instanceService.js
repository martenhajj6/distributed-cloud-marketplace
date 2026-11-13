// Developer 2 Instance management. Developer 1 owns VM creation and host capacity.
const db = require("../../DAL/dbconn");
const repo = require("../../DAL/instances/instanceRepository");
const { HttpError, positiveInteger } = require("../../utils/util");
const { CLOUD_CLASSES } = require("../../utils/constants");

const fail = (status, error) => { throw new HttpError(status, { error }); };
function checkAccess(vm, actor) {
    if (!vm) fail(404, "VM not found or not registered for Instances.");
    if (actor?.role !== "Admin" && !(actor?.role === "Customer" && Number(vm.customer_id) === actor.id))
        fail(404, "VM not found.");
}
function active(vm) {
    if (vm.deleted_at) fail(409, "This VM has already been deleted.");
}
function checkInput(vm) {
    for (const field of ["vm_id", "customer_id", "provider_id", "cpu_cores"]) {
        if (!positiveInteger(vm[field])) fail(400, `Invalid ${field}.`);
    }
    if (!CLOUD_CLASSES.includes(vm.cloud_class)) fail(400, "Invalid cloud_class.");
    if (!Number.isFinite(Number(vm.ram_gb)) || Number(vm.ram_gb) <= 0 ||
        !Number.isInteger(Number(vm.gpu_units ?? 0)) || Number(vm.gpu_units ?? 0) < 0 ||
        !Number.isFinite(Number(vm.storage_gb)) || Number(vm.storage_gb) <= 0)
        fail(400, "Invalid RAM or GPU allocation.");
    if (vm.host_id != null && !positiveInteger(vm.host_id)) fail(400, "Invalid host_id.");
}
// Call this inside D1's VM creation transaction, AFTER D1 inserts VirtualMachines.
// vm must come from trusted D1 allocation (NOT an untrusted client request).
async function initializeVM(connection, vm, actorId = null) {
    checkInput(vm);
    if (!await repo.vmExists(connection, vm.vm_id)) fail(404, "D1 VM record does not exist.");
    await repo.insertDetails(connection, vm);
    await repo.startStorageUsage(connection, vm);
    await repo.logActivity(connection, vm.vm_id, actorId, "CREATED", "Registered after D1 VM creation");
    if (String(vm.status).toLowerCase() === "running") {
        await repo.startUsage(connection, vm);
        await repo.logActivity(connection, vm.vm_id, actorId, "STARTED", "Initial running state");
    } else if (String(vm.status).toLowerCase() !== "stopped") {
        fail(400, "Initial VM status must be running or stopped.");
    }
    return { vm_id: vm.vm_id };
}
async function getVM(vmId, actor) {
    const vm = await repo.findVM(db, vmId);
    checkAccess(vm, actor);
    return vm;
}
async function getActivityHistory(vmId, actor) {
    await getVM(vmId, actor);
    return repo.listActivity(db, vmId);
}
async function assignIP(vmId, actor) {
    return db.withTransaction(async connection => {
        const vm = await repo.lockVM(connection, vmId);
        checkAccess(vm, actor); active(vm);
        if (vm.ip_address) return { vm_id: vmId, ip_address: vm.ip_address, already_assigned: true };
        const ip = await repo.lockFreeIP(connection);
        if (!ip) fail(409, "No available IP addresses. Configure the InstanceIPPool first.");
        await repo.assignIP(connection, vmId, ip);
        await repo.logActivity(connection, vmId, actor.id, "IP_ASSIGNED", ip);
        return { vm_id: vmId, ip_address: ip };
    });
}
async function releaseIP(vmId, actor) {
    return db.withTransaction(async connection => {
        const vm = await repo.lockVM(connection, vmId);
        checkAccess(vm, actor); active(vm);
        if (String(vm.status).toLowerCase() === "running")
            fail(409, "Stop the VM before releasing its IP address.");
        if (!vm.ip_address) return { vm_id: vmId, released: false };
        await repo.releaseIP(connection, vmId);
        await repo.logActivity(connection, vmId, actor.id, "IP_RELEASED", vm.ip_address);
        return { vm_id: vmId, released: true };
    });
}
// These endpoints manage the simulated VM lifecycle directly. D1 retains
// creation, host allocation, and any real hypervisor operations.
async function startVM(vmId, actor) {
    return db.withTransaction(async connection => {
        const vm = await repo.lockVM(connection, vmId);
        checkAccess(vm, actor); active(vm);
        if (String(vm.status).toLowerCase() !== "stopped")
            fail(409, "Only a stopped VM can be started.");
        if (await repo.openUsageCount(connection, vmId))
            fail(409, "A usage period is already open; start aborted.");
        await repo.startUsage(connection, vm);
        await repo.setVMStatus(connection, vmId, "running");
        await repo.logActivity(connection, vmId, actor.id, "STARTED");
        return { vm_id: vmId, status: "running" };
    });
}
async function stopVM(vmId, actor) {
    return db.withTransaction(async connection => {
        const vm = await repo.lockVM(connection, vmId);
        checkAccess(vm, actor); active(vm);
        if (String(vm.status).toLowerCase() !== "running")
            fail(409, "Only a running VM can be stopped.");
        if (await repo.openUsageCount(connection, vmId) !== 1)
            fail(409, "Expected exactly one running usage period.");
        await repo.stopUsage(connection, vmId);
        await repo.setVMStatus(connection, vmId, "stopped");
        await repo.logActivity(connection, vmId, actor.id, "STOPPED");
        return { vm_id: vmId, status: "stopped" };
    });
}
async function restartVM(vmId, actor) {
    return db.withTransaction(async connection => {
        const vm = await repo.lockVM(connection, vmId);
        checkAccess(vm, actor); active(vm);
        if (String(vm.status).toLowerCase() !== "running")
            fail(409, "Only a running VM can be restarted.");
        if (await repo.openUsageCount(connection, vmId) !== 1)
            fail(409, "Expected exactly one running usage period.");
        await repo.stopUsage(connection, vmId);
        await repo.startUsage(connection, vm);
        await repo.logActivity(connection, vmId, actor.id, "RESTARTED");
        return { vm_id: vmId, status: "running" };
    });
}
// D1's start/stop handlers must call these IN THE SAME transaction as their status change.
// The functions below are metering hooks; they intentionally do not change VM status.
async function recordVMStarted(connection, vmId, actorId = null) {
    const vm = await repo.lockVM(connection, vmId);
    if (!vm) fail(404, "VM is not registered for usage tracking.");
    active(vm);
    if (await repo.openUsageCount(connection, vmId)) fail(409, "VM already has an open usage period.");
    await repo.startUsage(connection, vm);
    await repo.logActivity(connection, vmId, actorId, "STARTED");
}
async function recordVMStopped(connection, vmId, actorId = null) {
    const vm = await repo.lockVM(connection, vmId);
    if (!vm) fail(404, "VM is not registered for usage tracking.");
    active(vm);
    if (await repo.openUsageCount(connection, vmId) !== 1)
        fail(409, "Expected exactly one open VM usage period before stopping.");
    await repo.stopUsage(connection, vmId);
    await repo.logActivity(connection, vmId, actorId, "STOPPED");
}
// D1 must supply releaseCapacity(connection, vm) which frees the host resources
// using D1's own capacity service IN THE SAME SQL transaction.
// No silent deletion if the hook is missing.
async function deleteVM(vmId, actor, releaseCapacity) {
    if (typeof releaseCapacity !== "function")
        fail(503, "VM deletion requires Developer 1's capacity release integration.");
    return db.withTransaction(async connection => {
        const vm = await repo.lockVM(connection, vmId);
        checkAccess(vm, actor); active(vm);
        if (String(vm.status).toLowerCase() === "running") {
            const open = await repo.openUsageCount(connection, vmId);
            if (open !== 1) fail(409, "Running VM usage is inconsistent; cannot delete safely.");
            await repo.stopUsage(connection, vmId);
            await repo.logActivity(connection, vmId, actor.id, "STOPPED", "Stopped during deletion");
        } else if (await repo.openUsageCount(connection, vmId)) {
            fail(409, "Stopped VM still has open usage periods. Correct metering before deleting.");
        }
        await releaseCapacity(connection, vm); // rollback everything if capacity release fails
        if (vm.ip_address) await repo.releaseIP(connection, vmId);
        await repo.stopStorageUsage(connection, vmId);
        // Soft delete D2 metadata and keep VM + VmUsage records for invoice history.
        // D1 must exclude deleted InstanceDetails from its VM listings and allocations.
        await repo.setVMStatus(connection, vmId, "stopped");
        await repo.markDeleted(connection, vmId);
        await repo.logActivity(connection, vmId, actor.id, "DELETED", "Soft-deleted; usage and finance history retained");
        return { vm_id: vmId, deleted: true, capacity_released: true };
    });
}
module.exports = { initializeVM, getVM, getActivityHistory, assignIP, releaseIP,
    recordVMStarted, recordVMStopped, deleteVM, startVM, stopVM, restartVM };
