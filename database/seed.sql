-- ============================================================================
-- Distributed Cloud Marketplace - seed.sql
-- DEV/TEST DATA ONLY. Compatible with the 20-table schema.sql.
-- MySQL 8.0.16+; run AFTER schema.sql on a development database.
--
-- Creates illustrative users, hosts, resource groups, all 11 resource types,
-- capacity allocations, registries, lifecycle/activity examples, and notices.
--
-- DEMO ACCOUNTS: All demo users share the same development password:
--   CloudDemo!2026
-- Passwords are stored as a bcrypt hash ($2b$12$...), not plaintext.
-- Change/delete these accounts before any publicly accessible deployment.
-- All sample email addresses use the reserved example.com domain.
--
-- Re-runnable: existing demo users/resources are not duplicated; do not use
-- as a migration or attempt to reset previously edited/deleted demo records.
-- EmailVerificationTokens and UserTwoFactor are left EMPTY intentionally:
-- the application must generate real random tokens and encrypted TOTP secrets.
-- The sample is simulation-only; it sends no emails and provisions no servers.
-- ============================================================================

USE DistributedCloudMarketplace;

-- ---------------------------------------------------------------------------
-- 1. DEMO USERS (bcrypt hash replaced with a real bcrypt value at creation)
-- ---------------------------------------------------------------------------
SET @demo_password_hash = '$2b$12$6OXrFg2zWgBoeCG6OzzwC.dx3F1.5QsvupmROAaOfHEQ1kYGZhvXS';

INSERT INTO Users
    (first_name, last_name, email, password_hash, role, email_verified_at)
VALUES
    ('Demo', 'Administrator', 'demo.admin@example.com', @demo_password_hash, 'admin', CURRENT_TIMESTAMP),
    ('Demo', 'Provider Alpha', 'demo.provider.alpha@example.com', @demo_password_hash, 'provider', CURRENT_TIMESTAMP),
    ('Demo', 'Provider Beta', 'demo.provider.beta@example.com', @demo_password_hash, 'provider', CURRENT_TIMESTAMP),
    ('Alex', 'Customer', 'demo.customer.alex@example.com', @demo_password_hash, 'customer', CURRENT_TIMESTAMP),
    ('Sam', 'Customer', 'demo.customer.sam@example.com', @demo_password_hash, 'customer', CURRENT_TIMESTAMP),
    ('Pending', 'Verification', 'demo.pending@example.com', @demo_password_hash, 'customer', NULL)
ON DUPLICATE KEY UPDATE user_id = user_id;

SELECT user_id INTO @demo_admin_id FROM Users WHERE email = 'demo.admin@example.com';
SELECT user_id INTO @demo_provider_alpha_id FROM Users WHERE email = 'demo.provider.alpha@example.com';
SELECT user_id INTO @demo_provider_beta_id FROM Users WHERE email = 'demo.provider.beta@example.com';
SELECT user_id INTO @demo_alex_id FROM Users WHERE email = 'demo.customer.alex@example.com';
SELECT user_id INTO @demo_sam_id FROM Users WHERE email = 'demo.customer.sam@example.com';

-- ---------------------------------------------------------------------------
-- 2. PROVIDER HOSTS (verified providers only; region + class are significant)
-- ---------------------------------------------------------------------------
INSERT INTO ProviderHosts
    (provider_user_id, name, region, hosting_class, status,
     total_cpu, total_ram_gb, total_disk_gb)
VALUES
    (@demo_provider_alpha_id, 'demo-eu-economy', 'eu-west', 'Economy', 'available', 16, 64, 800),
    (@demo_provider_alpha_id, 'demo-eu-business', 'eu-west', 'Business', 'available', 32, 128, 2000),
    (@demo_provider_beta_id, 'demo-us-critical', 'us-east', 'Critical', 'available', 32, 256, 4000)
ON DUPLICATE KEY UPDATE host_id = host_id;

SELECT host_id INTO @demo_host_economy FROM ProviderHosts
 WHERE provider_user_id = @demo_provider_alpha_id AND name = 'demo-eu-economy';
SELECT host_id INTO @demo_host_business FROM ProviderHosts
 WHERE provider_user_id = @demo_provider_alpha_id AND name = 'demo-eu-business';
SELECT host_id INTO @demo_host_critical FROM ProviderHosts
 WHERE provider_user_id = @demo_provider_beta_id AND name = 'demo-us-critical';

-- ---------------------------------------------------------------------------
-- 3. RESOURCE GROUPS, VNETS AND SUBNETS (free structural resources)
-- ---------------------------------------------------------------------------
INSERT INTO ResourceGroups (customer_user_id, name, region)
VALUES
    (@demo_alex_id, 'demo-production', 'eu-west'),
    (@demo_alex_id, 'demo-lab', 'eu-west'),
    (@demo_sam_id, 'demo-research', 'us-east')
ON DUPLICATE KEY UPDATE group_id = group_id;

SELECT group_id INTO @demo_prod_group FROM ResourceGroups
 WHERE customer_user_id = @demo_alex_id AND name = 'demo-production';
SELECT group_id INTO @demo_lab_group FROM ResourceGroups
 WHERE customer_user_id = @demo_alex_id AND name = 'demo-lab';
SELECT group_id INTO @demo_research_group FROM ResourceGroups
 WHERE customer_user_id = @demo_sam_id AND name = 'demo-research';

INSERT INTO VirtualNetworks (group_id, name, cidr_block)
VALUES
    (@demo_prod_group, 'demo-prod-vnet', '10.10.0.0/16'),
    (@demo_lab_group, 'demo-lab-vnet', '10.20.0.0/16'),
    (@demo_research_group, 'demo-research-vnet', '172.16.0.0/16')
ON DUPLICATE KEY UPDATE vnet_id = vnet_id;

SELECT vnet_id INTO @demo_prod_vnet FROM VirtualNetworks
 WHERE group_id = @demo_prod_group AND name = 'demo-prod-vnet';
SELECT vnet_id INTO @demo_lab_vnet FROM VirtualNetworks
 WHERE group_id = @demo_lab_group AND name = 'demo-lab-vnet';
SELECT vnet_id INTO @demo_research_vnet FROM VirtualNetworks
 WHERE group_id = @demo_research_group AND name = 'demo-research-vnet';

INSERT INTO Subnets (vnet_id, name, cidr_block)
VALUES
    (@demo_prod_vnet, 'demo-app-subnet', '10.10.1.0/24'),
    (@demo_prod_vnet, 'demo-data-subnet', '10.10.2.0/24'),
    (@demo_lab_vnet, 'demo-lab-subnet', '10.20.1.0/24'),
    (@demo_research_vnet, 'demo-research-subnet', '172.16.1.0/24')
ON DUPLICATE KEY UPDATE subnet_id = subnet_id;

SELECT subnet_id INTO @demo_prod_app_subnet FROM Subnets
 WHERE vnet_id = @demo_prod_vnet AND name = 'demo-app-subnet';
SELECT subnet_id INTO @demo_prod_data_subnet FROM Subnets
 WHERE vnet_id = @demo_prod_vnet AND name = 'demo-data-subnet';
SELECT subnet_id INTO @demo_lab_subnet FROM Subnets
 WHERE vnet_id = @demo_lab_vnet AND name = 'demo-lab-subnet';
SELECT subnet_id INTO @demo_research_subnet FROM Subnets
 WHERE vnet_id = @demo_research_vnet AND name = 'demo-research-subnet';

-- ---------------------------------------------------------------------------
-- 4. VMs + LOAD BALANCER + STORAGE + ALL 3 DATABASE ENGINES + WEB APPS
-- ---------------------------------------------------------------------------
-- VMs are NOT inserted directly below: sp_CreateVmWithAllocation atomically
-- populates HostCapacityAllocations (CPU/RAM/disk reservations), creates
-- ResourceRegistry entries and activity-log records.
-- The temporary seed helper uses the public stored procedures where required.

INSERT INTO LoadBalancers (vnet_id, name, algorithm)
VALUES (@demo_prod_vnet, 'demo-prod-lb', 'round_robin')
ON DUPLICATE KEY UPDATE lb_id = lb_id;

SELECT lb_id INTO @demo_lb_id FROM LoadBalancers
 WHERE vnet_id = @demo_prod_vnet AND name = 'demo-prod-lb';

INSERT INTO BlobStorage (group_id, name, size_gb)
VALUES
    (@demo_prod_group, 'demo-images', 100),
    (@demo_prod_group, 'demo-archived-blob', 10)
ON DUPLICATE KEY UPDATE blob_id = blob_id;

SELECT blob_id INTO @demo_blob_id FROM BlobStorage
 WHERE group_id = @demo_prod_group AND name = 'demo-images';
SELECT blob_id INTO @demo_archive_blob_id FROM BlobStorage
 WHERE group_id = @demo_prod_group AND name = 'demo-archived-blob';

INSERT INTO FileStorage (group_id, name, size_gb)
VALUES (@demo_prod_group, 'demo-shared-files', 200)
ON DUPLICATE KEY UPDATE file_id = file_id;

SELECT file_id INTO @demo_file_id FROM FileStorage
 WHERE group_id = @demo_prod_group AND name = 'demo-shared-files';

INSERT INTO ManagedDatabases (group_id, name, engine, size_gb)
VALUES
    (@demo_prod_group, 'demo-mysql', 'MYSQL', 50),
    (@demo_prod_group, 'demo-postgres', 'POSTGRESQL', 80),
    (@demo_lab_group, 'demo-sqlserver', 'SQL_SERVER', 40)
ON DUPLICATE KEY UPDATE database_id = database_id;

SELECT database_id INTO @demo_mysql_id FROM ManagedDatabases
 WHERE group_id = @demo_prod_group AND name = 'demo-mysql';
SELECT database_id INTO @demo_postgres_id FROM ManagedDatabases
 WHERE group_id = @demo_prod_group AND name = 'demo-postgres';
SELECT database_id INTO @demo_sqlserver_id FROM ManagedDatabases
 WHERE group_id = @demo_lab_group AND name = 'demo-sqlserver';

-- One Web App uses a database; the second demonstrates optional database_id.
INSERT INTO WebApps (group_id, database_id, name)
VALUES
    (@demo_prod_group, @demo_mysql_id, 'demo-portal'),
    (@demo_lab_group, NULL, 'demo-static-site')
ON DUPLICATE KEY UPDATE webapp_id = webapp_id;

SELECT webapp_id INTO @demo_portal_id FROM WebApps
 WHERE group_id = @demo_prod_group AND name = 'demo-portal';
SELECT webapp_id INTO @demo_static_id FROM WebApps
 WHERE group_id = @demo_lab_group AND name = 'demo-static-site';

-- ---------------------------------------------------------------------------
-- 5. IDEMPOTENT RESOURCE CREATION, REGISTRATION, LIFECYCLE AND TARGETS
-- ---------------------------------------------------------------------------
-- This helper exists only while seed.sql runs and is removed at the end.
-- The installed application procedures in schema.sql are left untouched.
DROP PROCEDURE IF EXISTS sp_SeedCloudDemo;
DELIMITER $$
CREATE PROCEDURE sp_SeedCloudDemo()
BEGIN
    DECLARE v_new_vm_id INT DEFAULT NULL;
    DECLARE v_new_resource_id INT DEFAULT NULL;

    -- Four VMs across Economy, Business and Critical classes/regions.
    IF NOT EXISTS (SELECT 1 FROM VirtualMachines WHERE subnet_id=@demo_prod_app_subnet AND name='demo-web-vm') THEN
        CALL sp_CreateVmWithAllocation(@demo_alex_id, @demo_prod_app_subnet,
            @demo_host_business, 'demo-web-vm', 'Business', 2, 8, 80, 0.18, v_new_vm_id);
    END IF;
    SELECT vm_id INTO @demo_web_vm FROM VirtualMachines
        WHERE subnet_id=@demo_prod_app_subnet AND name='demo-web-vm';

    IF NOT EXISTS (SELECT 1 FROM VirtualMachines WHERE subnet_id=@demo_prod_app_subnet AND name='demo-worker-vm') THEN
        CALL sp_CreateVmWithAllocation(@demo_alex_id, @demo_prod_app_subnet,
            @demo_host_business, 'demo-worker-vm', 'Business', 4, 16, 120, 0.35, v_new_vm_id);
    END IF;
    SELECT vm_id INTO @demo_worker_vm FROM VirtualMachines
        WHERE subnet_id=@demo_prod_app_subnet AND name='demo-worker-vm';

    IF NOT EXISTS (SELECT 1 FROM VirtualMachines WHERE subnet_id=@demo_lab_subnet AND name='demo-dev-vm') THEN
        CALL sp_CreateVmWithAllocation(@demo_alex_id, @demo_lab_subnet,
            @demo_host_economy, 'demo-dev-vm', 'Economy', 1, 4, 40, 0.08, v_new_vm_id);
    END IF;
    SELECT vm_id INTO @demo_dev_vm FROM VirtualMachines
        WHERE subnet_id=@demo_lab_subnet AND name='demo-dev-vm';

    IF NOT EXISTS (SELECT 1 FROM VirtualMachines WHERE subnet_id=@demo_research_subnet AND name='demo-research-vm') THEN
        CALL sp_CreateVmWithAllocation(@demo_sam_id, @demo_research_subnet,
            @demo_host_critical, 'demo-research-vm', 'Critical', 4, 32, 200, 0.65, v_new_vm_id);
    END IF;
    SELECT vm_id INTO @demo_research_vm FROM VirtualMachines
        WHERE subnet_id=@demo_research_subnet AND name='demo-research-vm';

    -- Register the remaining cloud resources. VM registration was automatic.
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE lb_id=@demo_lb_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'LOAD_BALANCER',@demo_lb_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE blob_id=@demo_blob_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'BLOB_STORAGE',@demo_blob_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE blob_id=@demo_archive_blob_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'BLOB_STORAGE',@demo_archive_blob_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE file_id=@demo_file_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'FILE_STORAGE',@demo_file_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE database_id=@demo_mysql_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'MYSQL',@demo_mysql_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE database_id=@demo_postgres_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'POSTGRESQL',@demo_postgres_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE database_id=@demo_sqlserver_id) THEN
        CALL sp_RegisterResource(@demo_lab_group,@demo_alex_id,'SQL_SERVER',@demo_sqlserver_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE webapp_id=@demo_portal_id) THEN
        CALL sp_RegisterResource(@demo_prod_group,@demo_alex_id,'WEB_APP',@demo_portal_id,v_new_resource_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ResourceRegistry WHERE webapp_id=@demo_static_id) THEN
        CALL sp_RegisterResource(@demo_lab_group,@demo_alex_id,'WEB_APP',@demo_static_id,v_new_resource_id);
    END IF;

    -- Add targets only once, after BOTH registry rows exist, to pass trigger.
    IF NOT EXISTS (SELECT 1 FROM LoadBalancerTargets
                   WHERE lb_id=@demo_lb_id AND vm_id=@demo_web_vm)
       AND EXISTS (SELECT 1 FROM ResourceRegistry
                   WHERE vm_id=@demo_web_vm AND status NOT IN ('cancelled','deleted'))
       AND EXISTS (SELECT 1 FROM ResourceRegistry
                   WHERE lb_id=@demo_lb_id AND status NOT IN ('cancelled','deleted')) THEN
        CALL sp_AddLoadBalancerTarget(@demo_lb_id,@demo_web_vm);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM LoadBalancerTargets
                   WHERE lb_id=@demo_lb_id AND vm_id=@demo_worker_vm)
       AND EXISTS (SELECT 1 FROM ResourceRegistry
                   WHERE vm_id=@demo_worker_vm AND status NOT IN ('cancelled','deleted'))
       AND EXISTS (SELECT 1 FROM ResourceRegistry
                   WHERE lb_id=@demo_lb_id AND status NOT IN ('cancelled','deleted')) THEN
        CALL sp_AddLoadBalancerTarget(@demo_lb_id,@demo_worker_vm);
    END IF;

    -- Demonstrate RUNNING vs STOPPED. Only activate a resource once.
    UPDATE VirtualMachines SET status='running'
      WHERE vm_id=@demo_web_vm AND status='stopped'
        AND EXISTS(SELECT 1 FROM ResourceRegistry
                   WHERE vm_id=@demo_web_vm AND status='stopped');
    UPDATE ResourceRegistry SET status='active',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE vm_id=@demo_web_vm AND status='stopped';

    UPDATE VirtualMachines SET status='running'
      WHERE vm_id=@demo_research_vm AND status='stopped'
        AND EXISTS(SELECT 1 FROM ResourceRegistry
                   WHERE vm_id=@demo_research_vm AND status='stopped');
    UPDATE ResourceRegistry SET status='active',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE vm_id=@demo_research_vm AND status='stopped';

    UPDATE LoadBalancers SET status='active'
      WHERE lb_id=@demo_lb_id AND status='inactive'
        AND EXISTS(SELECT 1 FROM ResourceRegistry WHERE lb_id=@demo_lb_id AND status='created');
    UPDATE ResourceRegistry SET status='active',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE lb_id=@demo_lb_id AND status='created';

    UPDATE ManagedDatabases SET status='running'
      WHERE database_id IN (@demo_mysql_id,@demo_postgres_id) AND status='stopped'
        AND EXISTS(SELECT 1 FROM ResourceRegistry
                   WHERE database_id=ManagedDatabases.database_id AND status='created');
    UPDATE ResourceRegistry SET status='active',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE database_id IN (@demo_mysql_id,@demo_postgres_id) AND status='created';

    UPDATE WebApps SET status='running'
      WHERE webapp_id=@demo_portal_id AND status='stopped'
        AND EXISTS(SELECT 1 FROM ResourceRegistry
                   WHERE webapp_id=@demo_portal_id AND status='created');
    UPDATE ResourceRegistry SET status='active',activated_at=COALESCE(activated_at,CURRENT_TIMESTAMP)
      WHERE webapp_id=@demo_portal_id AND status='created';

    -- Demonstrate cancellation: a sample inactive Blob Storage resource.
    SELECT resource_id INTO @demo_archive_registry_id FROM ResourceRegistry
      WHERE blob_id=@demo_archive_blob_id;
    IF EXISTS(SELECT 1 FROM ResourceRegistry WHERE resource_id=@demo_archive_registry_id
              AND status NOT IN ('cancelled','deleted')) THEN
        CALL sp_CancelResource(@demo_archive_registry_id,@demo_alex_id);
    END IF;
END$$
DELIMITER ;

CALL sp_SeedCloudDemo();
DROP PROCEDURE sp_SeedCloudDemo;

-- ---------------------------------------------------------------------------
-- 6. USAGE EXAMPLES, STRUCTURAL ACTIVITY LOGS AND IN-APP NOTIFICATIONS
-- ---------------------------------------------------------------------------
SELECT resource_id INTO @demo_web_registry FROM ResourceRegistry WHERE vm_id=@demo_web_vm;
SELECT resource_id INTO @demo_worker_registry FROM ResourceRegistry WHERE vm_id=@demo_worker_vm;
SELECT resource_id INTO @demo_portal_registry FROM ResourceRegistry WHERE webapp_id=@demo_portal_id;

-- A running VM has an open usage interval; the stopped worker has a closed one.
INSERT INTO ResourceUsagePeriods (resource_id, started_at, ended_at, quantity)
SELECT @demo_web_registry, CURRENT_TIMESTAMP - INTERVAL 1 HOUR, NULL, 1.0000
WHERE NOT EXISTS (SELECT 1 FROM ResourceUsagePeriods WHERE resource_id=@demo_web_registry);

INSERT INTO ResourceUsagePeriods (resource_id, started_at, ended_at, quantity)
SELECT @demo_worker_registry, CURRENT_TIMESTAMP - INTERVAL 3 HOUR,
       CURRENT_TIMESTAMP - INTERVAL 1 HOUR, 2.0000
WHERE NOT EXISTS (SELECT 1 FROM ResourceUsagePeriods WHERE resource_id=@demo_worker_registry);

INSERT INTO ResourceUsagePeriods (resource_id, started_at, ended_at, quantity)
SELECT @demo_portal_registry, CURRENT_TIMESTAMP - INTERVAL 2 HOUR, NULL, 2.0000
WHERE NOT EXISTS (SELECT 1 FROM ResourceUsagePeriods WHERE resource_id=@demo_portal_registry);

-- VM usage values are zero because amounts are not computed in this seed.
INSERT INTO VmUsage (vm_id, started_at, stopped_at)
SELECT @demo_web_vm, CURRENT_TIMESTAMP - INTERVAL 1 HOUR, NULL
WHERE NOT EXISTS (SELECT 1 FROM VmUsage WHERE vm_id=@demo_web_vm);

INSERT INTO VmUsage (vm_id, started_at, stopped_at)
SELECT @demo_worker_vm, CURRENT_TIMESTAMP - INTERVAL 3 HOUR,
       CURRENT_TIMESTAMP - INTERVAL 1 HOUR
WHERE NOT EXISTS (SELECT 1 FROM VmUsage WHERE vm_id=@demo_worker_vm);

-- Lifecycle audit events for free/structural resources (not registered).
INSERT INTO ResourceActivityLogs
    (actor_user_id,resource_id,entity_type,entity_pk,action,new_status,details)
SELECT @demo_alex_id,NULL,'RESOURCE_GROUP',@demo_prod_group,'created','active',JSON_OBJECT('seed',TRUE)
WHERE NOT EXISTS (SELECT 1 FROM ResourceActivityLogs WHERE entity_type='RESOURCE_GROUP'
                  AND entity_pk=@demo_prod_group AND action='created');

INSERT INTO ResourceActivityLogs
    (actor_user_id,resource_id,entity_type,entity_pk,action,new_status,details)
SELECT @demo_alex_id,NULL,'VIRTUAL_NETWORK',@demo_prod_vnet,'created','active',JSON_OBJECT('seed',TRUE)
WHERE NOT EXISTS (SELECT 1 FROM ResourceActivityLogs WHERE entity_type='VIRTUAL_NETWORK'
                  AND entity_pk=@demo_prod_vnet AND action='created');

INSERT INTO ResourceActivityLogs
    (actor_user_id,resource_id,entity_type,entity_pk,action,new_status,details)
SELECT @demo_alex_id,NULL,'SUBNET',@demo_prod_app_subnet,'created','active',JSON_OBJECT('seed',TRUE)
WHERE NOT EXISTS (SELECT 1 FROM ResourceActivityLogs WHERE entity_type='SUBNET'
                  AND entity_pk=@demo_prod_app_subnet AND action='created');

-- Informational in-app notifications; no real email is sent.
INSERT INTO Notifications
    (user_id,category,channel,title,message,delivery_status,sent_at)
SELECT @demo_alex_id,'resource','in_app','Demo resources ready',
       'Your demo cloud resources are available for exploring the dashboard.',
       'sent',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Notifications
                  WHERE user_id=@demo_alex_id AND title='Demo resources ready');

INSERT INTO Notifications
    (user_id,category,channel,title,message,delivery_status,sent_at)
SELECT @demo_provider_alpha_id,'system','in_app','Demo host capacity',
       'Your sample provider hosts and reserved VM capacity are ready.',
       'sent',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Notifications
                  WHERE user_id=@demo_provider_alpha_id AND title='Demo host capacity');

INSERT INTO Notifications
    (user_id,category,channel,title,message,delivery_status,sent_at)
SELECT @demo_sam_id,'resource','in_app','Demo research environment',
       'Your simulated Critical-class research VM is running.',
       'sent',CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM Notifications
                  WHERE user_id=@demo_sam_id AND title='Demo research environment');

-- ---------------------------------------------------------------------------
-- 7. QUICK CHECKS (read-only; no additional test data is inserted)
-- ---------------------------------------------------------------------------
SELECT 'Demo user accounts' AS check_name, COUNT(*) AS total
  FROM Users WHERE email LIKE 'demo.%@example.com'
UNION ALL
SELECT 'Provider hosts',COUNT(*) FROM ProviderHosts
  WHERE name LIKE 'demo-%'
UNION ALL
SELECT 'Resource groups',COUNT(*) FROM ResourceGroups
  WHERE name LIKE 'demo-%'
UNION ALL
SELECT 'Virtual machines',COUNT(*) FROM VirtualMachines
  WHERE name LIKE 'demo-%'
UNION ALL
SELECT 'Registered resources',COUNT(*) FROM ResourceRegistry r
  JOIN ResourceGroups g ON g.group_id=r.group_id
  WHERE g.name LIKE 'demo-%';

SELECT host_id, name, hosting_class, total_cpu, used_cpu, free_cpu,
       total_ram_gb, used_ram_gb, free_ram_gb,
       total_disk_gb, used_disk_gb, free_disk_gb
FROM vw_ProviderCapacity
WHERE name LIKE 'demo-%'
ORDER BY host_id;
