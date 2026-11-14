-- ============================================================================
-- Version 1.1, MySQL 8.0.16+, InnoDB, utf8mb4
-- Database: cloud_marketplace
-- =============================================================================

DROP DATABASE IF EXISTS DistributedCloudMarketplace; -- martens
DROP DATABASE IF EXISTS cloud_marketplace; -- mines

CREATE DATABASE cloud_marketplace
CHARACTER SET utf8mb4 -- hayde to accept all symbols and emojis in case ai hat shi
COLLATE utf8mb4_0900_ai_ci;

USE cloud_marketplace;

-- --------------------------- ACCOUNTS AND SECURITY ---------------------------
CREATE TABLE Users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('customer','provider','admin') NOT NULL,
    email_verified_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE EmailVerificationTokens (
    token_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    used_at DATETIME NULL,
    UNIQUE KEY uq_email_tokens_hash (token_hash),
    KEY idx_email_tokens_user (user_id),
    KEY idx_email_tokens_expires (expires_at),
    CONSTRAINT fk_email_tokens_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE UserTwoFactor (
    user_id INT PRIMARY KEY,
    encrypted_secret VARBINARY(512) NOT NULL,
    enabled_at DATETIME NULL,
    last_used_step BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_twofactor_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB;

-- --------------------------- PROVIDERS AND PROJECTS --------------------------
CREATE TABLE ProviderHosts (
    host_id INT AUTO_INCREMENT PRIMARY KEY,
    provider_user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    hosting_class ENUM('Economy','Business','Critical') NOT NULL,
    status ENUM('available','maintenance','inactive') NOT NULL DEFAULT 'available',
    total_cpu INT NOT NULL,
    total_ram_gb INT NOT NULL,
    total_disk_gb INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_hosts_provider FOREIGN KEY (provider_user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_host_name_per_provider UNIQUE (provider_user_id, name),
    CONSTRAINT uq_host_id_class UNIQUE (host_id, hosting_class),
    CONSTRAINT ck_hosts_capacity CHECK (total_cpu > 0 AND total_ram_gb > 0 AND total_disk_gb > 0),
    KEY idx_hosts_match (region,hosting_class,status)
) ENGINE=InnoDB;

CREATE TABLE ResourceGroups (
    group_id INT AUTO_INCREMENT PRIMARY KEY,
    customer_user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    region VARCHAR(50) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_groups_customer FOREIGN KEY (customer_user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_group_owner UNIQUE (group_id, customer_user_id),
    CONSTRAINT uq_group_per_customer UNIQUE (customer_user_id, name),
    CONSTRAINT ck_groups_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
) ENGINE=InnoDB;

-- --------------------------- NETWORKS AND COMPUTE ----------------------------
CREATE TABLE VirtualNetworks (
    vnet_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    cidr_block VARCHAR(43) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vnets_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vnet_per_group UNIQUE (group_id,name),
    CONSTRAINT ck_vnets_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE Subnets (
    subnet_id INT AUTO_INCREMENT PRIMARY KEY,
    vnet_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    cidr_block VARCHAR(43) NOT NULL,
    status ENUM('active','deleted') NOT NULL DEFAULT 'active',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subnets_vnet FOREIGN KEY (vnet_id) REFERENCES VirtualNetworks(vnet_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_subnet_per_vnet UNIQUE (vnet_id,name),
    CONSTRAINT ck_subnets_deleted CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
) ENGINE=InnoDB;

CREATE TABLE VirtualMachines (
    vm_id INT AUTO_INCREMENT PRIMARY KEY,
    subnet_id INT NOT NULL,
    host_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    hosting_class ENUM('Economy','Business','Critical') NOT NULL,
    vcpu INT NOT NULL,
    ram_gb INT NOT NULL,
    disk_gb INT NOT NULL,
    status ENUM('stopped','running','error') NOT NULL DEFAULT 'stopped',
    hourly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vms_subnet FOREIGN KEY (subnet_id) REFERENCES Subnets(subnet_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vms_host_class FOREIGN KEY (host_id,hosting_class)
        REFERENCES ProviderHosts(host_id,hosting_class) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vm_per_subnet UNIQUE (subnet_id,name),
    CONSTRAINT uq_vm_id_host UNIQUE (vm_id,host_id),
    CONSTRAINT ck_vms_capacity CHECK (vcpu > 0 AND ram_gb > 0 AND disk_gb > 0),
    CONSTRAINT ck_vms_price CHECK (hourly_price >= 0),
    KEY idx_vms_host (host_id,hosting_class)
) ENGINE=InnoDB;

CREATE TABLE LoadBalancers (
    lb_id INT AUTO_INCREMENT PRIMARY KEY,
    vnet_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    algorithm ENUM('round_robin','least_connections') NOT NULL DEFAULT 'round_robin',
    status ENUM('inactive','active') NOT NULL DEFAULT 'inactive',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lb_vnet FOREIGN KEY (vnet_id) REFERENCES VirtualNetworks(vnet_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_lb_per_vnet UNIQUE (vnet_id,name)
) ENGINE=InnoDB;

CREATE TABLE LoadBalancerTargets (
    lb_id INT NOT NULL,
    vm_id INT NOT NULL,
    PRIMARY KEY (lb_id,vm_id),
    CONSTRAINT fk_lb_targets_lb FOREIGN KEY (lb_id) REFERENCES LoadBalancers(lb_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    CONSTRAINT fk_lb_targets_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    KEY idx_lb_targets_vm (vm_id)
) ENGINE=InnoDB;

-- One VM runtime interval. Historical quantities are snapshotted on write.
-- Dev 2 uses these additional fields for billing. Dev 1 retains usage_id.
CREATE TABLE VmUsage (
    usage_id INT AUTO_INCREMENT PRIMARY KEY,
    vm_id INT NOT NULL,
    customer_id INT NOT NULL,
    provider_id INT NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    cpu_cores DECIMAL(12,2) NOT NULL,
    ram_gb DECIMAL(12,2) NOT NULL,
    gpu_units DECIMAL(12,2) NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL,
    stopped_at DATETIME NULL,
    simulated_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    provider_earning DECIMAL(12,2) NOT NULL DEFAULT 0,
    CONSTRAINT fk_vm_usage_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vm_usage_customer FOREIGN KEY (customer_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_vm_usage_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_vm_usage_start UNIQUE (vm_id,started_at),
    CONSTRAINT ck_vm_usage_times CHECK (stopped_at IS NULL OR stopped_at >= started_at),
    CONSTRAINT ck_vm_usage_quantity CHECK (cpu_cores > 0 AND ram_gb > 0 AND gpu_units >= 0),
    CONSTRAINT ck_vm_usage_cost CHECK (simulated_cost >= 0 AND provider_earning >= 0),
    KEY idx_vm_usage_customer (customer_id,started_at),
    KEY idx_vm_usage_provider (provider_id,started_at)
) ENGINE=InnoDB;

-- ---------------------- STORAGE AND MANAGED SERVICES -------------------------
CREATE TABLE InstanceStorageUsage (
    vm_id BIGINT NOT NULL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    provider_id BIGINT NOT NULL,
    cloud_class VARCHAR(32) NOT NULL,
    quantity DECIMAL(12,3) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    KEY idx_storage_customer (customer_id, started_at, ended_at)
) ENGINE=InnoDB;

CREATE TABLE BlobStorage (
    blob_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    size_gb INT NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_blob_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_blob_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_blob_id_group UNIQUE (blob_id,group_id),
    CONSTRAINT ck_blob_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE FileStorage (
    file_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    size_gb INT NOT NULL,
    status ENUM('active','inactive') NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_file_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_file_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_file_id_group UNIQUE (file_id,group_id),
    CONSTRAINT ck_file_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE ManagedDatabases (
    database_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    engine ENUM('SQL_SERVER','POSTGRESQL','MYSQL') NOT NULL,
    size_gb INT NOT NULL,
    status ENUM('stopped','running') NOT NULL DEFAULT 'stopped',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_db_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_db_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_db_id_group UNIQUE (database_id,group_id),
    CONSTRAINT ck_db_size CHECK (size_gb > 0)
) ENGINE=InnoDB;

CREATE TABLE WebApps (
    webapp_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    database_id INT NULL,
    name VARCHAR(100) NOT NULL,
    status ENUM('stopped','running') NOT NULL DEFAULT 'stopped',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_webapp_group FOREIGN KEY (group_id) REFERENCES ResourceGroups(group_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT fk_webapp_db_same_group FOREIGN KEY (database_id,group_id)
        REFERENCES ManagedDatabases(database_id,group_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT uq_webapp_per_group UNIQUE (group_id,name),
    CONSTRAINT uq_webapp_id_group UNIQUE (webapp_id,group_id),
    KEY idx_webapp_db_group (database_id,group_id)
) ENGINE=InnoDB;

-- ------------------------ REGISTRY AND ALLOCATIONS ---------------------------
-- ResourceGroup/VNet/Subnet are free structural objects, not registry entries.
-- All billable cloud objects have exactly one registry identity.
CREATE TABLE ResourceRegistry (
    resource_id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    customer_user_id INT NOT NULL,
    resource_type ENUM('VIRTUAL_MACHINE','LOAD_BALANCER','BLOB_STORAGE','FILE_STORAGE',
                       'SQL_SERVER','POSTGRESQL','MYSQL','WEB_APP') NOT NULL,
    vm_id INT NULL,
    lb_id INT NULL,
    blob_id INT NULL,
    file_id INT NULL,
    database_id INT NULL,
    webapp_id INT NULL,
    status ENUM('created','active','stopped','cancelled','deleted') NOT NULL DEFAULT 'created',
    activated_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_registry_group_owner FOREIGN KEY (group_id,customer_user_id)
        REFERENCES ResourceGroups(group_id,customer_user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_vm FOREIGN KEY (vm_id) REFERENCES VirtualMachines(vm_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_lb FOREIGN KEY (lb_id) REFERENCES LoadBalancers(lb_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_blob_same_group FOREIGN KEY (blob_id,group_id)
        REFERENCES BlobStorage(blob_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_file_same_group FOREIGN KEY (file_id,group_id)
        REFERENCES FileStorage(file_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_db_same_group FOREIGN KEY (database_id,group_id)
        REFERENCES ManagedDatabases(database_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT fk_registry_webapp_same_group FOREIGN KEY (webapp_id,group_id)
        REFERENCES WebApps(webapp_id,group_id) ON DELETE RESTRICT,
    CONSTRAINT uq_registry_resource_owner UNIQUE (resource_id,customer_user_id),
    CONSTRAINT uq_registry_vm UNIQUE (vm_id),
    CONSTRAINT uq_registry_lb UNIQUE (lb_id),
    CONSTRAINT uq_registry_blob UNIQUE (blob_id),
    CONSTRAINT uq_registry_file UNIQUE (file_id),
    CONSTRAINT uq_registry_db UNIQUE (database_id),
    CONSTRAINT uq_registry_webapp UNIQUE (webapp_id),
    CONSTRAINT ck_registry_one_entity CHECK (
        (vm_id IS NOT NULL) + (lb_id IS NOT NULL) + (blob_id IS NOT NULL) +
        (file_id IS NOT NULL) + (database_id IS NOT NULL) + (webapp_id IS NOT NULL) = 1
    ),
    CONSTRAINT ck_registry_type CHECK (
         (resource_type='VIRTUAL_MACHINE' AND vm_id IS NOT NULL) OR
         (resource_type='LOAD_BALANCER' AND lb_id IS NOT NULL) OR
         (resource_type='BLOB_STORAGE' AND blob_id IS NOT NULL) OR
         (resource_type='FILE_STORAGE' AND file_id IS NOT NULL) OR
         (resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL') AND database_id IS NOT NULL) OR
         (resource_type='WEB_APP' AND webapp_id IS NOT NULL)
    ),
    CONSTRAINT ck_registry_cancel_time CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL),
    CONSTRAINT ck_registry_delete_time CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
    KEY idx_registry_owner_status (customer_user_id,status),
    KEY idx_registry_group_status (group_id,status)
) ENGINE=InnoDB;

CREATE TABLE HostCapacityAllocations (
    allocation_id INT AUTO_INCREMENT PRIMARY KEY,
    vm_id INT NOT NULL,
    host_id INT NOT NULL,
    allocated_cpu INT NOT NULL,
    allocated_ram_gb INT NOT NULL,
    allocated_disk_gb INT NOT NULL,
    allocated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME NULL,
    CONSTRAINT fk_alloc_vm_host FOREIGN KEY (vm_id,host_id)
        REFERENCES VirtualMachines(vm_id,host_id) ON DELETE RESTRICT,
    CONSTRAINT fk_alloc_host FOREIGN KEY (host_id) REFERENCES ProviderHosts(host_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_alloc_vm UNIQUE (vm_id),
    CONSTRAINT ck_alloc_positive CHECK
        (allocated_cpu > 0 AND allocated_ram_gb > 0 AND allocated_disk_gb > 0),
    CONSTRAINT ck_alloc_dates CHECK (released_at IS NULL OR released_at >= allocated_at),
    KEY idx_alloc_host_active (host_id,released_at)
) ENGINE=InnoDB;

-- Canonical non-VM usage table. Finance records explicit price units, not
-- duplicate copies in resource_usage_periods. Structural resources are free.
CREATE TABLE ResourceUsagePeriods (
    usage_period_id INT AUTO_INCREMENT PRIMARY KEY,
    resource_id INT NOT NULL,
    customer_id INT NOT NULL,
    provider_id INT NULL,
    resource_type ENUM('CPU','RAM','Storage','GPU') NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    quantity DECIMAL(12,2) NOT NULL,
    started_at DATETIME NOT NULL,
    ended_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_usage_resource FOREIGN KEY (resource_id) REFERENCES ResourceRegistry(resource_id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_usage_owner FOREIGN KEY (resource_id,customer_id)
        REFERENCES ResourceRegistry(resource_id,customer_user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_usage_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT uq_usage_start UNIQUE (resource_id,resource_type,started_at),
    CONSTRAINT ck_usage_quantity CHECK (quantity > 0),
    CONSTRAINT ck_usage_times CHECK (ended_at IS NULL OR ended_at >= started_at),
    KEY idx_usage_customer (customer_id,started_at),
    KEY idx_usage_resource_end (resource_id,ended_at)
) ENGINE=InnoDB;

CREATE TABLE ResourceActivityLogs (
    log_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_user_id INT NULL,
    resource_id INT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_pk INT NOT NULL,
    action VARCHAR(40) NOT NULL,
    old_status VARCHAR(30) NULL,
    new_status VARCHAR(30) NULL,
    details JSON NULL,
    occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_activity_actor FOREIGN KEY (actor_user_id) REFERENCES Users(user_id)
        ON DELETE SET NULL,
    CONSTRAINT fk_activity_registry FOREIGN KEY (resource_id) REFERENCES ResourceRegistry(resource_id)
        ON DELETE RESTRICT,
    KEY idx_activity_resource (resource_id,occurred_at),
    KEY idx_activity_actor (actor_user_id,occurred_at),
    KEY idx_activity_entity (entity_type,entity_pk)
) ENGINE=InnoDB;

-- Both devs share ONE notification inbox. Finance links are added after the
-- financial tables exist to avoid forward-FK issues.
CREATE TABLE Notifications (
    notification_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category ENUM('security','billing','resource','payout','system') NOT NULL,
    channel ENUM('in_app','email') NOT NULL DEFAULT 'in_app',
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    delivery_status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    read_at DATETIME NULL,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    KEY idx_notification_inbox (user_id,read_at,created_at)
) ENGINE=InnoDB;

-- ------------------------- FINANCIAL PRICING -------------------------------
-- Prices and provider accounting are strictly SIMULATED.
CREATE TABLE pricing_rules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    resource_type ENUM('CPU','RAM','Storage','GPU') NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_resource_class UNIQUE (resource_type,cloud_class),
    CONSTRAINT ck_price_positive CHECK (unit_price >= 0)
) ENGINE=InnoDB;

CREATE TABLE pricing_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pricing_rule_id INT NOT NULL,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_pricing_history_rule FOREIGN KEY (pricing_rule_id)
        REFERENCES pricing_rules(id) ON DELETE RESTRICT,
    CONSTRAINT ck_price_history_positive CHECK (old_price >= 0 AND new_price >= 0),
    KEY idx_price_history_time (pricing_rule_id,changed_at)
) ENGINE=InnoDB;

CREATE TABLE discount_codes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(40) NOT NULL,
    discount_type ENUM('Percentage','Fixed') NOT NULL,
    discount_value DECIMAL(10,2) NOT NULL,
    max_uses INT NULL,
    used_count INT NOT NULL DEFAULT 0,
    expires_at DATETIME NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_discounts_code UNIQUE (code),
    CONSTRAINT ck_discounts_value CHECK (discount_value > 0),
    CONSTRAINT chk_discount_percentage CHECK
        (discount_type <> 'Percentage' OR discount_value <= 100),
    CONSTRAINT ck_discounts_uses CHECK
        (used_count >= 0 AND (max_uses IS NULL OR (max_uses > 0 AND used_count <= max_uses)))
) ENGINE=InnoDB;

-- ------------------------- INVOICES AND PAYMENTS ----------------------------
CREATE TABLE billing_periods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer_id INT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_billing_customer FOREIGN KEY (customer_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT unique_customer_billing_period UNIQUE (customer_id,period_start,period_end),
    CONSTRAINT ck_billing_range CHECK (period_end > period_start),
    KEY idx_billing_customer_end (customer_id,period_end)
) ENGINE=InnoDB;

CREATE TABLE invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(60) NOT NULL,
    billing_period_id INT NOT NULL,
    status ENUM('Unpaid','Paid','Cancelled') NOT NULL DEFAULT 'Unpaid',
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_code_id INT NULL,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_invoice_number UNIQUE (invoice_number),
    CONSTRAINT uq_invoice_period UNIQUE (billing_period_id),
    CONSTRAINT fk_invoice_billing_period FOREIGN KEY (billing_period_id)
        REFERENCES billing_periods(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_discount_code FOREIGN KEY (discount_code_id)
        REFERENCES discount_codes(id) ON DELETE SET NULL,
    CONSTRAINT ck_invoice_nonnegative CHECK
        (subtotal >= 0 AND total >= 0 AND discount_amount >= 0 AND discount_amount <= subtotal),
    CONSTRAINT ck_invoice_total CHECK (total = subtotal - discount_amount)
) ENGINE=InnoDB;

CREATE TABLE invoice_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    provider_id INT NULL,
    resource_type ENUM('CPU','RAM','Storage','GPU') NOT NULL,
    cloud_class ENUM('Economy','Business','Critical') NOT NULL,
    quantity DECIMAL(14,4) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_invoice_item_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices(id) ON DELETE RESTRICT,
    CONSTRAINT fk_invoice_item_provider FOREIGN KEY (provider_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT ck_invoice_item_values CHECK
        (quantity > 0 AND unit_price >= 0 AND line_total >= 0),
    KEY idx_invoice_items_provider (provider_id,invoice_id)
) ENGINE=InnoDB;

CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_reference VARCHAR(80) NOT NULL,
    invoice_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('Succeeded','Refunded') NOT NULL DEFAULT 'Succeeded',
    simulated BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_payment_reference UNIQUE (payment_reference),
    CONSTRAINT uq_payment_invoice UNIQUE (invoice_id),
    CONSTRAINT fk_payment_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_payment_positive CHECK (amount > 0),
    CONSTRAINT ck_payment_simulated CHECK (simulated = TRUE)
) ENGINE=InnoDB;

CREATE TABLE refunds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    refund_reference VARCHAR(80) NOT NULL,
    payment_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NULL,
    status ENUM('Succeeded') NOT NULL DEFAULT 'Succeeded',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_refund_reference UNIQUE (refund_reference),
    CONSTRAINT fk_refund_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_refund_amount CHECK (amount > 0),
    KEY idx_refunds_payment (payment_id)
) ENGINE=InnoDB;

CREATE TABLE provider_earnings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    provider_id INT NOT NULL,
    gross_amount DECIMAL(12,2) NOT NULL,
    commission_rate DECIMAL(5,2) NOT NULL,
    commission_amount DECIMAL(12,2) NOT NULL,
    net_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_earning_payment FOREIGN KEY (payment_id) REFERENCES payments(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_earning_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT unique_payment_provider UNIQUE (payment_id,provider_id),
    CONSTRAINT ck_earning_nonnegative CHECK
        (gross_amount >= 0 AND commission_rate BETWEEN 0 AND 100 AND
         commission_amount >= 0 AND net_amount >= 0),
    CONSTRAINT ck_earning_balance CHECK (net_amount = gross_amount - commission_amount),
    KEY idx_earnings_provider (provider_id)
) ENGINE=InnoDB;

CREATE TABLE withdrawal_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    provider_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('Requested','Approved','Rejected','Paid') NOT NULL DEFAULT 'Requested',
    note VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_withdrawal_provider FOREIGN KEY (provider_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_withdrawal_amount CHECK (amount > 0),
    KEY idx_withdrawals_provider_status (provider_id,status)
) ENGINE=InnoDB;

CREATE TABLE refund_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    admin_note VARCHAR(255) NULL,
    decided_by INT NULL,
    decided_at DATETIME NULL,
    refund_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_refund_request_payment FOREIGN KEY (payment_id)
        REFERENCES payments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_customer FOREIGN KEY (customer_id)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_decider FOREIGN KEY (decided_by)
        REFERENCES Users(user_id) ON DELETE RESTRICT,
    CONSTRAINT fk_refund_request_refund FOREIGN KEY (refund_id)
        REFERENCES refunds(id) ON DELETE SET NULL,
    CONSTRAINT uq_refund_request_result UNIQUE (refund_id),
    CONSTRAINT ck_refund_request_amount CHECK (amount > 0),
    KEY idx_refund_requests_customer (customer_id,status),
    KEY idx_refund_requests_status (status,created_at)
) ENGINE=InnoDB;

CREATE TABLE financial_audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_role VARCHAR(20) NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id INT NULL,
    details TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES Users(user_id)
        ON DELETE SET NULL,
    KEY idx_audit_entity (entity_type,entity_id),
    KEY idx_audit_created (created_at)
) ENGINE=InnoDB;

CREATE TABLE finance_locks (
    kind VARCHAR(16) NOT NULL,
    owner_id INT NOT NULL,
    PRIMARY KEY (kind,owner_id),
    CONSTRAINT fk_finance_locks_user FOREIGN KEY (owner_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    CONSTRAINT ck_finance_lock_kind CHECK (kind IN ('Customer','Provider'))
) ENGINE=InnoDB;

CREATE TABLE api_idempotency (
    actor_role VARCHAR(20) NOT NULL,
    actor_id INT NOT NULL,
    request_key VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (actor_role,actor_id,request_key),
    CONSTRAINT fk_idempotency_user FOREIGN KEY (actor_id) REFERENCES Users(user_id)
        ON DELETE RESTRICT,
    KEY idx_idempotency_created (created_at)
) ENGINE=InnoDB;

-- Attach financial event links to the ONE shared notification table.
ALTER TABLE Notifications
    ADD COLUMN payment_id INT NULL,
    ADD COLUMN refund_id INT NULL,
    ADD COLUMN notification_type VARCHAR(40) NULL,
    ADD CONSTRAINT fk_notifications_payment FOREIGN KEY (payment_id)
        REFERENCES payments(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_notifications_refund FOREIGN KEY (refund_id)
        REFERENCES refunds(id) ON DELETE SET NULL;

-- ----------------------------- REPORTING VIEW -------------------------------
-- Stopped VMs retain capacity until cancellation (released_at is set).
CREATE VIEW vw_ProviderCapacity AS
SELECT h.host_id,h.provider_user_id,h.name,h.region,h.hosting_class,
       h.total_cpu,h.total_ram_gb,h.total_disk_gb,
       COALESCE(a.used_cpu,0) AS used_cpu,
       COALESCE(a.used_ram_gb,0) AS used_ram_gb,
       COALESCE(a.used_disk_gb,0) AS used_disk_gb,
       h.total_cpu - COALESCE(a.used_cpu,0) AS free_cpu,
       h.total_ram_gb - COALESCE(a.used_ram_gb,0) AS free_ram_gb,
       h.total_disk_gb - COALESCE(a.used_disk_gb,0) AS free_disk_gb
FROM ProviderHosts h
LEFT JOIN (
    SELECT host_id, SUM(allocated_cpu) AS used_cpu,
           SUM(allocated_ram_gb) AS used_ram_gb,
           SUM(allocated_disk_gb) AS used_disk_gb
    FROM HostCapacityAllocations
    WHERE released_at IS NULL
    GROUP BY host_id
) a ON a.host_id=h.host_id;

-- ---------------------- VALIDATION AND LIFECYCLE -----------------------------
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
    IF NEW.provider_user_id <> OLD.provider_user_id AND NOT EXISTS
       (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_user_id
        AND u.role='provider' AND u.email_verified_at IS NOT NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host owner must be a verified provider';
    END IF;
    IF NEW.total_cpu < (SELECT COALESCE(SUM(allocated_cpu),0) FROM HostCapacityAllocations
                        WHERE host_id=OLD.host_id AND released_at IS NULL)
       OR NEW.total_ram_gb < (SELECT COALESCE(SUM(allocated_ram_gb),0) FROM HostCapacityAllocations
                             WHERE host_id=OLD.host_id AND released_at IS NULL)
       OR NEW.total_disk_gb < (SELECT COALESCE(SUM(allocated_disk_gb),0) FROM HostCapacityAllocations
                              WHERE host_id=OLD.host_id AND released_at IS NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host capacity below active reservations';
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
    IF NEW.customer_user_id <> OLD.customer_user_id AND NOT EXISTS
       (SELECT 1 FROM Users u WHERE u.user_id=NEW.customer_user_id
        AND u.role='customer' AND u.email_verified_at IS NOT NULL) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Group owner must be a verified customer';
    END IF;
END$$

CREATE TRIGGER trg_lb_target_match_insert
BEFORE INSERT ON LoadBalancerTargets FOR EACH ROW
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM LoadBalancers lb
        JOIN VirtualMachines vm ON vm.vm_id=NEW.vm_id
        JOIN Subnets s ON s.subnet_id=vm.subnet_id
        JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
        JOIN ResourceGroups g ON g.group_id=n.group_id
        JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
        JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
        WHERE lb.lb_id=NEW.lb_id AND lb.vnet_id=s.vnet_id
          AND n.status='active' AND s.status='active' AND g.status='active'
          AND lr.status NOT IN ('cancelled','deleted')
          AND vr.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid LB target: networks or statuses differ';
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
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LB target must belong to same VNet';
    END IF;
END$$

CREATE TRIGGER trg_registry_validate_insert
BEFORE INSERT ON ResourceRegistry FOR EACH ROW
BEGIN
    IF NEW.vm_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM VirtualMachines v JOIN Subnets s ON s.subnet_id=v.subnet_id
        JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
        WHERE v.vm_id=NEW.vm_id AND n.group_id=NEW.group_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Registered VM belongs to another group';
    END IF;
    IF NEW.lb_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM LoadBalancers l JOIN VirtualNetworks n ON n.vnet_id=l.vnet_id
        WHERE l.lb_id=NEW.lb_id AND n.group_id=NEW.group_id
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Registered LB belongs to another group';
    END IF;
    IF NEW.database_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ManagedDatabases d WHERE d.database_id=NEW.database_id
        AND CAST(d.engine AS CHAR)=CAST(NEW.resource_type AS CHAR)
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Managed DB engine/resource type mismatch';
    END IF;
END$$

CREATE TRIGGER trg_registry_validate_update
BEFORE UPDATE ON ResourceRegistry FOR EACH ROW
BEGIN
    IF NOT (NEW.group_id <=> OLD.group_id)
      OR NOT (NEW.customer_user_id <=> OLD.customer_user_id)
      OR NOT (NEW.resource_type <=> OLD.resource_type)
      OR NOT (NEW.vm_id <=> OLD.vm_id)
      OR NOT (NEW.lb_id <=> OLD.lb_id)
      OR NOT (NEW.blob_id <=> OLD.blob_id)
      OR NOT (NEW.file_id <=> OLD.file_id)
      OR NOT (NEW.database_id <=> OLD.database_id)
      OR NOT (NEW.webapp_id <=> OLD.webapp_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource registry identity cannot change';
    END IF;
END$$

-- VM billable intervals always derive their owner, provider and unit sizes
-- from the actual VM/subnet/host, NOT from potentially forged request values.
CREATE TRIGGER trg_vm_usage_insert
BEFORE INSERT ON VmUsage FOR EACH ROW
BEGIN
    DECLARE v_customer INT DEFAULT NULL;
    DECLARE v_provider INT DEFAULT NULL;
    DECLARE v_class VARCHAR(20) DEFAULT NULL;
    DECLARE v_cpu INT DEFAULT NULL;
    DECLARE v_ram INT DEFAULT NULL;
    SELECT g.customer_user_id,h.provider_user_id,v.hosting_class,v.vcpu,v.ram_gb
      INTO v_customer,v_provider,v_class,v_cpu,v_ram
    FROM VirtualMachines v
    JOIN ProviderHosts h ON h.host_id=v.host_id
    JOIN Subnets s ON s.subnet_id=v.subnet_id
    JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
    JOIN ResourceGroups g ON g.group_id=n.group_id
    WHERE v.vm_id=NEW.vm_id;
    IF v_customer IS NULL OR v_provider IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VM usage has no valid owner or provider';
    END IF;
    IF NEW.customer_id <> v_customer OR NEW.provider_id <> v_provider
       OR NEW.cloud_class <> v_class OR NEW.cpu_cores <> v_cpu OR NEW.ram_gb <> v_ram THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='VM usage cannot disagree with its VM allocation';
    END IF;
END$$

CREATE TRIGGER trg_resource_usage_insert
BEFORE INSERT ON ResourceUsagePeriods FOR EACH ROW
BEGIN
    IF NOT EXISTS (
       SELECT 1 FROM ResourceRegistry r WHERE r.resource_id=NEW.resource_id
         AND r.customer_user_id=NEW.customer_id AND r.resource_type <> 'VIRTUAL_MACHINE'
         AND r.status NOT IN ('cancelled','deleted')
    ) THEN
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Usage must refer to active non-VM customer resource';
    END IF;
    IF NEW.provider_id IS NOT NULL AND NOT EXISTS
       (SELECT 1 FROM Users u WHERE u.user_id=NEW.provider_id AND u.role='provider'
        AND u.email_verified_at IS NOT NULL) THEN
       SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Usage provider must be verified';
    END IF;
END$$

-- Protected capacity reservation and VM creation; one transaction.
-- CALL sp_CreateVmWithAllocation(customer_id,subnet_id,host_id,name,class,
--                                vcpu,ram_gb,disk_gb,hourly_price,@new_vm_id);
CREATE PROCEDURE sp_CreateVmWithAllocation(
    IN p_actor_customer_id INT, IN p_subnet_id INT, IN p_host_id INT,
    IN p_name VARCHAR(100), IN p_hosting_class VARCHAR(20),
    IN p_vcpu INT, IN p_ram_gb INT, IN p_disk_gb INT,
    IN p_hourly_price DECIMAL(10,2), OUT p_new_vm_id INT
)
BEGIN
    DECLARE v_total_cpu INT DEFAULT NULL;
    DECLARE v_total_ram INT DEFAULT NULL;
    DECLARE v_total_disk INT DEFAULT NULL;
    DECLARE v_host_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_host_region VARCHAR(50) DEFAULT NULL;
    DECLARE v_host_class VARCHAR(20) DEFAULT NULL;
    DECLARE v_provider_id INT DEFAULT NULL;
    DECLARE v_customer_id INT DEFAULT NULL;
    DECLARE v_group_id INT DEFAULT NULL;
    DECLARE v_group_region VARCHAR(50) DEFAULT NULL;
    DECLARE v_used_cpu BIGINT DEFAULT 0;
    DECLARE v_used_ram BIGINT DEFAULT 0;
    DECLARE v_used_disk BIGINT DEFAULT 0;
    DECLARE v_new_resource_id INT;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    SET p_new_vm_id=NULL;
    IF p_vcpu <= 0 OR p_ram_gb <= 0 OR p_disk_gb <= 0 OR p_hourly_price < 0
       OR p_hosting_class NOT IN ('Economy','Business','Critical') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid VM specification';
    END IF;
    START TRANSACTION;
    SELECT h.total_cpu,h.total_ram_gb,h.total_disk_gb,h.status,h.region,h.hosting_class,h.provider_user_id
    INTO v_total_cpu,v_total_ram,v_total_disk,v_host_status,v_host_region,v_host_class,v_provider_id
    FROM ProviderHosts h JOIN Users u ON u.user_id=h.provider_user_id
    WHERE h.host_id=p_host_id AND u.role='provider' AND u.email_verified_at IS NOT NULL
    FOR UPDATE;
    IF v_total_cpu IS NULL OR v_host_status <> 'available' OR v_host_class <> p_hosting_class THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Host missing, unverified, or unavailable';
    END IF;
    SELECT g.group_id,g.customer_user_id,g.region
    INTO v_group_id,v_customer_id,v_group_region
    FROM Subnets s JOIN VirtualNetworks n ON n.vnet_id=s.vnet_id
    JOIN ResourceGroups g ON g.group_id=n.group_id
    JOIN Users u ON u.user_id=g.customer_user_id
    WHERE s.subnet_id=p_subnet_id AND s.status='active' AND n.status='active'
      AND g.status='active' AND u.role='customer' AND u.email_verified_at IS NOT NULL;
    IF v_group_id IS NULL OR v_customer_id <> p_actor_customer_id
       OR v_group_region <> v_host_region THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid customer, subnet or region';
    END IF;
    SELECT COALESCE(SUM(allocated_cpu),0),COALESCE(SUM(allocated_ram_gb),0),
           COALESCE(SUM(allocated_disk_gb),0)
      INTO v_used_cpu,v_used_ram,v_used_disk
    FROM HostCapacityAllocations WHERE host_id=p_host_id AND released_at IS NULL;
    IF v_used_cpu+p_vcpu>v_total_cpu OR v_used_ram+p_ram_gb>v_total_ram
       OR v_used_disk+p_disk_gb>v_total_disk THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Insufficient reserved host capacity';
    END IF;
    INSERT INTO VirtualMachines(subnet_id,host_id,name,hosting_class,vcpu,ram_gb,disk_gb,hourly_price)
    VALUES(p_subnet_id,p_host_id,p_name,p_hosting_class,p_vcpu,p_ram_gb,p_disk_gb,p_hourly_price);
    SET p_new_vm_id=LAST_INSERT_ID();
    INSERT INTO HostCapacityAllocations(vm_id,host_id,allocated_cpu,allocated_ram_gb,allocated_disk_gb)
    VALUES(p_new_vm_id,p_host_id,p_vcpu,p_ram_gb,p_disk_gb);
    INSERT INTO ResourceRegistry(group_id,customer_user_id,resource_type,vm_id,status)
    VALUES(v_group_id,v_customer_id,'VIRTUAL_MACHINE',p_new_vm_id,'created');
    SET v_new_resource_id=LAST_INSERT_ID();
    INSERT INTO ResourceActivityLogs(actor_user_id,resource_id,entity_type,entity_pk,action,new_status)
    VALUES(p_actor_customer_id,v_new_resource_id,'VIRTUAL_MACHINE',p_new_vm_id,'created','created');
    COMMIT;
END$$

CREATE PROCEDURE sp_RegisterResource(
    IN p_group_id INT, IN p_customer_id INT,
    IN p_resource_type VARCHAR(30), IN p_entity_id INT,
    OUT p_new_resource_id INT
)
BEGIN
    DECLARE v_actual_group INT DEFAULT NULL;
    DECLARE v_db_engine VARCHAR(30) DEFAULT NULL;
    DECLARE v_initial_status VARCHAR(20) DEFAULT 'created';
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    SET p_new_resource_id=NULL;
    START TRANSACTION;
    IF NOT EXISTS (
        SELECT 1 FROM ResourceGroups g JOIN Users u ON u.user_id=g.customer_user_id
        WHERE g.group_id=p_group_id AND g.customer_user_id=p_customer_id
        AND g.status='active' AND u.role='customer' AND u.email_verified_at IS NOT NULL
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid resource group or customer';
    END IF;
    CASE p_resource_type
      WHEN 'LOAD_BALANCER' THEN
        SELECT MAX(n.group_id) INTO v_actual_group FROM LoadBalancers l
        JOIN VirtualNetworks n ON n.vnet_id=l.vnet_id WHERE l.lb_id=p_entity_id;
      WHEN 'BLOB_STORAGE' THEN
        SELECT MAX(group_id) INTO v_actual_group FROM BlobStorage WHERE blob_id=p_entity_id;
        SET v_initial_status='active';
      WHEN 'FILE_STORAGE' THEN
        SELECT MAX(group_id) INTO v_actual_group FROM FileStorage WHERE file_id=p_entity_id;
        SET v_initial_status='active';
      WHEN 'SQL_SERVER' THEN
        SELECT MAX(group_id), MAX(engine) INTO v_actual_group,v_db_engine
        FROM ManagedDatabases WHERE database_id=p_entity_id;
      WHEN 'POSTGRESQL' THEN
        SELECT MAX(group_id), MAX(engine) INTO v_actual_group,v_db_engine
        FROM ManagedDatabases WHERE database_id=p_entity_id;
      WHEN 'MYSQL' THEN
        SELECT MAX(group_id), MAX(engine) INTO v_actual_group,v_db_engine
        FROM ManagedDatabases WHERE database_id=p_entity_id;
      WHEN 'WEB_APP' THEN
        SELECT MAX(group_id) INTO v_actual_group FROM WebApps WHERE webapp_id=p_entity_id;
      ELSE
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Invalid type for registration';
    END CASE;
    IF v_actual_group IS NULL OR v_actual_group <> p_group_id THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource not in customer group';
    END IF;
    IF p_resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL') AND
       (v_db_engine IS NULL OR v_db_engine <> p_resource_type) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Database engine mismatch';
    END IF;
    INSERT INTO ResourceRegistry
      (group_id,customer_user_id,resource_type,lb_id,blob_id,file_id,database_id,webapp_id,status,activated_at)
    VALUES(p_group_id,p_customer_id,p_resource_type,
      IF(p_resource_type='LOAD_BALANCER',p_entity_id,NULL),
      IF(p_resource_type='BLOB_STORAGE',p_entity_id,NULL),
      IF(p_resource_type='FILE_STORAGE',p_entity_id,NULL),
      IF(p_resource_type IN ('SQL_SERVER','POSTGRESQL','MYSQL'),p_entity_id,NULL),
      IF(p_resource_type='WEB_APP',p_entity_id,NULL),v_initial_status,
      IF(v_initial_status='active',UTC_TIMESTAMP(),NULL));
    SET p_new_resource_id=LAST_INSERT_ID();
    INSERT INTO ResourceActivityLogs(actor_user_id,resource_id,entity_type,entity_pk,action,new_status)
    VALUES(p_customer_id,p_new_resource_id,p_resource_type,p_entity_id,'registered',v_initial_status);
    COMMIT;
END$$

CREATE PROCEDURE sp_AddLoadBalancerTarget(IN p_lb_id INT,IN p_vm_id INT)
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM LoadBalancers lb JOIN VirtualNetworks n ON n.vnet_id=lb.vnet_id
        JOIN ResourceGroups g ON g.group_id=n.group_id
        JOIN VirtualMachines vm ON vm.vm_id=p_vm_id
        JOIN Subnets s ON s.subnet_id=vm.subnet_id
        JOIN ResourceRegistry lr ON lr.lb_id=lb.lb_id
        JOIN ResourceRegistry vr ON vr.vm_id=vm.vm_id
        WHERE lb.lb_id=p_lb_id AND lb.vnet_id=s.vnet_id
          AND g.status='active' AND n.status='active' AND s.status='active'
          AND lr.status NOT IN ('cancelled','deleted')
          AND vr.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='LB and VM must be active in same VNet';
    END IF;
    INSERT INTO LoadBalancerTargets(lb_id,vm_id)
    VALUES(p_lb_id,p_vm_id) ON DUPLICATE KEY UPDATE lb_id=lb_id;
END$$

CREATE PROCEDURE sp_CancelResource(IN p_resource_id INT,IN p_actor_user_id INT)
BEGIN
    DECLARE v_customer_id INT DEFAULT NULL;
    DECLARE v_type VARCHAR(30) DEFAULT NULL;
    DECLARE v_status VARCHAR(20) DEFAULT NULL;
    DECLARE v_vm_id INT DEFAULT NULL;
    DECLARE v_lb_id INT DEFAULT NULL;
    DECLARE v_blob_id INT DEFAULT NULL;
    DECLARE v_file_id INT DEFAULT NULL;
    DECLARE v_db_id INT DEFAULT NULL;
    DECLARE v_webapp_id INT DEFAULT NULL;
    DECLARE v_actor_role VARCHAR(20) DEFAULT NULL;
    DECLARE v_host_id INT DEFAULT NULL;
    DECLARE v_now DATETIME;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    SET v_now=UTC_TIMESTAMP();
    START TRANSACTION;
    SELECT role INTO v_actor_role FROM Users WHERE user_id=p_actor_user_id;
    SELECT customer_user_id,resource_type,status,vm_id,lb_id,blob_id,file_id,database_id,webapp_id
      INTO v_customer_id,v_type,v_status,v_vm_id,v_lb_id,v_blob_id,v_file_id,v_db_id,v_webapp_id
    FROM ResourceRegistry WHERE resource_id=p_resource_id FOR UPDATE;
    IF v_customer_id IS NULL OR v_actor_role IS NULL
       OR (v_actor_role<>'admin' AND p_actor_user_id<>v_customer_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource not found or actor unauthorized';
    END IF;
    IF v_status IN ('cancelled','deleted') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Resource already cancelled';
    END IF;
    IF v_vm_id IS NOT NULL AND EXISTS
       (SELECT 1 FROM LoadBalancerTargets WHERE vm_id=v_vm_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Remove VM from load balancers first';
    END IF;
    IF v_db_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM WebApps w JOIN ResourceRegistry r ON r.webapp_id=w.webapp_id
        WHERE w.database_id=v_db_id AND r.status NOT IN ('cancelled','deleted')
    ) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Cancel dependent Web Apps first';
    END IF;
    IF v_vm_id IS NOT NULL THEN
        SELECT host_id INTO v_host_id FROM VirtualMachines WHERE vm_id=v_vm_id;
        -- Serialize with creation and other host capacity changes.
        SELECT host_id INTO v_host_id FROM ProviderHosts WHERE host_id=v_host_id FOR UPDATE;
        UPDATE VmUsage SET stopped_at=v_now WHERE vm_id=v_vm_id AND stopped_at IS NULL;
        UPDATE HostCapacityAllocations SET released_at=v_now
          WHERE vm_id=v_vm_id AND released_at IS NULL;
        UPDATE VirtualMachines SET status='stopped' WHERE vm_id=v_vm_id;
    END IF;
    IF v_lb_id IS NOT NULL THEN
        DELETE FROM LoadBalancerTargets WHERE lb_id=v_lb_id;
        UPDATE LoadBalancers SET status='inactive' WHERE lb_id=v_lb_id;
    END IF;
    IF v_blob_id IS NOT NULL THEN
        UPDATE BlobStorage SET status='inactive' WHERE blob_id=v_blob_id;
    END IF;
    IF v_file_id IS NOT NULL THEN
        UPDATE FileStorage SET status='inactive' WHERE file_id=v_file_id;
    END IF;
    IF v_db_id IS NOT NULL THEN
        UPDATE ManagedDatabases SET status='stopped' WHERE database_id=v_db_id;
    END IF;
    IF v_webapp_id IS NOT NULL THEN
        UPDATE WebApps SET status='stopped' WHERE webapp_id=v_webapp_id;
    END IF;
    UPDATE ResourceUsagePeriods SET ended_at=v_now
      WHERE resource_id=p_resource_id AND ended_at IS NULL;
    UPDATE ResourceRegistry SET status='cancelled',cancelled_at=v_now
      WHERE resource_id=p_resource_id;
    INSERT INTO ResourceActivityLogs(actor_user_id,resource_id,entity_type,entity_pk,
                                     action,old_status,new_status)
    VALUES(p_actor_user_id,p_resource_id,v_type,
           COALESCE(v_vm_id,v_lb_id,v_blob_id,v_file_id,v_db_id,v_webapp_id),
           'cancelled',v_status,'cancelled');
    COMMIT;
END$$

DELIMITER ;

-- -------------------- INITIAL APP CONFIGURATION ----------------------------
-- 12 configurable starter prices for the simulated marketplace.
-- These are EXAMPLE tariff values; review/replace before real deployment.
-- Avoid overwriting prices when adding existing database records.

INSERT INTO pricing_rules (resource_type,cloud_class,unit_price)
VALUES
    ('CPU','Economy',2.00),('CPU','Business',3.00),('CPU','Critical',5.00),
    ('RAM','Economy',1.00),('RAM','Business',1.50),('RAM','Critical',2.50),
    ('Storage','Economy',0.03),('Storage','Business',0.06),('Storage','Critical',0.10),
    ('GPU','Economy',4.00),('GPU','Business',6.00),('GPU','Critical',10.00)
ON DUPLICATE KEY UPDATE id=id;

-- Billing prices historically derive from pricing_history, so every
-- active rule must have at least one immutable effective price record.
INSERT INTO pricing_history (pricing_rule_id,old_price,new_price,changed_at)
SELECT p.id,p.unit_price,p.unit_price,UTC_TIMESTAMP()
FROM pricing_rules p
WHERE NOT EXISTS (SELECT 1 FROM pricing_history h WHERE h.pricing_rule_id=p.id);
