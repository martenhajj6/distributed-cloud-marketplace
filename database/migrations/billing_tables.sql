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
