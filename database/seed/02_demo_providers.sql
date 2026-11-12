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

