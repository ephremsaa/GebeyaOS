-- Migration 011: License Keys, Business License / ID, and Verified Owner Download Portal
ALTER TABLE tenant_applications
    ADD COLUMN IF NOT EXISTS business_license_no VARCHAR(150),
    ADD COLUMN IF NOT EXISTS license_key VARCHAR(64),
    ADD COLUMN IF NOT EXISTS portal_password_hash VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_applications_license_key
    ON tenant_applications(license_key)
    WHERE license_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tenant_applications_email
    ON tenant_applications(LOWER(email));
