-- ============================================================================
-- Distributed Cloud Marketplace - seed.sql
-- DEV/TEST DATA ONLY. Compatible with the 20-table schema.sql.
-- MySQL 8.0.16+; run AFTER schema.sql on a development database.
--
-- Creates illustrative users, hosts, resource groups, all 11 resource types,
-- capacity allocations, registries, lifecycle/activity examples, and notices.
--
-- DEMO ACCOUNTS: All demo users share the same development password:
--   CloudDemo!2026
-- Passwords are stored as a bcrypt hash ($2b$12$...), not plaintext.
-- Change/delete these accounts before any publicly accessible deployment.
-- All sample email addresses use the reserved example.com domain.
--
-- Re-runnable: existing demo users/resources are not duplicated; do not use
-- as a migration or attempt to reset previously edited/deleted demo records.
-- EmailVerificationTokens and UserTwoFactor are left EMPTY intentionally:
-- the application must generate real random tokens and encrypted TOTP secrets.
-- The sample is simulation-only; it sends no emails and provisions no servers.
-- ============================================================================

USE DistributedCloudMarketplace;

-- ---------------------------------------------------------------------------
-- 1. DEMO USERS (bcrypt hash replaced with a real bcrypt value at creation)
-- ---------------------------------------------------------------------------
SET @demo_password_hash = '$2b$12$6OXrFg2zWgBoeCG6OzzwC.dx3F1.5QsvupmROAaOfHEQ1kYGZhvXS';

INSERT INTO Users
    (first_name, last_name, email, password_hash, role, email_verified_at)
VALUES
    ('Demo', 'Administrator', 'demo.admin@example.com', @demo_password_hash, 'admin', CURRENT_TIMESTAMP),
    ('Demo', 'Provider Alpha', 'demo.provider.alpha@example.com', @demo_password_hash, 'provider', CURRENT_TIMESTAMP),
    ('Demo', 'Provider Beta', 'demo.provider.beta@example.com', @demo_password_hash, 'provider', CURRENT_TIMESTAMP),
    ('Alex', 'Customer', 'demo.customer.alex@example.com', @demo_password_hash, 'customer', CURRENT_TIMESTAMP),
    ('Sam', 'Customer', 'demo.customer.sam@example.com', @demo_password_hash, 'customer', CURRENT_TIMESTAMP),
    ('Pending', 'Verification', 'demo.pending@example.com', @demo_password_hash, 'customer', NULL)
ON DUPLICATE KEY UPDATE user_id = user_id;

SELECT user_id INTO @demo_admin_id FROM Users WHERE email = 'demo.admin@example.com';
SELECT user_id INTO @demo_provider_alpha_id FROM Users WHERE email = 'demo.provider.alpha@example.com';
SELECT user_id INTO @demo_provider_beta_id FROM Users WHERE email = 'demo.provider.beta@example.com';
SELECT user_id INTO @demo_alex_id FROM Users WHERE email = 'demo.customer.alex@example.com';
SELECT user_id INTO @demo_sam_id FROM Users WHERE email = 'demo.customer.sam@example.com';

