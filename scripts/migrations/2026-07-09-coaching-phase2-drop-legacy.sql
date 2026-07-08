-- 2026-07-09-coaching-phase2-drop-legacy.sql
-- CLEANUP-Migration (Phase 2): Drop der Legacy-Coaching-Provider-Tabellen.
-- Reihenfolge: NACH 2026-06-14-coaching-data-migrate.sql (Datenmigration abgeschlossen).
-- Auf BEIDE Brand-DBs anwenden (workspace UND workspace-korczewski):
--   BRAND=mentolder   bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql'
--   BRAND=korczewski  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql'
-- Idempotent (DROP ... IF EXISTS) und transaktional (BEGIN/COMMIT mit ON_ERROR_STOP).
-- NICHT betroffen: coaching.sessions.ki_config_id + FK sessions_ki_config_id_fkey.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  fk_target regclass;
  orphan_count bigint;
BEGIN
  -- Guard (a): FK muss bereits auf tickets.provider_config zeigen.
  SELECT confrelid::regclass INTO fk_target
  FROM pg_constraint
  WHERE conname = 'sessions_ki_config_id_fkey'
    AND connamespace = 'coaching'::regnamespace;

  IF fk_target IS DISTINCT FROM 'tickets.provider_config'::regclass THEN
    RAISE EXCEPTION
      'Phase-2 abort: sessions_ki_config_id_fkey zeigt auf %, erwartet tickets.provider_config',
      fk_target;
  END IF;

  -- Guard (b): keine Session darf eine id referenzieren, die nicht im neuen Store existiert.
  SELECT count(*) INTO orphan_count
  FROM coaching.sessions s
  WHERE s.ki_config_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tickets.provider_config p WHERE p.id = s.ki_config_id
    );

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Phase-2 abort: % Sessions referenzieren eine config-id ohne Eintrag in tickets.provider_config',
      orphan_count;
  END IF;
END $$;

DROP TABLE IF EXISTS coaching.ki_config_id_map;
DROP TABLE IF EXISTS coaching.ki_config;

COMMIT;
