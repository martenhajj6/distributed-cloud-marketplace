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

