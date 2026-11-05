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
