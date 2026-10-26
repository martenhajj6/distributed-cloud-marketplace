-- Task 5: discount codes, payment notifications and admin dashboard support.
-- Run after sql/03_create_finance_tables.sql in the existing cloud_marketplace database.
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
