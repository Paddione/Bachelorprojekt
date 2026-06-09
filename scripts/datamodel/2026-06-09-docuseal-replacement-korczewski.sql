-- scripts/datamodel/2026-06-09-docuseal-replacement-korczewski.sql
-- Run in: psql -h shared-db -U website -d website (korczewski)

BEGIN;

-- Drop DocuSeal columns from document_templates
ALTER TABLE document_templates
  DROP COLUMN IF EXISTS docuseal_template_id;

-- Drop DocuSeal columns from document_assignments
ALTER TABLE document_assignments
  DROP COLUMN IF EXISTS docuseal_template_id,
  DROP COLUMN IF EXISTS docuseal_submission_slug,
  DROP COLUMN IF EXISTS docuseal_embed_src;

-- Add new signing columns
ALTER TABLE document_assignments
  ADD COLUMN IF NOT EXISTS signature_data   JSONB,
  ADD COLUMN IF NOT EXISTS signed_html      TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf       BYTEA,
  ADD COLUMN IF NOT EXISTS expires_at       TIMESTAMPTZ;

-- Create audit log table
CREATE TABLE IF NOT EXISTS signing_audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID        NOT NULL REFERENCES document_assignments(id) ON DELETE CASCADE,
  event         TEXT        NOT NULL,
  ip            INET,
  user_agent    TEXT,
  actor_id      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signing_audit_log__assignment_id
  ON signing_audit_log(assignment_id);

COMMIT;
