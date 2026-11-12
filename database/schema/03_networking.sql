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

