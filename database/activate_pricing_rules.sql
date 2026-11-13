-- Run once on an existing cloud_marketplace database before using Edit/Delete.
-- For a freshly created database using cloud_marketplace.sql, do not run this.
ALTER TABLE pricing_rules ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
