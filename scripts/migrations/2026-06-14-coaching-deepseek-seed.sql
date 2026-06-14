-- Seed DeepSeek als Coaching-Provider für beide Brands (idempotent)
-- Führe aus: kubectl exec -n workspace <shared-db-pod> -- psql -U website website -f /tmp/migration.sql
-- UND: kubectl exec -n workspace-korczewski <shared-db-pod> -- psql -U website website -f /tmp/migration.sql

DO $$
DECLARE
  next_priority INTEGER;
BEGIN
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
END $$;
