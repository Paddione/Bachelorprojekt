-- Seed DeepSeek als Standard-Coaching-Provider für beide Brands (idempotent)
-- Führe aus: kubectl exec -n workspace <shared-db-pod> -- psql -U website website -f /tmp/migration.sql
-- UND: kubectl exec -n workspace-korczewski <shared-db-pod> -- psql -U website website -f /tmp/migration.sql

DO $$
DECLARE
  next_priority INTEGER;
BEGIN
  -- mentolder: DeepSeek einfügen falls nicht vorhanden
  IF NOT EXISTS (SELECT 1 FROM tickets.provider_config WHERE source = 'coaching' AND brand = 'mentolder' AND provider = 'deepseek') THEN
    SELECT COALESCE(MAX(priority), 0) + 1 INTO next_priority
      FROM tickets.provider_config WHERE source = 'coaching' AND tier = 'coaching';
    INSERT INTO tickets.provider_config
      (source, tier, priority, brand, provider, model_id, enabled, is_active, display_name, enabled_fields)
    VALUES ('coaching', 'coaching', next_priority, 'mentolder', 'deepseek', 'deepseek-chat', true, false, 'DeepSeek', NULL);
    RAISE NOTICE 'deepseek coaching provider hinzugefügt für mentolder';
  ELSE
    RAISE NOTICE 'deepseek coaching provider existiert bereits für mentolder';
  END IF;

  -- mentolder: DeepSeek als einzigen aktiven Provider setzen
  UPDATE tickets.provider_config
    SET is_active = false
    WHERE source = 'coaching' AND brand = 'mentolder' AND provider <> 'deepseek';
  UPDATE tickets.provider_config
    SET is_active = true
    WHERE source = 'coaching' AND brand = 'mentolder' AND provider = 'deepseek';
  RAISE NOTICE 'deepseek als aktiver Coaching-Provider für mentolder gesetzt';

  -- korczewski: DeepSeek einfügen falls nicht vorhanden
  IF NOT EXISTS (SELECT 1 FROM tickets.provider_config WHERE source = 'coaching' AND brand = 'korczewski' AND provider = 'deepseek') THEN
    SELECT COALESCE(MAX(priority), 0) + 1 INTO next_priority
      FROM tickets.provider_config WHERE source = 'coaching' AND tier = 'coaching';
    INSERT INTO tickets.provider_config
      (source, tier, priority, brand, provider, model_id, enabled, is_active, display_name, enabled_fields)
    VALUES ('coaching', 'coaching', next_priority, 'korczewski', 'deepseek', 'deepseek-chat', true, false, 'DeepSeek', NULL);
    RAISE NOTICE 'deepseek coaching provider hinzugefügt für korczewski';
  ELSE
    RAISE NOTICE 'deepseek coaching provider existiert bereits für korczewski';
  END IF;

  -- korczewski: DeepSeek als einzigen aktiven Provider setzen
  UPDATE tickets.provider_config
    SET is_active = false
    WHERE source = 'coaching' AND brand = 'korczewski' AND provider <> 'deepseek';
  UPDATE tickets.provider_config
    SET is_active = true
    WHERE source = 'coaching' AND brand = 'korczewski' AND provider = 'deepseek';
  RAISE NOTICE 'deepseek als aktiver Coaching-Provider für korczewski gesetzt';
END $$;
