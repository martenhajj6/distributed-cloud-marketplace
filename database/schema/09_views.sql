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
