-- Migration: add 'model_3d' to assets.asset_type enum.
-- Apply manually (no auto-runner):
--   kubectl exec -n <workspace-ns> deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260607_add_model_3d_type.sql
-- ADD VALUE cannot run inside a transaction block on older PG; PG16 allows it.
ALTER TYPE assets.asset_type ADD VALUE IF NOT EXISTS 'model_3d';
