-- Add only the storage meter required by finance usage billing.
-- Additive: existing meter rows are preserved; no Instances lifecycle changes.
CREATE TABLE IF NOT EXISTS InstanceStorageUsage (
    vm_id BIGINT NOT NULL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    cloud_class VARCHAR(32) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    KEY idx_storage_customer (customer_id, started_at, ended_at)
) ENGINE=InnoDB;
