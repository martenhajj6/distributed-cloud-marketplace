-- OPTIONAL test data for usage-based billing. Run after sql/usage_refunds_audit.sql, and ONLY on a
-- development database. Delete these rows once Developer 1's start/stop code writes real usage.
-- Customers 1 and 2, providers 10 and 11 are placeholder ids: change them to real user ids.
USE cloud_marketplace;

-- Customer 1, VM 1 (provider 10, Business, 4 CPU / 8 GB): ran 1-11 Sep, was STOPPED 11-20 Sep (no row = not billed),
-- then started again on 20 Sep and is still running.
INSERT INTO vm_usage (customer_id, provider_id, vm_id, cloud_class, cpu_cores, ram_gb, gpu_units, started_at, stopped_at) VALUES
(1, 10, 1, 'Business', 4, 8, 0, '2026-09-01 00:00:00', '2026-09-11 00:00:00'),
(1, 10, 1, 'Business', 4, 8, 0, '2026-09-20 00:00:00', NULL);

-- Customer 1, VM 2 (provider 11, Economy, 2 CPU / 4 GB): ran 15-30 Sep.
INSERT INTO vm_usage (customer_id, provider_id, vm_id, cloud_class, cpu_cores, ram_gb, gpu_units, started_at, stopped_at) VALUES
(1, 11, 2, 'Economy', 2, 4, 0, '2026-09-15 00:00:00', '2026-09-30 00:00:00');

-- Customer 1, VM 3: only ran in August, so it must not appear on the September invoice.
INSERT INTO vm_usage (customer_id, provider_id, vm_id, cloud_class, cpu_cores, ram_gb, gpu_units, started_at, stopped_at) VALUES
(1, 10, 3, 'Business', 8, 16, 0, '2026-08-01 00:00:00', '2026-08-31 00:00:00');

-- Customer 1: 100 GB Business storage (provider 10) for the whole of September.
INSERT INTO resource_usage_periods (customer_id, provider_id, resource_id, resource_type, cloud_class, quantity, started_at, ended_at) VALUES
(1, 10, 1, 'Storage', 'Business', 100, '2026-08-15 00:00:00', NULL);

-- Customer 2, VM 4 (provider 10, Critical, 1 CPU / 2 GB): ran 60 hours.
INSERT INTO vm_usage (customer_id, provider_id, vm_id, cloud_class, cpu_cores, ram_gb, gpu_units, started_at, stopped_at) VALUES
(2, 10, 4, 'Critical', 1, 2, 0, '2026-09-01 00:00:00', '2026-09-03 12:00:00');

-- Expected September 2026 invoice for customer 1 with the starter prices (720-hour month):
--   VM 1: 504 running hours -> CPU 4 x 504/720 x $3 = $8.40, RAM 8 x 504/720 x $1.50 = $8.40
--   VM 2: 360 running hours -> CPU 2 x 360/720 x $2 = $2.00, RAM 4 x 360/720 x $1 = $2.00
--   Storage: 100 GB x $0.06 = $6.00        TOTAL = $26.80   (provider 10: $22.80, provider 11: $4.00)
