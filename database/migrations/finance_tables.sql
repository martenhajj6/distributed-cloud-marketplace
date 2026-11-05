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
