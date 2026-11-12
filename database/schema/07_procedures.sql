-- =============================================================
-- 8. RESOURCE MANAGEMENT PROCEDURES
-- =============================================================
-- Install after all 20 tables have been created.
-- All operations are SIMULATED. No provisioning or real money transfers.
USE DistributedCloudMarketplace;

DELIMITER $$

-- Serialize capacity checks on the ProviderHosts row, so two requests
-- competing for the same host cannot oversubscribe its reserved capacity.
-- A stopped VM still reserves capacity until cancellation.
CREATE PROCEDURE sp_CreateVmWithAllocation(
    IN p_actor_customer_id INT,
    IN p_subnet_id INT,
    IN p_host_id INT,
    IN p_name VARCHAR(100),
    IN p_hosting_class VARCHAR(20),
    IN p_vcpu INT,
    IN p_ram_gb INT,
    IN p_disk_gb INT,
    IN p_hourly_price DECIMAL(10,2),
    OUT p_new_vm_id INT
)
BEGIN
    DECLARE v_host_region VARCHAR(50);
    DECLARE v_host_class VARCHAR(20);
    DECLARE v_host_status VARCHAR(20);
    DECLARE v_provider_role VARCHAR(20);
    DECLARE v_provider_verified DATETIME;
    DECLARE v_total_cpu INT;
    DECLARE v_total_ram INT;
    DECLARE v_total_disk INT;
    DECLARE v_used_cpu BIGINT DEFAULT 0;
    DECLARE v_used_ram BIGINT DEFAULT 0;
    DECLARE v_used_disk BIGINT DEFAULT 0;
    DECLARE v_group_id INT;
    DECLARE v_customer_id INT;
    DECLARE v_group_region VARCHAR(50);
    DECLARE v_customer_role VARCHAR(20);
    DECLARE v_customer_verified DATETIME;
    DECLARE v_group_status VARCHAR(20);
    DECLARE v_vnet_status VARCHAR(20);
    DECLARE v_subnet_status VARCHAR(20);
    DECLARE v_missing BOOLEAN DEFAULT FALSE;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_missing = TRUE;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    SET p_new_vm_id = NULL;
    IF p_vcpu <= 0 OR p_ram_gb <= 0 OR p_disk_gb <= 0
        OR p_hourly_price < 0 OR p_hosting_class NOT IN ('Economy','Business','Critical') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VM specification';
    END IF;
    START TRANSACTION;
    SET v_missing = FALSE;
    SELECT h.region, h.hosting_class, h.status,
           h.total_cpu, h.total_ram_gb, h.total_disk_gb,
           u.role, u.email_verified_at
    INTO v_host_region, v_host_class, v_host_status,
         v_total_cpu, v_total_ram, v_total_disk,
         v_provider_role, v_provider_verified
    FROM ProviderHosts h JOIN Users u ON u.user_id = h.provider_user_id
    WHERE h.host_id = p_host_id FOR UPDATE;
    IF v_missing THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Provider host not found';
    END IF;
    IF v_host_status <> 'available' OR v_host_class <> p_hosting_class
        OR v_provider_role <> 'provider' OR v_provider_verified IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host unavailable, unverified or class mismatch';
    END IF;

    SET v_missing = FALSE;
    SELECT g.group_id, g.customer_user_id, g.region,
           u.role, u.email_verified_at, g.status, n.status, s.status
    INTO v_group_id, v_customer_id, v_group_region,
         v_customer_role, v_customer_verified, v_group_status, v_vnet_status, v_subnet_status
    FROM Subnets s
    JOIN VirtualNetworks n ON n.vnet_id = s.vnet_id
    JOIN ResourceGroups g ON g.group_id = n.group_id
    JOIN Users u ON u.user_id = g.customer_user_id
    WHERE s.subnet_id = p_subnet_id;
    IF v_missing THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Subnet or resource group not found';
    END IF;
    IF p_actor_customer_id IS NULL OR v_customer_id <> p_actor_customer_id
        OR v_group_region <> v_host_region OR v_customer_role <> 'customer'
        OR v_customer_verified IS NULL
        OR v_group_status <> 'active' OR v_vnet_status <> 'active'
        OR v_subnet_status <> 'active' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Region mismatch or customer unverified';
    END IF;

    SELECT COALESCE(SUM(allocated_cpu),0),
           COALESCE(SUM(allocated_ram_gb),0),
           COALESCE(SUM(allocated_disk_gb),0)
    INTO v_used_cpu, v_used_ram, v_used_disk
    FROM HostCapacityAllocations
    WHERE host_id = p_host_id AND released_at IS NULL;
    IF v_used_cpu + p_vcpu > v_total_cpu
       OR v_used_ram + p_ram_gb > v_total_ram
       OR v_used_disk + p_disk_gb > v_total_disk THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient provider capacity';
    END IF;

    INSERT INTO VirtualMachines
        (subnet_id, host_id, name, hosting_class, vcpu, ram_gb, disk_gb, hourly_price)
    VALUES (p_subnet_id, p_host_id, p_name, p_hosting_class,
            p_vcpu, p_ram_gb, p_disk_gb, p_hourly_price);
    SET p_new_vm_id = LAST_INSERT_ID();

    INSERT INTO HostCapacityAllocations
        (vm_id, host_id, allocated_cpu, allocated_ram_gb, allocated_disk_gb)
    VALUES (p_new_vm_id, p_host_id, p_vcpu, p_ram_gb, p_disk_gb);

    INSERT INTO ResourceRegistry
        (group_id, customer_user_id, resource_type, vm_id, status)
    VALUES (v_group_id, v_customer_id, 'VIRTUAL_MACHINE', p_new_vm_id, 'stopped');

    INSERT INTO ResourceActivityLogs (actor_user_id, resource_id, entity_type, entity_pk, action, new_status)
    VALUES (p_actor_customer_id, LAST_INSERT_ID(), 'VIRTUAL_MACHINE', p_new_vm_id, 'created', 'stopped');
    COMMIT;
END$$

-- Use for Blob/File/LB/ManagedDatabase/WebApp after inserting their row.
-- Verifies the group belongs to the customer and the ID/type matches.
CREATE PROCEDURE sp_RegisterResource(
    IN p_group_id INT,
    IN p_customer_id INT,
    IN p_resource_type VARCHAR(30),
    IN p_entity_id INT,
    OUT p_new_resource_id INT
)
BEGIN
    DECLARE v_actual_group INT DEFAULT NULL;
    DECLARE v_db_engine VARCHAR(30) DEFAULT NULL;
    DECLARE v_customer_ok INT DEFAULT 0;
    DECLARE v_initial_status VARCHAR(20) DEFAULT 'created';
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;
    SET p_new_resource_id = NULL;
    START TRANSACTION;
    SELECT COUNT(*) INTO v_customer_ok
    FROM ResourceGroups g JOIN Users u ON u.user_id = g.customer_user_id
    WHERE g.group_id = p_group_id AND g.customer_user_id = p_customer_id
      AND g.status='active' AND u.role = 'customer' AND u.email_verified_at IS NOT NULL;
    IF v_customer_ok <> 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Customer or resource group invalid';
    END IF;
    CASE p_resource_type
        WHEN 'LOAD_BALANCER' THEN
            SELECT MAX(n.group_id) INTO v_actual_group
            FROM LoadBalancers l JOIN VirtualNetworks n ON n.vnet_id = l.vnet_id
            WHERE l.lb_id = p_entity_id;
        WHEN 'BLOB_STORAGE' THEN
            SELECT MAX(group_id) INTO v_actual_group FROM BlobStorage WHERE blob_id = p_entity_id;
            SET v_initial_status='active';
        WHEN 'FILE_STORAGE' THEN
            SELECT MAX(group_id) INTO v_actual_group FROM FileStorage WHERE file_id = p_entity_id;
            SET v_initial_status='active';
        WHEN 'SQL_SERVER' THEN
            SELECT MAX(group_id), MAX(engine) INTO v_actual_group, v_db_engine
            FROM ManagedDatabases WHERE database_id = p_entity_id;
        WHEN 'POSTGRESQL' THEN
            SELECT MAX(group_id), MAX(engine) INTO v_actual_group, v_db_engine
            FROM ManagedDatabases WHERE database_id = p_entity_id;
        WHEN 'MYSQL' THEN
            SELECT MAX(group_id), MAX(engine) INTO v_actual_group, v_db_engine
            FROM ManagedDatabases WHERE database_id = p_entity_id;
        WHEN 'WEB_APP' THEN
            SELECT MAX(group_id) INTO v_actual_group FROM WebApps WHERE webapp_id = p_entity_id;
        ELSE
            SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Use VM allocation procedure for VMs';
    END CASE;
    IF v_actual_group IS NULL OR v_actual_group <> p_group_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource not in customer group';
    END IF;
    IF p_resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL')
        AND v_db_engine <> p_resource_type THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed DB engine mismatch';
    END IF;
    INSERT INTO ResourceRegistry
        (group_id, customer_user_id, resource_type, lb_id, blob_id,
         file_id, database_id, webapp_id, status, activated_at)
    VALUES (p_group_id, p_customer_id, p_resource_type,
            IF(p_resource_type='LOAD_BALANCER',p_entity_id,NULL),
            IF(p_resource_type='BLOB_STORAGE',p_entity_id,NULL),
            IF(p_resource_type='FILE_STORAGE',p_entity_id,NULL),
            IF(p_resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL'),p_entity_id,NULL),
            IF(p_resource_type='WEB_APP',p_entity_id,NULL),
            v_initial_status,
            IF(v_initial_status='active',CURRENT_TIMESTAMP,NULL));
    SET p_new_resource_id = LAST_INSERT_ID();
    INSERT INTO ResourceActivityLogs (actor_user_id, resource_id, entity_type, entity_pk, action, new_status)
    VALUES (p_customer_id,p_new_resource_id,p_resource_type,p_entity_id,'registered',v_initial_status);
    COMMIT;
END$$

-- Prevent creating targets between unrelated networks.
CREATE PROCEDURE sp_AddLoadBalancerTarget(IN p_lb_id INT, IN p_vm_id INT)
BEGIN
    DECLARE v_valid INT DEFAULT 0;

    IF p_lb_id IS NULL OR p_vm_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Load Balancer ID and VM ID are required';
    END IF;

    SELECT COUNT(*) INTO v_valid
    FROM LoadBalancers lb
    JOIN VirtualNetworks n ON n.vnet_id = lb.vnet_id
    JOIN ResourceGroups g ON g.group_id = n.group_id
    JOIN ResourceRegistry lr ON lr.lb_id = lb.lb_id
    JOIN VirtualMachines vm ON vm.vm_id = p_vm_id
    JOIN Subnets s ON s.subnet_id = vm.subnet_id
    JOIN ResourceRegistry vr ON vr.vm_id = vm.vm_id
    WHERE lb.lb_id = p_lb_id
      AND lb.vnet_id = s.vnet_id
      AND n.status = 'active'
      AND g.status = 'active'
      AND s.status = 'active'
      AND lr.status NOT IN ('cancelled','deleted')
      AND vr.status NOT IN ('cancelled','deleted');

    IF v_valid <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT='Both resources must be registered, not cancelled, and in the same active VNet';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM LoadBalancerTargets
        WHERE lb_id = p_lb_id AND vm_id = p_vm_id
    ) THEN
        INSERT INTO LoadBalancerTargets (lb_id, vm_id)
        VALUES (p_lb_id, p_vm_id);
    END IF;
END$$


-- Soft cancellation: close usage intervals and release host reservation.
-- Backend should calculate any relevant usage snapshot before cancellation.
CREATE PROCEDURE sp_CancelResource(
    IN p_resource_id INT,
    IN p_actor_user_id INT
)
BEGIN
    DECLARE v_type VARCHAR(30) DEFAULT NULL;
    DECLARE v_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_customer_id INT DEFAULT NULL;
    DECLARE v_vm_id INT DEFAULT NULL;
    DECLARE v_lb_id INT DEFAULT NULL;
    DECLARE v_blob_id INT DEFAULT NULL;
    DECLARE v_file_id INT DEFAULT NULL;
    DECLARE v_db_id INT DEFAULT NULL;
    DECLARE v_webapp_id INT DEFAULT NULL;
    DECLARE v_actor_role VARCHAR(20) DEFAULT NULL;
    DECLARE v_vm_host_id INT DEFAULT NULL;
    DECLARE v_host_lock_id INT DEFAULT NULL;
    DECLARE v_dependent_apps INT DEFAULT 0;
    DECLARE v_missing BOOLEAN DEFAULT FALSE;
    DECLARE v_now DATETIME;
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_missing = TRUE;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        RESIGNAL;
    END;

    IF p_resource_id IS NULL OR p_actor_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT='Resource ID and actor user ID are required';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM Users WHERE user_id = p_actor_user_id) THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT='Actor user does not exist';
    END IF;

    SET v_now = CURRENT_TIMESTAMP;
    START TRANSACTION;

    SELECT role INTO v_actor_role FROM Users WHERE user_id = p_actor_user_id;
    SET v_missing = FALSE;
    SELECT resource_type, status, customer_user_id, vm_id, lb_id,
           blob_id, file_id, database_id, webapp_id
    INTO v_type, v_status, v_customer_id, v_vm_id, v_lb_id,
         v_blob_id, v_file_id, v_db_id, v_webapp_id
    FROM ResourceRegistry
    WHERE resource_id = p_resource_id FOR UPDATE;

    IF v_missing THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='ResourceRegistry resource ID not found';
    END IF;
    IF p_actor_user_id <> v_customer_id AND v_actor_role <> 'admin' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Actor is not allowed to cancel this resource';
    END IF;
    IF v_status IN ('cancelled','deleted') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource is already cancelled or deleted';
    END IF;
    -- Check dependencies BEFORE changing anything.
    IF v_db_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_dependent_apps
        FROM WebApps w
        LEFT JOIN ResourceRegistry reg ON reg.webapp_id = w.webapp_id
        WHERE w.database_id = v_db_id
          AND (reg.resource_id IS NULL OR reg.status NOT IN ('cancelled','deleted'));
        IF v_dependent_apps > 0 THEN
            SIGNAL SQLSTATE '45000'
                SET MESSAGE_TEXT='Cancel Web Apps connected to this database first';
        END IF;
    END IF;
    IF v_vm_id IS NOT NULL THEN
        -- Serialize release with VM capacity allocation on the host.
        SELECT host_id INTO v_vm_host_id
        FROM VirtualMachines WHERE vm_id = v_vm_id;
        SELECT host_id INTO v_host_lock_id
        FROM ProviderHosts WHERE host_id = v_vm_host_id FOR UPDATE;
        -- A cancelled VM cannot remain a target of another LB.
        DELETE FROM LoadBalancerTargets WHERE vm_id = v_vm_id;
        UPDATE VirtualMachines SET status = 'stopped' WHERE vm_id = v_vm_id;
        UPDATE VmUsage SET stopped_at = GREATEST(started_at, v_now)
        WHERE vm_id = v_vm_id AND stopped_at IS NULL;
        UPDATE HostCapacityAllocations
        SET released_at = GREATEST(allocated_at, v_now)
        WHERE vm_id = v_vm_id AND released_at IS NULL;
    ELSEIF v_lb_id IS NOT NULL THEN
        -- A cancelled LB must not retain active target relations.
        DELETE FROM LoadBalancerTargets WHERE lb_id = v_lb_id;
        UPDATE LoadBalancers SET status = 'inactive' WHERE lb_id = v_lb_id;
    ELSEIF v_blob_id IS NOT NULL THEN
        UPDATE BlobStorage SET status = 'inactive' WHERE blob_id = v_blob_id;
    ELSEIF v_file_id IS NOT NULL THEN
        UPDATE FileStorage SET status = 'inactive' WHERE file_id = v_file_id;
    ELSEIF v_db_id IS NOT NULL THEN
        UPDATE ManagedDatabases SET status = 'stopped' WHERE database_id = v_db_id;
    ELSEIF v_webapp_id IS NOT NULL THEN
        UPDATE WebApps SET status = 'stopped' WHERE webapp_id = v_webapp_id;
    END IF;

    UPDATE ResourceUsagePeriods
    SET ended_at = GREATEST(started_at, v_now)
    WHERE resource_id = p_resource_id AND ended_at IS NULL;

    UPDATE ResourceRegistry
    SET status = 'cancelled', cancelled_at = v_now
    WHERE resource_id = p_resource_id;

    INSERT INTO ResourceActivityLogs
        (actor_user_id, resource_id, entity_type, entity_pk,
         action, old_status, new_status)
    VALUES (p_actor_user_id, p_resource_id, v_type,
            COALESCE(v_vm_id,v_lb_id,v_blob_id,v_file_id,v_db_id,v_webapp_id),
            'cancelled',v_status,'cancelled');
    COMMIT;
END$$


DELIMITER ;


