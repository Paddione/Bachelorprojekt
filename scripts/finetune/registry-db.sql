-- registry-db.sql — model_registry helper functions — T002629
-- Diese Datei enthält idempotente PL/pgSQL-Hilfsfunktionen für die Modell-Registry CLI und die Runner.
-- Aufruf-Konvention: model_registry.function_name(...)
-- Hinweis: Die Datei ist via CREATE OR REPLACE idempotent und kann vor dem ersten Zugriff eingespielt werden.
-- Rollback:
-- DROP SCHEMA IF EXISTS model_registry CASCADE;

-- 1. insert_adapter
-- Get-or-create-Semantik (T004445 Review-Fix): existiert der Adapter schon, bleibt
-- er UNVERAENDERT — eval-runner/stat-collector rufen diese Funktion mit
-- Platzhalterwerten ('unknown', NULL) auf und duerfen registrierte Metadaten
-- (base_model, quantization) nicht ueberschreiben. Nur die Neuanlage setzt
-- die uebergebenen Werte.
CREATE OR REPLACE FUNCTION model_registry.insert_adapter(
  p_name TEXT, 
  p_base_model TEXT, 
  p_quantization TEXT DEFAULT NULL
) RETURNS INT AS $$
DECLARE
  v_id INT;
BEGIN
  SELECT id INTO v_id FROM model_registry.adapters WHERE name = p_name;
  IF v_id IS NULL THEN
    INSERT INTO model_registry.adapters (name, base_model, quantization)
    VALUES (p_name, p_base_model, p_quantization)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 2. upsert_eval_score
CREATE OR REPLACE FUNCTION model_registry.upsert_eval_score(
  p_adapter_id INT, 
  p_role TEXT, 
  p_score FLOAT, 
  p_harness_version TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO model_registry.eval_scores (adapter_id, role, score, harness_version)
  VALUES (p_adapter_id, p_role, p_score, p_harness_version)
  ON CONFLICT (adapter_id, role) DO UPDATE 
    SET score = EXCLUDED.score,
        harness_version = EXCLUDED.harness_version,
        evaluated_at = now();
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 3. upsert_stat_requirements
CREATE OR REPLACE FUNCTION model_registry.upsert_stat_requirements(
  p_adapter_id INT, 
  p_vram_mb INT DEFAULT NULL, 
  p_max_context INT DEFAULT NULL, 
  p_throughput_toks FLOAT DEFAULT NULL, 
  p_load_time_ms INT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO model_registry.stat_requirements (adapter_id, vram_mb, max_context, throughput_toks, load_time_ms)
  VALUES (p_adapter_id, p_vram_mb, p_max_context, p_throughput_toks, p_load_time_ms)
  ON CONFLICT (adapter_id) DO UPDATE SET
    vram_mb = COALESCE(EXCLUDED.vram_mb, model_registry.stat_requirements.vram_mb),
    max_context = COALESCE(EXCLUDED.max_context, model_registry.stat_requirements.max_context),
    throughput_toks = COALESCE(EXCLUDED.throughput_toks, model_registry.stat_requirements.throughput_toks),
    load_time_ms = COALESCE(EXCLUDED.load_time_ms, model_registry.stat_requirements.load_time_ms);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 4. upsert_provenance
CREATE OR REPLACE FUNCTION model_registry.upsert_provenance(
  p_adapter_id INT, 
  p_training_corpus TEXT DEFAULT NULL, 
  p_lora_rank INT DEFAULT NULL, 
  p_lora_alpha INT DEFAULT NULL, 
  p_git_commit TEXT DEFAULT NULL, 
  p_training_config JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO model_registry.provenance (adapter_id, training_corpus, lora_rank, lora_alpha, git_commit, training_config)
  VALUES (p_adapter_id, p_training_corpus, p_lora_rank, p_lora_alpha, p_git_commit, p_training_config)
  ON CONFLICT (adapter_id) DO UPDATE SET
    training_corpus = COALESCE(EXCLUDED.training_corpus, model_registry.provenance.training_corpus),
    lora_rank = COALESCE(EXCLUDED.lora_rank, model_registry.provenance.lora_rank),
    lora_alpha = COALESCE(EXCLUDED.lora_alpha, model_registry.provenance.lora_alpha),
    git_commit = COALESCE(EXCLUDED.git_commit, model_registry.provenance.git_commit),
    training_config = COALESCE(EXCLUDED.training_config, model_registry.provenance.training_config);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 5. upsert_deployment_config
CREATE OR REPLACE FUNCTION model_registry.upsert_deployment_config(
  p_adapter_id INT, 
  p_chat_template TEXT DEFAULT NULL, 
  p_stop_tokens TEXT[] DEFAULT NULL, 
  p_temperature FLOAT DEFAULT NULL, 
  p_top_p FLOAT DEFAULT NULL, 
  p_loadout_json JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO model_registry.deployment_config (adapter_id, chat_template, stop_tokens, temperature, top_p, loadout_json)
  VALUES (p_adapter_id, p_chat_template, p_stop_tokens, p_temperature, p_top_p, p_loadout_json)
  ON CONFLICT (adapter_id) DO UPDATE SET
    chat_template = COALESCE(EXCLUDED.chat_template, model_registry.deployment_config.chat_template),
    stop_tokens = COALESCE(EXCLUDED.stop_tokens, model_registry.deployment_config.stop_tokens),
    temperature = COALESCE(EXCLUDED.temperature, model_registry.deployment_config.temperature),
    top_p = COALESCE(EXCLUDED.top_p, model_registry.deployment_config.top_p),
    loadout_json = COALESCE(EXCLUDED.loadout_json, model_registry.deployment_config.loadout_json);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 6. get_adapter
CREATE OR REPLACE FUNCTION model_registry.get_adapter(p_name TEXT) 
RETURNS TABLE(
  id INT, 
  name TEXT, 
  base_model TEXT, 
  quantization TEXT, 
  vram_mb INT, 
  max_context INT, 
  throughput_toks FLOAT, 
  load_time_ms INT, 
  best_score FLOAT, 
  best_role TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id, 
    a.name, 
    a.base_model, 
    a.quantization,
    s.vram_mb,
    s.max_context,
    s.throughput_toks,
    s.load_time_ms,
    es.score,
    es.role
  FROM model_registry.adapters a
  LEFT JOIN model_registry.stat_requirements s ON a.id = s.adapter_id
  LEFT JOIN LATERAL (
    SELECT score, role 
    FROM model_registry.eval_scores 
    WHERE adapter_id = a.id 
    ORDER BY score DESC 
    LIMIT 1
  ) es ON TRUE
  WHERE a.name = p_name;
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. list_adapters
CREATE OR REPLACE FUNCTION model_registry.list_adapters(
  p_role TEXT DEFAULT NULL, 
  p_min_score FLOAT DEFAULT NULL
) RETURNS TABLE(
  name TEXT, 
  base_model TEXT, 
  quantization TEXT, 
  role TEXT, 
  score FLOAT, 
  vram_mb INT, 
  max_context INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.name, 
    a.base_model, 
    a.quantization,
    es.role,
    es.score,
    s.vram_mb,
    s.max_context
  FROM model_registry.adapters a
  LEFT JOIN model_registry.eval_scores es ON a.id = es.adapter_id
  LEFT JOIN model_registry.stat_requirements s ON a.id = s.adapter_id
  WHERE (p_role IS NULL OR es.role = p_role)
    AND (p_min_score IS NULL OR es.score >= p_min_score)
  ORDER BY es.score DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE;

