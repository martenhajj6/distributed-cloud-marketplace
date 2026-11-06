-- CLOUD MARKETPLACE: COMPLETE FINANCIAL MODULE RESET + DEMO DATA
-- MySQL 8.0+ / MySQL Workbench. Development/testing ONLY.
-- WARNING: This deletes the ENTIRE cloud_marketplace database, including
--          any teammate-created users, resources and other core tables.
-- This script only recreates YOUR financial module tables, not Developer 1's schema.
-- Customer IDs 1/2 and provider IDs 10/11 are DEMO REFERENCES only.
-- Prices and payments are simulated, never real transactions.

DROP DATABASE IF EXISTS cloud_marketplace;
CREATE DATABASE cloud_marketplace CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cloud_marketplace;

-- 1) CREATE ALL 15 FINANCIAL TABLES


-- pricing_rules
CREATE TABLE IF NOT EXISTS pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_type ENUM('CPU', 'RAM', 'Storage', 'GPU') NOT NULL,
    cloud_class ENUM('Economy', 'Business', 'Critical') NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_resource_class (resource_type, cloud_class),
    CHECK (unit_price >= 0)
);


-- pricing_history
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


-- discount_codes
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


-- billing_periods
CREATE TABLE IF NOT EXISTS billing_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_customer_billing_period (customer_id, period_start, period_end),
    CHECK (period_end > period_start)
);


-- invoices
CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(60) NOT NULL UNIQUE,
    billing_period_id INT NOT NULL UNIQUE,
    status ENUM('Unpaid', 'Paid', 'Cancelled') NOT NULL DEFAULT 'Unpaid',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_code_id INT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_discount_code FOREIGN KEY (discount_code_id) REFERENCES discount_codes(id) ON DELETE SET NULL,
    CONSTRAINT fk_invoice_billing_period
      FOREIGN KEY (billing_period_id) REFERENCES billing_periods(id)
      ON DELETE RESTRICT,
    CHECK (subtotal >= 0),
    CHECK (total >= 0)
);


-- invoice_items
CREATE TABLE IF NOT EXISTS invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    provider_id INT NULL,
    resource_type ENUM('CPU', 'RAM', 'Storage', 'GPU') NOT NULL,
    cloud_class ENUM('Economy', 'Business', 'Critical') NOT NULL,
    quantity DECIMAL(14,4) NOT NULL,
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


-- payments
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


-- refunds
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


-- provider_earnings
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


-- withdrawal_requests
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


-- payment_notifications
CREATE TABLE IF NOT EXISTS payment_notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recipient_type ENUM('Customer', 'Provider') NOT NULL,
    recipient_id INT NOT NULL,
    notification_type ENUM('PaymentSucceeded', 'RefundSucceeded', 'RefundRequested', 'RefundRejected') NOT NULL,
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


-- resource_usage_periods
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


-- vm_usage
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


-- refund_requests
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


-- financial_audit_log
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


-- 2) PRICE LIST: 4 resources x 3 classes = 12 combinations
INSERT INTO pricing_rules (id, resource_type, cloud_class, unit_price) VALUES
(1,'CPU','Economy',2.00), (2,'CPU','Business',3.00), (3,'CPU','Critical',5.00),
(4,'RAM','Economy',1.00), (5,'RAM','Business',1.50), (6,'RAM','Critical',2.50),
(7,'Storage','Economy',0.03), (8,'Storage','Business',0.06), (9,'Storage','Critical',0.10),
(10,'GPU','Economy',4.00), (11,'GPU','Business',6.00), (12,'GPU','Critical',10.00);

-- One history row per initial rule, plus a historical change example.
INSERT INTO pricing_history (pricing_rule_id, old_price, new_price, changed_at)
SELECT id, unit_price, unit_price, '2026-08-01 09:00:00' FROM pricing_rules;
INSERT INTO pricing_history (pricing_rule_id, old_price, new_price, changed_at)
VALUES (2, 2.75, 3.00, '2026-08-15 10:00:00');

-- 3) PROMOTIONS
INSERT INTO discount_codes (id,code,discount_type,discount_value,max_uses,used_count,expires_at,active) VALUES
(1,'WELCOME10','Percentage',10.00,100,1,'2027-12-31 23:59:59',TRUE),
(2,'SAVE5','Fixed',5.00,50,0,'2027-12-31 23:59:59',TRUE);

-- 4) REALISTIC SEPTEMBER USAGE (720-hour billing month)
-- Customer 1's VM 1 ran 1-11 Sep and 20 Sep-1 Oct: 504 billable hours.
-- Its stopped time (11-20 Sep) has no row and is not billed.
INSERT INTO vm_usage (id,customer_id,provider_id,vm_id,cloud_class,cpu_cores,ram_gb,gpu_units,started_at,stopped_at) VALUES
(1,1,10,101,'Business',4,8,0,'2026-09-01 00:00:00','2026-09-11 00:00:00'),
(2,1,10,101,'Business',4,8,0,'2026-09-20 00:00:00','2026-10-01 00:00:00'),
(3,1,11,102,'Economy',2,4,0,'2026-09-15 00:00:00','2026-09-30 00:00:00'),
(4,1,10,103,'Business',8,16,0,'2026-08-01 00:00:00','2026-08-31 00:00:00'),
(5,2,10,201,'Critical',1,2,0,'2026-09-01 00:00:00','2026-09-03 12:00:00');
INSERT INTO resource_usage_periods (id,customer_id,provider_id,resource_id,resource_type,cloud_class,quantity,started_at,ended_at) VALUES
(1,1,10,501,'Storage','Business',100,'2026-09-01 00:00:00','2026-10-01 00:00:00');

-- 5) BILLING PERIODS AND INVOICES
-- Customer 1: CPU $8.40 + RAM $8.40 + CPU $2 + RAM $2 + storage $6 = $26.80.
-- Customer 2: CPU $0.42 + RAM $0.42 = $0.84, 10% discount $0.08 => $0.76.
INSERT INTO billing_periods (id,customer_id,period_start,period_end) VALUES
(1,1,'2026-09-01','2026-10-01'),
(2,2,'2026-09-01','2026-10-01');
INSERT INTO invoices (id,invoice_number,billing_period_id,status,subtotal,total,discount_code_id,discount_amount) VALUES
(1,'INV-2026-09-0001',1,'Paid',26.80,26.80,NULL,0.00),
(2,'INV-2026-09-0002',2,'Unpaid',0.84,0.76,1,0.08);
INSERT INTO invoice_items (invoice_id,provider_id,resource_type,cloud_class,quantity,unit_price,line_total) VALUES
(1,10,'CPU','Business',2.8000,3.00,8.40),
(1,10,'RAM','Business',5.6000,1.50,8.40),
(1,11,'CPU','Economy',1.0000,2.00,2.00),
(1,11,'RAM','Economy',2.0000,1.00,2.00),
(1,10,'Storage','Business',100.0000,0.06,6.00),
(2,10,'CPU','Critical',0.0833,5.00,0.42),
(2,10,'RAM','Critical',0.1667,2.50,0.42);

-- 6) SIMULATED PAYMENT AND PARTIAL REFUND
INSERT INTO payments (id,payment_reference,invoice_id,amount,status,simulated) VALUES
(1,'PAY-DEMO-0001',1,26.80,'Succeeded',TRUE);
INSERT INTO refunds (id,refund_reference,payment_id,amount,reason,status) VALUES
(1,'REF-DEMO-0001',1,2.00,'Service interruption credit','Succeeded');

-- 7) EARNINGS (10% PLATFORM COMMISSION)
-- Earnings correspond to the original $26.80 payment, before the $2.00 refund.
-- Real application refund handling may update balances in separate operations.
INSERT INTO provider_earnings (payment_id,provider_id,gross_amount,commission_rate,commission_amount,net_amount) VALUES
(1,10,22.80,10.00,2.28,20.52),
(1,11,4.00,10.00,0.40,3.60);
INSERT INTO withdrawal_requests (provider_id,amount,status,note) VALUES
(10,8.00,'Requested','Demo payout request'),
(11,2.00,'Approved','Demo payout awaiting settlement');

-- 8) CUSTOMER REFUND APPROVAL (linked to the refund above)
INSERT INTO refund_requests
(payment_id,customer_id,amount,reason,status,admin_note,decided_by,decided_at,refund_id) VALUES
(1,1,2.00,'Service interruption','Approved','Approved as a partial refund',99,'2026-10-05 12:00:00',1);

-- 9) PAYMENT / REFUND NOTIFICATIONS
INSERT INTO payment_notifications
(recipient_type,recipient_id,notification_type,title,message,payment_id,refund_id,is_read) VALUES
('Customer',1,'PaymentSucceeded','Payment successful','Your invoice INV-2026-09-0001 was paid.',1,NULL,TRUE),
('Provider',10,'PaymentSucceeded','Earnings recorded','Your earnings from payment PAY-DEMO-0001 were recorded.',1,NULL,FALSE),
('Provider',11,'PaymentSucceeded','Earnings recorded','Your earnings from payment PAY-DEMO-0001 were recorded.',1,NULL,FALSE),
('Customer',1,'RefundRequested','Refund requested','Your partial refund request for $2.00 was submitted.',1,NULL,TRUE),
('Customer',1,'RefundSucceeded','Refund completed','Your $2.00 partial refund was approved and processed.',1,1,FALSE);

-- 10) AUDIT TRAIL
INSERT INTO financial_audit_log (actor_id,actor_role,action,entity_type,entity_id,details) VALUES
(99,'Admin','PRICE_UPDATED','pricing_rules',2,'Demo historical CPU Business price adjustment'),
(1,'Customer','REFUND_REQUESTED','refund_requests',1,'Requested a $2.00 partial refund'),
(99,'Admin','REFUND_APPROVED','refund_requests',1,'Approved refund REF-DEMO-0001'),
(10,'Provider','WITHDRAWAL_REQUESTED','withdrawal_requests',1,'Requested $8.00 payout');

-- 11) QUICK CHECKS
SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME;
SELECT id,invoice_number,status,subtotal,discount_amount,total FROM invoices ORDER BY id;
SELECT id,payment_reference,amount,status FROM payments;
SELECT provider_id,gross_amount,commission_amount,net_amount FROM provider_earnings ORDER BY provider_id;
