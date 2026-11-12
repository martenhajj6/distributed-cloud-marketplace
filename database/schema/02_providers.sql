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

