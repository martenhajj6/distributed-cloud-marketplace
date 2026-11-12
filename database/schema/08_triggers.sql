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


