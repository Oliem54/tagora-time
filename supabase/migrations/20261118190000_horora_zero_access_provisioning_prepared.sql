-- Prepared only. Do not apply.
-- Do not apply to Production. Do not apply to a remote database.
-- MIGRATION_APPLIED = false. NOT_EXECUTED.
-- TAGORA HORORA (tagora_time) technical identity for
-- TAGORA ZERO ACCESS IDENTITY PROVISIONING CONTRACT V1.1.
-- Audience tagora:time.
-- No seed rows. No real user, role, membership, RBAC grant, or session.
-- HORORA Premium User Central remains the RBAC authority.
-- This script aborts before any catalog change.

DO $$ BEGIN RAISE EXCEPTION 'NOT_EXECUTED'; END $$;

CREATE SCHEMA IF NOT EXISTS horora_identity;

CREATE TABLE horora_identity.technical_identities (
  nuser_id text PRIMARY KEY CHECK (nuser_id ~ '^nuser_[a-f0-9]{32}$'),
  local_subject_id text UNIQUE CHECK (local_subject_id IS NULL OR local_subject_id ~ '^local_[a-z0-9_]{1,64}$'),
  identity_version integer NOT NULL CHECK (identity_version >= 0),
  security_block text NOT NULL CHECK (security_block IN ('NONE', 'SUSPENDED', 'REVOKED')),
  permission_latch text NOT NULL CHECK (permission_latch IN ('OPEN', 'RESTORE_REQUIRED', 'REVOKED_TERMINAL')),
  session_active boolean NOT NULL DEFAULT false,
  session_close_count integer NOT NULL DEFAULT 0 CHECK (session_close_count >= 0),
  created_by_contract boolean NOT NULL DEFAULT false,
  business_files_present boolean NOT NULL DEFAULT false,
  contract_granted_access boolean NOT NULL DEFAULT false CHECK (contract_granted_access = false)
);

CREATE TABLE horora_identity.local_principals (
  local_subject_id text PRIMARY KEY CHECK (local_subject_id ~ '^local_[a-z0-9_]{1,64}$'),
  linked_nuser_id text UNIQUE CHECK (linked_nuser_id IS NULL OR linked_nuser_id ~ '^nuser_[a-f0-9]{32}$'),
  stored_business_role text NOT NULL,
  stored_module_access boolean NOT NULL,
  stored_module_admin boolean NOT NULL,
  preexisting_organization_id text,
  business_files_present boolean NOT NULL DEFAULT false
);

CREATE TABLE horora_identity.delivery_receipts (
  event_id text PRIMARY KEY CHECK (event_id ~ '^evt_[a-z0-9_]{8,64}$'),
  jti text NOT NULL UNIQUE CHECK (jti ~ '^jti_[a-z0-9_]{8,64}$'),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  result text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE horora_identity.decision_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  result text NOT NULL,
  reason text NOT NULL,
  event_id text NOT NULL,
  jti text NOT NULL,
  nuser_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE horora_identity.technical_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.technical_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.local_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.local_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.delivery_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.delivery_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.decision_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE horora_identity.decision_log FORCE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA horora_identity FROM PUBLIC;
REVOKE ALL ON SCHEMA horora_identity FROM anon;
REVOKE ALL ON SCHEMA horora_identity FROM authenticated;

REVOKE ALL ON TABLE horora_identity.technical_identities FROM PUBLIC;
REVOKE ALL ON TABLE horora_identity.technical_identities FROM anon;
REVOKE ALL ON TABLE horora_identity.technical_identities FROM authenticated;
REVOKE ALL ON TABLE horora_identity.local_principals FROM PUBLIC;
REVOKE ALL ON TABLE horora_identity.local_principals FROM anon;
REVOKE ALL ON TABLE horora_identity.local_principals FROM authenticated;
REVOKE ALL ON TABLE horora_identity.delivery_receipts FROM PUBLIC;
REVOKE ALL ON TABLE horora_identity.delivery_receipts FROM anon;
REVOKE ALL ON TABLE horora_identity.delivery_receipts FROM authenticated;
REVOKE ALL ON TABLE horora_identity.decision_log FROM PUBLIC;
REVOKE ALL ON TABLE horora_identity.decision_log FROM anon;
REVOKE ALL ON TABLE horora_identity.decision_log FROM authenticated;
