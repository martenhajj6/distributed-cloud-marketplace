-- Task 6: usage-based billing, customer refund requests, notification types and financial audit log.
-- Run AFTER sql/04_discounts_notifications_dashboard.sql (file: discounts_notifications_dashboard.sql).
-- Safe to run more than once on MySQL 8.
USE cloud_marketplace;

-- ---------------------------------------------------------------------------
-- Usage tables.
-- IMPORTANT: if Developer 1 already has tables for resource usage and VM usage, agree on ONE
-- schema with them. This script only creates these tables if they do not exist yet, using the
-- column names that services/usageBillingService.js reads. If their columns differ, change the
-- two SELECT queries in that file instead of keeping two copies of the data.
-- ---------------------------------------------------------------------------

-- A non-VM resource (for example a storage volume) that existed from started_at until ended_at.
-- ended_at NULL means "still exists". Billed for the whole time it exists.
CREATE TABLE IF NOT EXISTS resource_usage_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    provider_id INT NOT NULL,
    resource_id INT NULL,
    resource_type ENUM('CPU', 'RAM', 'Storage', 'GPU') NOT NULL,
    cloud_class ENUM('Economy', 'Business', 'Critical') NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_rup_customer (customer_id, started_at),
    CHECK (quantity > 0),
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- One row per interval in which a VM was RUNNING. When a VM is stopped the row gets stopped_at,
-- and starting it again inserts a NEW row. Time with no row = stopped = not billed.
CREATE TABLE IF NOT EXISTS vm_usage (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    provider_id INT NOT NULL,
    vm_id INT NOT NULL,
    cloud_class ENUM('Economy', 'Business', 'Critical') NOT NULL,
    cpu_cores DECIMAL(12,2) NOT NULL DEFAULT 0,
    ram_gb DECIMAL(12,2) NOT NULL DEFAULT 0,
    gpu_units DECIMAL(12,2) NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL,
    stopped_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_vm_usage_customer (customer_id, started_at),
    INDEX idx_vm_usage_vm (vm_id),
    CHECK (cpu_cores >= 0 AND ram_gb >= 0 AND gpu_units >= 0),
    CHECK (stopped_at IS NULL OR stopped_at > started_at)
);

-- Usage invoices need fractions of a unit-month (4 CPUs for 1 hour = 0.0056), so widen quantity.
ALTER TABLE invoice_items MODIFY quantity DECIMAL(14,4) NOT NULL;

-- Which provider earned each invoice line (NULL for manual invoices). Used to split a payment
-- between providers automatically.
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'provider_id'
);
SET @sql = IF(@col_exists = 0,
    'ALTER TABLE invoice_items ADD COLUMN provider_id INT NULL AFTER invoice_id',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ---------------------------------------------------------------------------
-- Customer refund requests (the customer asks, an admin approves or rejects).
-- An approved request creates a normal row in `refunds` through the same code as
-- POST /api/finance/refunds.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refund_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
    admin_note VARCHAR(255) NULL,
    decided_by INT NULL,
    decided_at DATETIME NULL,
    refund_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_refund_request_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL,
    INDEX idx_refund_requests_customer (customer_id, status),
    INDEX idx_refund_requests_status (status, created_at),
    CHECK (amount > 0)
);

-- More notification types (re-running this statement is harmless).
ALTER TABLE payment_notifications
    MODIFY notification_type ENUM('PaymentSucceeded', 'RefundSucceeded', 'RefundRequested', 'RefundRejected') NOT NULL;

-- ---------------------------------------------------------------------------
-- Financial audit log (optional feature): pricing changes, refund decisions, withdrawal decisions,
-- discount changes and usage-invoice generation. Rows are only ever inserted.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_role VARCHAR(20) NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id INT NULL,
    details TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_created (created_at)
);
