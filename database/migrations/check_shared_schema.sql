-- READ-ONLY compatibility check. Run against the intended shared database.
USE cloud_marketplace;

-- Names may be case-insensitive on Windows MySQL installations.
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND LOWER(TABLE_NAME) IN ('vmusage', 'vm_usage', 'resourceusageperiods',
    'resource_usage_periods', 'notifications', 'payment_notifications',
    'users', 'providerhosts', 'virtualmachines')
ORDER BY TABLE_NAME;

-- Compare columns with the usage queries in services/usageBillingService.js.
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND LOWER(TABLE_NAME) IN ('vmusage', 'vm_usage', 'resourceusageperiods',
    'resource_usage_periods', 'notifications', 'payment_notifications')
ORDER BY TABLE_NAME, ORDINAL_POSITION;
