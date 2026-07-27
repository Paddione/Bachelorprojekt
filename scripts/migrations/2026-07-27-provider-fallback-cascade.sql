-- scripts/migrations/2026-07-27-provider-fallback-cascade.sql
-- T002359: Der Provider-Fallback war strukturell unerreichbar. Diese Migration stellt die
-- dreistufige Kaskade in genau den Tiers her, die real angefragt werden, und traegt die
-- Key-Zuordnung als Variablennamen ein (der Key selbst bleibt in git-crypt).
--
-- REIHENFOLGE IST KRITISCH: tickets.provider_config traegt UNIQUE (source, tier, priority).
-- Die Zeile ('*','sonnet',1) ist bereits belegt (deepseek-v4-pro). Sie muss erst auf
-- Prioritaet 2 weichen, bevor lmstudio auf 1 eingefuegt werden kann — anders herum bricht
-- der INSERT an der Unique-Constraint ab und die gesamte Transaktion faellt zurueck.
--
-- brand='*': die Factory-Tiers cheap/flash/sonnet routen brand-agnostisch, genau wie alle
-- bestehenden Geschwisterzeilen. Eine brand-spezifische Zeile waere hier irrefuehrend, weil
-- route-provider.sh gar nicht nach brand filtert.
BEGIN;

ALTER TABLE tickets.provider_config      ADD COLUMN IF NOT EXISTS api_key_env TEXT;
ALTER TABLE tickets.factory_model_slots  ADD COLUMN IF NOT EXISTS api_key_env TEXT;

COMMENT ON COLUMN tickets.provider_config.api_key_env IS
  'Name der Env-Variable, die den API-Key traegt (z.B. DEEPSEEK_API_KEY_PK fuer die Factory, '
  'DEEPSEEK_API_KEY fuer Coaching). NIE der Key selbst — der liegt git-crypt-verschluesselt in '
  'environments/<env>.yaml-Secrets. NULL = Provider braucht keinen Key (lokale Backends).';

COMMENT ON COLUMN tickets.factory_model_slots.api_key_env IS
  'Wie tickets.provider_config.api_key_env — der Phase-Pin ist Kandidat #0 derselben Kette '
  'und muss dasselbe Feldformat liefern.';

-- Schritt 1: die bestehende sonnet-DeepSeek-Zeile raeumt Prioritaet 1 und bekommt die
-- korrekte Base-URL sowie den Key-Namen. Der Pfad /anthropic ergab gegen das angehaengte
-- /v1/chat/completions einen 404; der Anthropic-Mode waere /v1/messages.
--
-- base_url traegt KEIN Pfadsuffix — jeder Konsument haengt seinen eigenen Pfad an:
-- auto-triage.sh und scout-llm-fallback.sh bilden '<base>/v1/chat/completions'. Ein
-- gespeichertes '/v1' ergaebe '/v1/v1/chat/completions' und damit denselben 404, den
-- diese Zeile gerade beseitigt (der Guard in auto-triage.sh matcht '*/v1/*', also nur
-- MIT nachfolgendem Slash — ein URL-Ende auf '/v1' rutscht durch). Alle uebrigen
-- Registry-Zeilen speichern die base_url ebenfalls suffixfrei.
UPDATE tickets.provider_config
   SET priority    = 2,
       base_url    = 'https://api.deepseek.com',
       api_key_env = 'DEEPSEEK_API_KEY_PK',
       updated_at  = now()
-- priority IN (1,2), nicht '= 1': nach dem ersten Lauf steht die Zeile bereits auf 2, und
-- ein Filter auf 1 wuerde beim Re-Run nicht mehr greifen — eine spaetere Korrektur an
-- base_url oder api_key_env liefe dann still ins Leere. Beide Werte sind Zielzustand,
-- kein Delta, also ist der breitere Filter auch beim ersten Lauf korrekt.
 WHERE source = '*' AND tier = 'sonnet' AND provider = 'deepseek' AND priority IN (1, 2);

-- Schritt 2: Stufe 2 = LM Studio direkt, umgeht den Proxy und deckt damit einen
-- Proxy-Ausfall bei laufendem Backend ab. Stufe 3 = DeepSeek, faengt den Totalausfall
-- des GPU-Hosts. Prioritaet 0 (llamacpp ueber den Proxy) existiert bereits in allen drei
-- Tiers und bleibt unberuehrt.
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, max_concurrent, enabled, api_key_env, brand)
VALUES
  ('*', 'cheap',  1, 'lmstudio', 'gemma-4-12b',   'http://127.0.0.1:1234',       3, true, NULL,                  '*'),
  ('*', 'cheap',  2, 'deepseek', 'deepseek-chat', 'https://api.deepseek.com',     3, true, 'DEEPSEEK_API_KEY_PK', '*'),
  ('*', 'flash',  1, 'lmstudio', 'gemma-4-12b',   'http://127.0.0.1:1234',       3, true, NULL,                  '*'),
  ('*', 'flash',  2, 'deepseek', 'deepseek-chat', 'https://api.deepseek.com',     3, true, 'DEEPSEEK_API_KEY_PK', '*'),
  ('*', 'sonnet', 1, 'lmstudio', 'gemma-4-12b',   'http://127.0.0.1:1234',       3, true, NULL,                  '*')
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider    = EXCLUDED.provider,
      model_id    = EXCLUDED.model_id,
      base_url    = EXCLUDED.base_url,
      enabled     = EXCLUDED.enabled,
      api_key_env = EXCLUDED.api_key_env,
      updated_at  = now();

-- Schritt 3: RC3 — llamacpp stand seit 2026-07-27 03:30 UTC auf active_agents=3 =
-- max_concurrent und wurde von der Kandidatenkette still uebersprungen. Idempotent,
-- damit ein erneuter Lauf der Migration keine LAUFENDEN Claims abraeumt: nur Zeilen
-- ohne frischen Claim werden angefasst.
UPDATE tickets.provider_health
   SET active_agents = 0, reserved_tokens = 0, claimed_at = NULL, updated_at = now()
 WHERE provider = 'llamacpp'
   AND (claimed_at IS NULL OR claimed_at < now() - interval '30 minutes');

COMMIT;
