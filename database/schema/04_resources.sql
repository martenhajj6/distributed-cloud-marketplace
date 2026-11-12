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

