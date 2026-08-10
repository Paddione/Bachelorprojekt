-- 2026-08-10-provider-config-baseurl-drop-v1.sql
-- T003492 — Entfernt ein abschliessendes '/v1' aus tickets.provider_config.base_url.
--
-- WARUM: openspec/specs/software-factory.md (Requirement "Every Factory Tier Has a Fallback
-- Candidate Behind the Primary", Szenario "Cloud stage carries its key variable name") legt
-- fest, dass base_url die OpenAI-kompatible Wurzel adressiert, "that the callers append
-- /v1/chat/completions to". Die base_url gehoert also OHNE '/v1' in die Tabelle.
--
-- Beide Konsumenten der Spalte halten sich daran:
--   scripts/factory/auto-triage.sh        — haengt '/v1/chat/completions' an
--   scripts/factory/scout-llm-fallback.sh — haengt '/v1/chat/completions' bedingungslos an
-- Trug die Zeile bereits ein '/v1', entstand daraus '.../v1/v1/chat/completions' → HTTP 404.
-- Da curl ohne --fail laeuft, galt der 404 als Erfolg; der Fehler tauchte erst eine Ebene
-- spaeter als "no content in <provider> response" auf und war von einem Modellfehler nicht zu
-- unterscheiden. Wirkung: auto-triage triagierte ueber Wochen 0 von N Tickets.
--
-- MESSUNG (2026-08-10, Commit 33f9ba526, Kontext k3d-mentolder-dev / Namespace workspace):
--   source scripts/factory/lib.sh; factory_resolve
--   factory_psql <<'SQL'
--   SELECT count(*) FROM tickets.provider_config WHERE base_url LIKE '%/v1';
--   SQL
--   -- dev: 17 Zeilen (12 lokale llamacpp/lmstudio, 1 Cluster-Gateway, 4 deepseek)
--   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18235/v1/v1/chat/completions  -- 404
--   curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18235/v1/chat/completions     -- 200
--
-- ABGRENZUNG — NICHT auf tickets.llm_proxy_backends anwenden. Diese Tabelle traegt die
-- umgekehrte Konvention: laut openspec/specs/local-llm-proxy.md sendet der Konsument
-- `GET {baseUrl}/models`, dort gehoert das '/v1' also in die Spalte. Beide Tabellen im selben
-- Zug zu "vereinheitlichen" waere genau der Fehler, den diese Migration behebt.
--
-- Ebenfalls unberuehrt: base_url-Werte, die auf etwas anderes als '/v1' enden — insbesondere
-- 'https://api.deepseek.com/anthropic' (haiku-Zeile). Deren Endpunktform ist ein eigener
-- Vorgang, siehe T003495.
--
-- Idempotent: der Anker '$' laesst einen zweiten Lauf wirkungslos. Die Migration ist bewusst
-- nach Datum die letzte, damit sie beim Replay aller Migrationen auf einem frischen Cluster
-- nach den aelteren Seeds greift, die '/v1' noch mitschreiben.
--
-- Apply to BOTH brands (separate per-brand DBs).

BEGIN;

UPDATE tickets.provider_config
   SET base_url   = regexp_replace(base_url, '/v1$', ''),
       updated_at = now()
 WHERE base_url LIKE '%/v1';

-- Fail-closed: bricht die Transaktion ab, falls die Normalisierung nicht vollstaendig war.
DO $$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining
    FROM tickets.provider_config
   WHERE base_url LIKE '%/v1';
  IF remaining > 0 THEN
    RAISE EXCEPTION 'provider_config: % Zeile(n) enden weiterhin auf /v1', remaining;
  END IF;
END $$;

COMMIT;
