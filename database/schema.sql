-- Financial module database schema (compiled from the original migration scripts).
-- Run against a development database or coordinate with Developer 1 first.
-- Does NOT include the teammate's core marketplace schema.


-- ===== pricing_tables.sql =====
CREATE DATABASE IF NOT EXISTS cloud_marketplace;
USE cloud_marketplace;

CREATE TABLE IF NOT EXISTS pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_type ENUM('CPU', 'RAM', 'Storage', 'GPU') NOT NULL,
    cloud_class ENUM('Economy', 'Business', 'Critical') NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_resource_class (resource_type, cloud_class),
    CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS pricing_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pricing_rule_id INT NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pricing_history_rule
      FOREIGN KEY (pricing_rule_id) REFERENCES pricing_rules(id)
      ON DELETE RESTRICT,
    CHECK (old_price >= 0),
    CHECK (new_price >= 0)
);

-- Example starting prices. These are sample values for development;
-- confirm the final prices with your teammate/project requirements.
INSERT IGNORE INTO pricing_rules (resource_type, cloud_class, unit_price) VALUES
('CPU', 'Economy', 2.00),
('CPU', 'Business', 3.00),
('CPU', 'Critical', 5.00),
('RAM', 'Economy', 1.00),
('RAM', 'Business', 1.50),
('RAM', 'Critical', 2.50),
('Storage', 'Economy', 0.03),
('Storage', 'Business', 0.06),
('Storage', 'Critical', 0.10),
('GPU', 'Economy', 4.00),
('GPU', 'Business', 6.00),
('GPU', 'Critical', 10.00);

-- Record initial prices in history only for rows that have no history yet.
INSERT INTO pricing_history (pricing_rule_id, old_price, new_price)
SELECT p.id, p.unit_price, p.unit_price
FROM pricing_rules p
WHERE NOT EXISTS (
    SELECT 1 FROM pricing_history h WHERE h.pricing_rule_id = p.id
);


-- ===== billing_tables.sql =====
-- Task 3: billing periods and simulated invoices.
-- Uses the existing cloud_marketplace database; do not create a second database.
USE cloud_marketplace;

CREATE TABLE IF NOT EXISTS billing_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_customer_billing_period (customer_id, period_start, period_end),
    CHECK (period_end > period_start)
);

CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(60) NOT NULL UNIQUE,
    billing_period_id INT NOT NULL UNIQUE,
    status ENUM('Unpaid', 'Paid', 'Cancelled') NOT NULL DEFAULT 'Unpaid',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_billing_period
      FOREIGN KEY (billing_period_id) REFERENCES billing_periods(id)
      ON DELETE RESTRICT,
    CHECK (subtotal >= 0),
    CHECK (total >= 0)
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    resource_type ENUM('CPU', 'RAM', 'Storage', 'GPU') NOT NULL,
    cloud_class ENUM('Economy', 'Business', 'Critical') NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_item_invoice
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      ON DELETE CASCADE,
    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (line_total >= 0)
);


-- ===== finance_tables.sql =====
-- Task 4: simulated payments, refunds, provider earnings, commissions and withdrawals.
-- Run after sql/02_create_billing_tables.sql in the existing cloud_marketplace database.
USE cloud_marketplace;

CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_reference VARCHAR(80) NOT NULL UNIQUE,
    invoice_id INT NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('Succeeded', 'Refunded') NOT NULL DEFAULT 'Succeeded',
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE RESTRICT,
    CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    refund_reference VARCHAR(80) NOT NULL UNIQUE,
    payment_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NULL,
    status ENUM('Succeeded') NOT NULL DEFAULT 'Succeeded',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    INDEX idx_refunds_payment (payment_id),
    CHECK (amount > 0)
);

CREATE TABLE IF NOT EXISTS provider_earnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    provider_id INT NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL,
    commission_amount DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_earning_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
    UNIQUE KEY unique_payment_provider (payment_id, provider_id),
    INDEX idx_earnings_provider (provider_id),
    CHECK (gross_amount >= 0),
    CHECK (commission_rate >= 0 AND commission_rate <= 100),
    CHECK (commission_amount >= 0),
    CHECK (net_amount >= 0)
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('Requested', 'Approved', 'Rejected', 'Paid') NOT NULL DEFAULT 'Requested',
    note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_withdrawals_provider_status (provider_id, status),
    CHECK (amount > 0)
);


-- ===== discounts_notifications_dashboard.sql =====
-- Task 5: discount codes, payment notifications and admin dashboard support.
-- Run after sql/finance_tables.sql in the existing cloud_marketplace database.
USE cloud_marketplace;

CREATE TABLE IF NOT EXISTS discount_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL UNIQUE,
    discount_type ENUM('Percentage', 'Fixed') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    expires_at DATETIME NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (discount_value > 0),
    CHECK (max_uses IS NULL OR max_uses > 0),
    CHECK (used_count >= 0)
);

-- Add invoice discount columns only when missing (safe to rerun on MySQL 8).
SET @col_discount_code = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'discount_code_id'
);
SET @sql = IF(@col_discount_code = 0,
    'ALTER TABLE invoices ADD COLUMN discount_code_id INT NULL', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_discount_amount = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'discount_amount'
);
SET @sql = IF(@col_discount_amount = 0,
    'ALTER TABLE invoices ADD COLUMN discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the FK only if it has not already been added (safe to rerun on MySQL 8).
SET @fk_exists = (
    SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'invoices'
      AND CONSTRAINT_NAME = 'fk_invoice_discount_code'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE invoices ADD CONSTRAINT fk_invoice_discount_code FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL',
    'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

CREATE TABLE IF NOT EXISTS payment_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_type ENUM('Customer', 'Provider') NOT NULL,
    recipient_id INT NOT NULL,
    notification_type ENUM('PaymentSucceeded', 'RefundSucceeded') NOT NULL,
    title VARCHAR(120) NOT NULL,
    message VARCHAR(500) NOT NULL,
    payment_id INT NULL,
    refund_id INT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
    CONSTRAINT fk_notification_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL,
    INDEX idx_notifications_recipient (recipient_type, recipient_id, is_read, created_at)
);


-- ===== usage_refunds_audit.sql =====
-- Task 6: usage-based billing, customer refund requests, notification types and financial audit log.
-- Run AFTER sql/discounts_notifications_dashboard.sql (file: discounts_notifications_dashboard.sql).
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

