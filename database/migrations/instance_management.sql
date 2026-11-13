-- Apply after Developer 1's VirtualMachines, ResourceRegistry and VmUsage schema.
-- Keep VM ownership/capacity in Developer 1's existing tables.
CREATE TABLE IF NOT EXISTS InstanceDetails (
    vm_id BIGINT NOT NULL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    host_id BIGINT NULL,
    cloud_class VARCHAR(32) NOT NULL,
    cpu_cores INT NOT NULL,
    ram_gb DECIMAL(12,3) NOT NULL,
    storage_gb DECIMAL(12,3) NOT NULL,
    gpu_units INT NOT NULL DEFAULT 0,
    ip_address VARCHAR(45) NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_instance_ip (ip_address),
    KEY idx_instance_customer (customer_id)
);
CREATE TABLE IF NOT EXISTS InstanceIPPool (
    ip_address VARCHAR(45) NOT NULL PRIMARY KEY,
    vm_id BIGINT NULL,
    allocated_at DATETIME NULL,
    UNIQUE KEY uq_ip_vm (vm_id)
);
CREATE TABLE IF NOT EXISTS InstanceActivity (
    activity_id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    vm_id BIGINT NOT NULL,
    actor_id BIGINT NULL,
    action VARCHAR(40) NOT NULL,
    details VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_activity_vm (vm_id, activity_id)
);
-- Separate D2-only storage meter: unlike CPU/RAM/GPU it runs while stopped.
CREATE TABLE IF NOT EXISTS InstanceStorageUsage (
    vm_id BIGINT NOT NULL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    cloud_class VARCHAR(32) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    KEY idx_storage_customer (customer_id, started_at, ended_at)
);
