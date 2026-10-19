-- ============================================================================
-- Distributed Cloud Marketplace - schema.sql
-- MySQL 8.0.16+ (MySQL 8.0.34+ recommended), InnoDB, utf8mb4
--
-- Creates: 20 tables, core stored procedures, validation triggers,
-- and a provider capacity view. No sample/seed records are inserted.
--
-- Supports:
--   * Users, role-based access, email verification, and TOTP 2FA storage
--   * Provider hosts and reserved VM capacity
--   * All 11 simulated cloud resource types (3 share ManagedDatabases)
--   * Dependencies, lifecycle, activity logging, and notifications
--   * Resource registry and simulated usage records
--
-- IMPORTANT:
--   1. Execute once on a fresh database (existing tables cause errors).
--   2. Back up existing data before attempting any migration.
--   3. Database permissions must restrict direct INSERT/UPDATE on resource
--      tables; backend must use validated operations and transactions.
--   4. CIDR validation, email delivery, TOTP validation, auth sessions,
--      full lifecycle dependency checks and notifications are backend tasks.
--   5. Nothing here provisions real cloud resources or sends real emails.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS DistributedCloudMarketplace
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE DistributedCloudMarketplace;

-- =============================================================
-- 1. IDENTITY & SECURITY (definitions confirmed for project)
-- =============================================================

CREATE TABLE Users (
    user_id           INT AUTO_INCREMENT PRIMARY KEY,
    first_name        VARCHAR(100) NOT NULL,
    last_name         VARCHAR(100) NOT NULL,
    email             VARCHAR(255) NOT NULL UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    role              ENUM('customer', 'provider', 'admin') NOT NULL,
    email_verified_at DATETIME NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE EmailVerificationTokens (
    token_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    token_hash   CHAR(64) NOT NULL UNIQUE,
    expires_at   DATETIME NOT NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at      DATETIME NULL,
    CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id)
        REFERENCES Users(user_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    INDEX idx_email_tokens_user (user_id),
    INDEX idx_email_tokens_expires (expires_at)
) ENGINE=InnoDB;

CREATE TABLE UserTwoFactor (
    user_id          INT PRIMARY KEY,
    encrypted_secret VARBINARY(512) NOT NULL,
    enabled_at       DATETIME NULL,
    last_used_step   BIGINT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_twofactor_user FOREIGN KEY (user_id)
        REFERENCES Users(user_id) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- =============================================================
-- 2. PROVIDERS & CUSTOMER RESOURCE GROUPS
-- =============================================================

CREATE TABLE ProviderHosts (
    host_id          INT AUTO_INCREMENT PRIMARY KEY,
    provider_user_id INT NOT NULL,
    name             VARCHAR(100) NOT NULL,
    region           VARCHAR(50) NOT NULL,
    hosting_class    ENUM('Economy', 'Business', 'Critical') NOT NULL,
    status           ENUM('available', 'maintenance', 'inactive')
                        NOT NULL DEFAULT 'available',
    total_cpu        INT NOT NULL,
    total_ram_gb     INT NOT NULL,
    total_disk_gb    INT NOT NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hosts_provider FOREIGN KEY (provider_user_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_hosts_capacity CHECK
        (total_cpu > 0 AND total_ram_gb > 0 AND total_disk_gb > 0),
    CONSTRAINT uq_host_name_per_provider UNIQUE (provider_user_id, name),
    -- Helps require a VM's hosting class to match its assigned host.
    CONSTRAINT uq_host_id_class UNIQUE (host_id, hosting_class),
    INDEX idx_hosts_match (region, hosting_class, status)
) ENGINE=InnoDB;

CREATE TABLE ResourceGroups (
    group_id         INT AUTO_INCREMENT PRIMARY KEY,
    customer_user_id INT NOT NULL,
    name             VARCHAR(100) NOT NULL,
    region           VARCHAR(50) NOT NULL,
    status           ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
    deleted_at       DATETIME NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_groups_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
    CONSTRAINT uq_group_owner UNIQUE (group_id, customer_user_id),
    CONSTRAINT fk_groups_customer FOREIGN KEY (customer_user_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_group_per_customer UNIQUE (customer_user_id, name)
) ENGINE=InnoDB;

-- =============================================================
-- 3. NETWORKING & VIRTUAL MACHINES
-- =============================================================

CREATE TABLE VirtualNetworks (
    vnet_id      INT AUTO_INCREMENT PRIMARY KEY,
    group_id     INT NOT NULL,
    name         VARCHAR(100) NOT NULL,
    cidr_block   VARCHAR(43) NOT NULL,
    status       ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
    deleted_at   DATETIME NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_vnets_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
    CONSTRAINT fk_vnets_group FOREIGN KEY (group_id)
        REFERENCES ResourceGroups(group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vnet_per_group UNIQUE (group_id, name)
) ENGINE=InnoDB;

CREATE TABLE Subnets (
    subnet_id    INT AUTO_INCREMENT PRIMARY KEY,
    vnet_id      INT NOT NULL,
    name         VARCHAR(100) NOT NULL,
    cidr_block   VARCHAR(43) NOT NULL,
    status       ENUM('active', 'deleted') NOT NULL DEFAULT 'active',
    deleted_at   DATETIME NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_subnets_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
    CONSTRAINT fk_subnets_vnet FOREIGN KEY (vnet_id)
        REFERENCES VirtualNetworks(vnet_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_subnet_per_vnet UNIQUE (vnet_id, name)
) ENGINE=InnoDB;

CREATE TABLE VirtualMachines (
    vm_id          INT AUTO_INCREMENT PRIMARY KEY,
    subnet_id      INT NOT NULL,
    host_id        INT NOT NULL,
    name           VARCHAR(100) NOT NULL,
    hosting_class  ENUM('Economy', 'Business', 'Critical') NOT NULL,
    vcpu           INT NOT NULL,
    ram_gb         INT NOT NULL,
    disk_gb        INT NOT NULL,
    status         ENUM('stopped', 'running', 'error')
                       NOT NULL DEFAULT 'stopped',
    hourly_price   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vms_subnet FOREIGN KEY (subnet_id)
        REFERENCES Subnets(subnet_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vms_host_class FOREIGN KEY (host_id, hosting_class)
        REFERENCES ProviderHosts(host_id, hosting_class)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vm_per_subnet UNIQUE (subnet_id, name),
    CONSTRAINT uq_vm_id_host UNIQUE (vm_id, host_id),
    CONSTRAINT ck_vms_capacity CHECK (vcpu > 0 AND ram_gb > 0 AND disk_gb > 0),
    CONSTRAINT ck_vms_price CHECK (hourly_price >= 0),
    INDEX idx_vms_host (host_id, hosting_class)
) ENGINE=InnoDB;

CREATE TABLE LoadBalancers (
    lb_id        INT AUTO_INCREMENT PRIMARY KEY,
    vnet_id      INT NOT NULL,
    name         VARCHAR(100) NOT NULL,
    algorithm    ENUM('round_robin', 'least_connections')
                     NOT NULL DEFAULT 'round_robin',
    status       ENUM('inactive', 'active') NOT NULL DEFAULT 'inactive',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lb_vnet FOREIGN KEY (vnet_id)
        REFERENCES VirtualNetworks(vnet_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_lb_per_vnet UNIQUE (vnet_id, name)
) ENGINE=InnoDB;

CREATE TABLE LoadBalancerTargets (
    lb_id INT NOT NULL,
    vm_id INT NOT NULL,
    PRIMARY KEY (lb_id, vm_id),
    CONSTRAINT fk_lb_targets_lb FOREIGN KEY (lb_id)
        REFERENCES LoadBalancers(lb_id) ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_lb_targets_vm FOREIGN KEY (vm_id)
        REFERENCES VirtualMachines(vm_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    INDEX idx_lb_targets_vm (vm_id)
) ENGINE=InnoDB;

CREATE TABLE VmUsage (
    usage_id         INT AUTO_INCREMENT PRIMARY KEY,
    vm_id            INT NOT NULL,
    started_at       DATETIME NOT NULL,
    stopped_at       DATETIME NULL,
    simulated_cost   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    provider_earning DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    CONSTRAINT fk_vm_usage_vm FOREIGN KEY (vm_id)
        REFERENCES VirtualMachines(vm_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT ck_vm_usage_times CHECK
        (stopped_at IS NULL OR stopped_at >= started_at),
    CONSTRAINT ck_vm_usage_costs CHECK
        (simulated_cost >= 0 AND provider_earning >= 0),
    INDEX idx_usage_vm_start (vm_id, started_at)
) ENGINE=InnoDB;

-- =============================================================
-- 4. STORAGE & MANAGED SERVICES
-- =============================================================

CREATE TABLE BlobStorage (
    blob_id     INT AUTO_INCREMENT PRIMARY KEY,
    group_id    INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    size_gb     INT NOT NULL,
    status      ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_blob_group FOREIGN KEY (group_id)
        REFERENCES ResourceGroups(group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_blob_per_group UNIQUE (group_id, name),
    CONSTRAINT uq_blob_id_group UNIQUE (blob_id, group_id),
    CONSTRAINT ck_blob_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE FileStorage (
    file_id     INT AUTO_INCREMENT PRIMARY KEY,
    group_id    INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    size_gb     INT NOT NULL,
    status      ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_file_group FOREIGN KEY (group_id)
        REFERENCES ResourceGroups(group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_file_per_group UNIQUE (group_id, name),
    CONSTRAINT uq_file_id_group UNIQUE (file_id, group_id),
    CONSTRAINT ck_file_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE ManagedDatabases (
    database_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id    INT NOT NULL,
    name        VARCHAR(100) NOT NULL,
    engine      ENUM('SQL_SERVER', 'POSTGRESQL', 'MYSQL') NOT NULL,
    size_gb     INT NOT NULL,
    status      ENUM('stopped', 'running') NOT NULL DEFAULT 'stopped',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_db_group FOREIGN KEY (group_id)
        REFERENCES ResourceGroups(group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_db_per_group UNIQUE (group_id, name),
    CONSTRAINT uq_db_id_group UNIQUE (database_id, group_id),
    CONSTRAINT ck_db_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE WebApps (
    webapp_id    INT AUTO_INCREMENT PRIMARY KEY,
    group_id     INT NOT NULL,
    database_id  INT NULL,
    name         VARCHAR(100) NOT NULL,
    status       ENUM('stopped', 'running') NOT NULL DEFAULT 'stopped',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_webapp_group FOREIGN KEY (group_id)
        REFERENCES ResourceGroups(group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    -- Prevent linking a Web App to a DB in a different resource group.
    -- When database_id is NULL, a Web App has no database.
    CONSTRAINT fk_webapp_db_same_group FOREIGN KEY (database_id, group_id)
        REFERENCES ManagedDatabases(database_id, group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_webapp_per_group UNIQUE (group_id, name),
    CONSTRAINT uq_webapp_id_group UNIQUE (webapp_id, group_id),
    INDEX idx_webapp_db_group (database_id, group_id)
) ENGINE=InnoDB;

-- =============================================================
-- 6. RESOURCE IDENTITY, LIFECYCLE & CAPACITY RESERVATION
-- =============================================================
-- ResourceGroups, VirtualNetworks and Subnets are FREE and tracked
-- directly. Billable resources get registry rows; changes are audit logged.
-- A registered resource refers to exactly one actual resource.
CREATE TABLE ResourceRegistry (
    resource_id       INT AUTO_INCREMENT PRIMARY KEY,
    group_id          INT NOT NULL,
    customer_user_id  INT NOT NULL,
    resource_type     ENUM('VIRTUAL_MACHINE','LOAD_BALANCER','BLOB_STORAGE',
                           'FILE_STORAGE','SQL_SERVER','POSTGRESQL','MYSQL',
                           'WEB_APP') NOT NULL,
    vm_id             INT NULL,
    lb_id             INT NULL,
    blob_id           INT NULL,
    file_id           INT NULL,
    database_id       INT NULL,
    webapp_id         INT NULL,
    status            ENUM('created','active','stopped','cancelled','deleted')
                         NOT NULL DEFAULT 'created',
    activated_at      DATETIME NULL,
    cancelled_at      DATETIME NULL,
    deleted_at        DATETIME NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_registry_group_owner FOREIGN KEY (group_id, customer_user_id)
        REFERENCES ResourceGroups(group_id, customer_user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_lb FOREIGN KEY (lb_id) REFERENCES LoadBalancers(lb_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_blob_same_group FOREIGN KEY (blob_id, group_id)
        REFERENCES BlobStorage(blob_id, group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_file_same_group FOREIGN KEY (file_id, group_id)
        REFERENCES FileStorage(file_id, group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_db_same_group FOREIGN KEY (database_id, group_id)
        REFERENCES ManagedDatabases(database_id, group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_webapp_same_group FOREIGN KEY (webapp_id, group_id)
        REFERENCES WebApps(webapp_id, group_id) ON DELETE RESTRICT,
    CONSTRAINT uq_registry_resource_owner UNIQUE (resource_id, customer_user_id),
    CONSTRAINT uq_registry_vm UNIQUE (vm_id),
    CONSTRAINT uq_registry_lb UNIQUE (lb_id),
    CONSTRAINT uq_registry_blob UNIQUE (blob_id),
    CONSTRAINT uq_registry_file UNIQUE (file_id),
    CONSTRAINT uq_registry_db UNIQUE (database_id),
    CONSTRAINT uq_registry_webapp UNIQUE (webapp_id),
    CONSTRAINT ck_registry_one_resource CHECK (
        (vm_id IS NOT NULL) + (lb_id IS NOT NULL) + (blob_id IS NOT NULL) +
        (file_id IS NOT NULL) + (database_id IS NOT NULL) + (webapp_id IS NOT NULL) = 1
    ),
    CONSTRAINT ck_registry_type_matches CHECK (
        (resource_type = 'VIRTUAL_MACHINE' AND vm_id IS NOT NULL) OR
        (resource_type = 'LOAD_BALANCER' AND lb_id IS NOT NULL) OR
        (resource_type = 'BLOB_STORAGE' AND blob_id IS NOT NULL) OR
        (resource_type = 'FILE_STORAGE' AND file_id IS NOT NULL) OR
        (resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL') AND database_id IS NOT NULL) OR
        (resource_type = 'WEB_APP' AND webapp_id IS NOT NULL)
    ),
    CONSTRAINT ck_registry_status_dates CHECK (
        (status <> 'cancelled' OR cancelled_at IS NOT NULL) AND
        (status <> 'deleted' OR deleted_at IS NOT NULL)
    ),
    INDEX idx_registry_owner (customer_user_id, status),
    INDEX idx_registry_group (group_id, resource_type)
) ENGINE=InnoDB;

-- One reservation per VM. Even a STOPPED VM keeps its allocation until
-- cancellation, avoiding accidental overselling of reserved capacity.
CREATE TABLE HostCapacityAllocations (
    allocation_id INT AUTO_INCREMENT PRIMARY KEY,
    vm_id         INT NOT NULL UNIQUE,
    host_id       INT NOT NULL,
    allocated_cpu INT NOT NULL,
    allocated_ram_gb INT NOT NULL,
    allocated_disk_gb INT NOT NULL,
    allocated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at   DATETIME NULL,
    CONSTRAINT fk_alloc_vm_host FOREIGN KEY (vm_id, host_id)
        REFERENCES VirtualMachines(vm_id, host_id) ON DELETE RESTRICT,
    CONSTRAINT fk_alloc_host FOREIGN KEY (host_id)
        REFERENCES ProviderHosts(host_id) ON DELETE RESTRICT,
    CONSTRAINT ck_allocation_positive CHECK
        (allocated_cpu > 0 AND allocated_ram_gb > 0 AND allocated_disk_gb > 0),
    CONSTRAINT ck_allocation_dates CHECK
        (released_at IS NULL OR released_at >= allocated_at),
    INDEX idx_alloc_host_active (host_id, released_at)
) ENGINE=InnoDB;

-- Tracks usage intervals and measured quantity (e.g. hours or GB-months).
-- Express is responsible for calculating and closing usage intervals.
CREATE TABLE ResourceUsagePeriods (
    usage_period_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id     INT NOT NULL,
    started_at      DATETIME NOT NULL,
    ended_at        DATETIME NULL,
    quantity        DECIMAL(14,4) NOT NULL DEFAULT 0.0000,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usage_resource FOREIGN KEY (resource_id)
        REFERENCES ResourceRegistry(resource_id) ON DELETE RESTRICT,
    CONSTRAINT uq_usage_start UNIQUE (resource_id, started_at),
    CONSTRAINT ck_usage_range CHECK (ended_at IS NULL OR ended_at >= started_at),
    CONSTRAINT ck_usage_quantity CHECK (quantity >= 0),
    INDEX idx_usage_resource_end (resource_id, ended_at)
) ENGINE=InnoDB;


-- =============================================================
-- 7. RESOURCE ACTIVITY & IN-APP/EMAIL NOTIFICATIONS
-- =============================================================
-- Entity ID deliberately not a FK to support FREE and soft-deleted
-- resources in an immutable audit log. ResourceRegistry FK used when
-- applicable. The backend must validate action/ownership.
CREATE TABLE ResourceActivityLogs (
    log_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    resource_id   INT NULL,
    entity_type   VARCHAR(40) NOT NULL,
    entity_pk     INT NOT NULL,
    action        VARCHAR(40) NOT NULL,
    old_status    VARCHAR(30) NULL,
    new_status    VARCHAR(30) NULL,
    details       JSON NULL,
    occurred_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_actor FOREIGN KEY (actor_user_id)
        REFERENCES Users(user_id) ON DELETE SET NULL,
    CONSTRAINT fk_activity_registry FOREIGN KEY (resource_id)
        REFERENCES ResourceRegistry(resource_id) ON DELETE RESTRICT,
    INDEX idx_activity_resource (resource_id, occurred_at),
    INDEX idx_activity_actor (actor_user_id, occurred_at),
    INDEX idx_activity_entity (entity_type, entity_pk)
) ENGINE=InnoDB;

CREATE TABLE Notifications (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    category        ENUM('security','billing','resource','payout','system') NOT NULL,
    channel         ENUM('in_app','email') NOT NULL DEFAULT 'in_app',
    title           VARCHAR(150) NOT NULL,
    message         TEXT NOT NULL,
    delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at         DATETIME NULL,
    read_at         DATETIME NULL,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    INDEX idx_notification_inbox (user_id, read_at, created_at)
) ENGINE=InnoDB;


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


-- =============================================================
-- 9. DATABASE VALIDATION TRIGGERS
-- =============================================================
-- Direct SQL guardrails for user roles and LB target network consistency.
-- All requests should still go through authorized Express controllers.
USE DistributedCloudMarketplace;
DELIMITER $$

CREATE TRIGGER trg_host_provider_role_insert
BEFORE INSERT ON ProviderHosts FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_user_id
                 AND u.role='provider' AND u.email_verified_at IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host owner must be a verified provider';
  END IF;
END$$

CREATE TRIGGER trg_host_provider_role_update
BEFORE UPDATE ON ProviderHosts FOR EACH ROW
BEGIN
  IF NEW.provider_user_id <> OLD.provider_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_user_id
                   AND u.role='provider' AND u.email_verified_at IS NOT NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New host owner must be a verified provider';
    END IF;
  END IF;
  IF NEW.total_cpu < (SELECT COALESCE(SUM(allocated_cpu),0)
                      FROM HostCapacityAllocations a
                      WHERE a.host_id=OLD.host_id AND a.released_at IS NULL)
     OR NEW.total_ram_gb < (SELECT COALESCE(SUM(allocated_ram_gb),0)
                           FROM HostCapacityAllocations a
                           WHERE a.host_id=OLD.host_id AND a.released_at IS NULL)
     OR NEW.total_disk_gb < (SELECT COALESCE(SUM(allocated_disk_gb),0)
                            FROM HostCapacityAllocations a
                            WHERE a.host_id=OLD.host_id AND a.released_at IS NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cannot reduce host below reserved capacity';
  END IF;
END$$

CREATE TRIGGER trg_group_customer_role_insert
BEFORE INSERT ON ResourceGroups FOR EACH ROW
BEGIN
  IF NOT EXISTS (SELECT 1 FROM Users u WHERE u.user_id=NEW.customer_user_id
                 AND u.role='customer' AND u.email_verified_at IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Group owner must be a verified customer';
  END IF;
END$$

CREATE TRIGGER trg_group_customer_role_update
BEFORE UPDATE ON ResourceGroups FOR EACH ROW
BEGIN
  IF NEW.customer_user_id <> OLD.customer_user_id THEN
    IF NOT EXISTS (SELECT 1 FROM Users u WHERE u.user_id=NEW.customer_user_id
                   AND u.role='customer' AND u.email_verified_at IS NOT NULL) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='New group owner must be a verified customer';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_lb_target_match_insert
BEFORE INSERT ON LoadBalancerTargets FOR EACH ROW
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM LoadBalancers lb
       JOIN VirtualMachines vm ON vm.vm_id=NEW.vm_id
       JOIN Subnets s ON s.subnet_id=vm.subnet_id
       JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
       JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
       WHERE lb.lb_id=NEW.lb_id AND lb.vnet_id=s.vnet_id
         AND lr.status NOT IN ('cancelled','deleted')
         AND vr.status NOT IN ('cancelled','deleted')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Load Balancer target must be in same VNet';
  END IF;
END$$

CREATE TRIGGER trg_lb_target_match_update
BEFORE UPDATE ON LoadBalancerTargets FOR EACH ROW
BEGIN
  IF NOT EXISTS (
       SELECT 1 FROM LoadBalancers lb
       JOIN VirtualMachines vm ON vm.vm_id=NEW.vm_id
       JOIN Subnets s ON s.subnet_id=vm.subnet_id
       JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
       JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
       WHERE lb.lb_id=NEW.lb_id AND lb.vnet_id=s.vnet_id
         AND lr.status NOT IN ('cancelled','deleted')
         AND vr.status NOT IN ('cancelled','deleted')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Load Balancer target must be in same VNet';
  END IF;
END$$

-- Ensure registry group and resource type agree with the underlying item.
-- VM and Load Balancer have an indirect group relationship, therefore this
-- check complements the direct composite FKs for storage/services.
CREATE TRIGGER trg_registry_validate_insert
BEFORE INSERT ON ResourceRegistry FOR EACH ROW
BEGIN
    IF NEW.vm_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM VirtualMachines v
        JOIN Subnets s ON s.subnet_id = v.subnet_id
        JOIN VirtualNetworks n ON n.vnet_id = s.vnet_id
        WHERE v.vm_id = NEW.vm_id AND n.group_id = NEW.group_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'VM not in registry group';
    END IF;
    IF NEW.lb_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM LoadBalancers l
        JOIN VirtualNetworks n ON n.vnet_id = l.vnet_id
        WHERE l.lb_id = NEW.lb_id AND n.group_id = NEW.group_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Load balancer not in registry group';
    END IF;
    IF NEW.database_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ManagedDatabases d WHERE d.database_id = NEW.database_id
        AND CAST(d.engine AS CHAR) = CAST(NEW.resource_type AS CHAR)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Managed DB engine/type mismatch';
    END IF;
END$$

CREATE TRIGGER trg_registry_validate_update
BEFORE UPDATE ON ResourceRegistry FOR EACH ROW
BEGIN
    -- Resource identities must never change after registration.
    IF NOT (NEW.group_id <=> OLD.group_id)
        OR NOT (NEW.customer_user_id <=> OLD.customer_user_id)
        OR NOT (NEW.resource_type <=> OLD.resource_type)
        OR NOT (NEW.vm_id <=> OLD.vm_id)
        OR NOT (NEW.lb_id <=> OLD.lb_id)
        OR NOT (NEW.blob_id <=> OLD.blob_id)
        OR NOT (NEW.file_id <=> OLD.file_id)
        OR NOT (NEW.database_id <=> OLD.database_id)
        OR NOT (NEW.webapp_id <=> OLD.webapp_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Registered resource identity is immutable';
    END IF;
END$$

DELIMITER ;


-- =============================================================
-- 10. PROVIDER CAPACITY REPORTING VIEW
-- =============================================================
-- STOPPED VMs still occupy reserved capacity until cancelled.
CREATE VIEW vw_ProviderCapacity AS
SELECT h.host_id, h.provider_user_id, h.name, h.region, h.hosting_class,
       h.total_cpu, h.total_ram_gb, h.total_disk_gb,
       COALESCE(a.used_cpu,0) AS used_cpu,
       COALESCE(a.used_ram_gb,0) AS used_ram_gb,
       COALESCE(a.used_disk_gb,0) AS used_disk_gb,
       h.total_cpu-COALESCE(a.used_cpu,0) AS free_cpu,
       h.total_ram_gb-COALESCE(a.used_ram_gb,0) AS free_ram_gb,
       h.total_disk_gb-COALESCE(a.used_disk_gb,0) AS free_disk_gb
FROM ProviderHosts h
LEFT JOIN (
    SELECT host_id, SUM(allocated_cpu) AS used_cpu,
           SUM(allocated_ram_gb) AS used_ram_gb,
           SUM(allocated_disk_gb) AS used_disk_gb
    FROM HostCapacityAllocations WHERE released_at IS NULL
    GROUP BY host_id
) a ON a.host_id=h.host_id;

