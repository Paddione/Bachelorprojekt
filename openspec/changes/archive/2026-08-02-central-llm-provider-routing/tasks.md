---
title: "central-llm-provider-routing — Implementation Plan"
ticket_id: T002015
domains: [database, website, factory]
status: draft
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# central-llm-provider-routing — Implementation Plan

_Ticket: T002015_

Ziel: eine Provider-Entscheidung, zwei kanonische Implementierungen (`provider-config.ts` als
TS-Referenz, `route-provider.sh` als Nicht-TS-Pendant); alle anderen Aufrufstellen delegieren.
`ternary-bonsai-27b`@`http://127.0.0.1:18235` (der Fixup-Proxy — **niemals** direkt `:8093`) wird per
DB-Seed der einzige aktive Provider, nicht per Code-Hardcode. Design-Detail:
`docs/superpowers/specs/2026-07-21-central-llm-provider-routing-design.md`.

## File Structure

Alle bestehenden Dateien sind **nicht** baselined (`docs/code-quality/baseline.json`) → wirksame
Schwelle = statisches Extension-Limit, Budget = Limit − Ist. Reihenfolge der Tasks = Reihenfolge der
Tabelle.

### Changed files (existing — Ist / Restbudget gegen Extension-Limit)

| Datei | Ist | Budget |
|---|---|---|
| `website/src/lib/provider-config.ts` | 91 | 509 |
| `website/src/lib/ki-services.ts` | 47 | 553 |
| `website/src/lib/provider-config.test.ts` | 50 | 550 |
| `website/src/lib/openai-compatible-session-agent.ts` | 113 | 487 |
| `website/src/lib/legacy-session-agent.ts` | 87 | 513 |
| `website/src/lib/claude-session-agent.ts` | 124 | 476 |
| `website/src/lib/coaching-classifier.ts` | 112 | 488 |
| `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts` | 56 | 544 |
| `website/src/pages/api/demo/coaching-sim.ts` | 188 | 412 |
| `website/src/pages/api/admin/cockpit/suggest.ts` | 64 | 536 |
| `website/src/lib/tickets/__tests__/cockpit-api.test.ts` | 415 | 185 |
| `website/src/lib/session-agent-factory.ts` | 26 | 574 |
| `scripts/factory/route-provider.sh` | 77 | 423 |
| `scripts/factory/auto-triage.sh` | 362 | 138 |

Nicht budget-gegated (Extension nicht in `gates.yaml` s1.limits / bzw. sanktionierte Ausnahme):
`scripts/factory/pipeline.js` (steht in `s1.ignore`, monolithisches Workflow-Skript — T000460),
`scripts/factory/mcp-go/main.go` (`.go` ungegated), `tests/spec/software-factory.bats`
(`tests/**/*.bats` in `s1.ignore`), sowie alle `.sql`-Migrationen.

### New files

- `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql` — idempotente Seed-Migration.

### Deleted files

- `scripts/factory/provider-router.js` — dritte, abgedriftete, zur Laufzeit tote Implementierung.
- `scripts/factory/provider-router.test.mjs` — Test der gelöschten Datei.

### Out of scope (bewusst NICHT angefasst)

- `.opencode/opencode.jsonc`, `.opencode/agent-models.jsonc` — konfigurieren die Modellwahl des
  Dev-Harness selbst, nicht die Applikation. Anderer Lebenszyklus.
- `scripts/factory/ci-review.mjs` — GitHub-Actions-Codereview, braucht bewusst Cloud-Modell-Qualität.

CQ02-Baseline: `grep ': any\|<any>\|as any' website/src` = 8 (Limit 200) — jede neue Funktion wird
voll typisiert, kein `any` wird eingeführt.

## Task 1 — DB-Seed-Migration: Bonsai als einziger aktiver Provider

Neue Migration `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql`, Stil/Idempotenz nach
Vorlage `scripts/migrations/2026-07-03-local-qwen35-seed.sql` (`BEGIN;`/`COMMIT;`, ON-CONFLICT-Upserts,
Header mit Per-Brand-Apply-Kommandos). Muss auf beide Brand-DBs anwendbar sein.

Real vorhandene `tier`-Werte in `tickets.provider_config` (verifiziert per Query, nicht geraten):
`haiku`, `sonnet`, `coaching`, `cheap`, `opus`. `opus` wird im Code hart auf Bonsai geroutet (Task 6),
braucht keine DB-Zeile. Zusätzlich seedet die Migration Tier `flash` (von `auto-triage.sh` via
`route-provider.sh triage flash` verlangt, aktuell ohne Zeile).

Steps:

- [ ] Header-Kommentar mit Zweck + beiden Per-Brand-Apply-Kommandos schreiben:

```sql
-- Apply to BOTH brands (separate per-brand DBs):
--   BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-21-provider-config-bonsai-only.sql'
--   BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-21-provider-config-bonsai-only.sql'
```

- [ ] Alle Nicht-Bonsai-Zeilen **deaktivieren, nicht löschen** (reversibel):

```sql
UPDATE tickets.provider_config
   SET enabled = false, updated_at = now()
 WHERE provider <> 'ternary-bonsai-27b';
```

- [ ] Pro Ziel-Tier (`haiku`, `sonnet`, `coaching`, `cheap`, `flash`) eine `source='*'`-Bonsai-Zeile
      als eindeutigen enabled-Gewinner sicherstellen. `priority = 0` vermeidet die
      `UNIQUE (source, tier, priority)`-Kollision mit bestehenden (jetzt deaktivierten) priority-1-Zeilen
      und gewinnt in `ORDER BY priority ASC` unter den enabled-Zeilen. Idempotent via ON CONFLICT:

```sql
INSERT INTO tickets.provider_config
  (source, tier, priority, provider, model_id, base_url, enabled)
VALUES
  ('*', 'haiku',    0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'sonnet',   0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'coaching', 0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'cheap',    0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true),
  ('*', 'flash',    0, 'ternary-bonsai-27b', 'ternary-bonsai-27b', 'http://127.0.0.1:18235', true)
ON CONFLICT (source, tier, priority) DO UPDATE
  SET provider = EXCLUDED.provider, model_id = EXCLUDED.model_id,
      base_url = EXCLUDED.base_url, enabled = true, updated_at = now();
```

- [ ] `tickets.factory_model_slots` (route-provider prüft es zuerst für `factory-*`-Phasen; enthält
      aktuell eine `plan`-Zeile auf `custom_lmstudio`) auf Bonsai umbiegen, damit auch der
      Phase-Slot-Pfad Bonsai liefert:

```sql
UPDATE tickets.factory_model_slots
   SET provider = 'ternary-bonsai-27b', model_id = 'ternary-bonsai-27b',
       base_url = 'http://127.0.0.1:18235';
```

- [ ] **Verify:** Migration gegen die lokale Dev-DB anwenden und Ergebnis prüfen — genau eine enabled
      Provider-Identität, alle mit Proxy-URL:

```bash
# Idempotenz-Check: zweimal anwenden muss identisch bleiben (ON CONFLICT).
BRAND=mentolder bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-21-provider-config-bonsai-only.sql'
BRAND=mentolder bash -c "source scripts/factory/lib.sh; factory_resolve; factory_psql -c \"SELECT DISTINCT provider, base_url FROM tickets.provider_config WHERE enabled = true;\""
# erwartet: nur ternary-bonsai-27b | http://127.0.0.1:18235
```

## Task 2 — TS-Referenz: `getProviderByName()` + neue SOURCE-Konstanten + Vitest

- [ ] In `website/src/lib/provider-config.ts` neben `getProviderConfig(source, tier)` eine neue
      exportierte Funktion `getProviderByName(providerName: string, brand?: string): Promise<ProviderChoice>`
      hinzufügen: direkter Lookup einer Zeile per `provider = $1 AND enabled = true` in
      `tickets.provider_config`, dieselbe Rückgabeform `ProviderChoice`. `apiKey` über die bestehende
      `apiKeyForProvider(provider)`-Logik füllen, wenn die Zeile keinen `api_key` hat. Ist der Provider
      **nicht** `enabled=true` (oder fehlt), wirft die Funktion einen typisierten Fehler
      (`class DisabledProviderError extends Error`) — **kein** stiller Fallback auf `process.env`.
- [ ] In `website/src/lib/ki-services.ts` zwei neue Einträge in die bestehende `SOURCE`-Konstante
      aufnehmen: `coachingClassifier: 'coaching-classifier'` und
      `coachingSessionComplete: 'coaching-session-complete'` (analog zu den vorhandenen
      `SOURCE.*`-Werten). Diese Sources haben keine eigene DB-Zeile und fallen deterministisch auf die
      `source='*'`-Bonsai-Zeile zurück.
- [ ] **Failing-Test + Fix (Vitest):** In `website/src/lib/provider-config.test.ts` einen Block für
      `getProviderByName` ergänzen: (a) enabled-Zeile → korrekte `{provider, modelId, baseUrl, apiKey}`;
      (b) disabled/fehlend → `DisabledProviderError` (kein `process.env`-Fallback). Test zuerst schreiben,
      dann implementieren:

```bash
cd website && pnpm vitest run src/lib/provider-config.test.ts
# expected: FAIL vor der Implementierung von getProviderByName (Funktion existiert noch nicht),
#           GREEN nachdem getProviderByName + DisabledProviderError implementiert sind
```

- [ ] **Verify:** `cd website && pnpm vitest run src/lib/provider-config.test.ts src/lib/ki-services.test.ts`
      (bestehende `getProviderConfig`- und `SOURCE`-Assertions bleiben grün — Verhalten von
      `getProviderConfig` ändert sich nicht).

## Task 3 — TS-Call-Sites: Coaching-Session-Agents delegieren an `getProviderByName()`

Alle drei entfernen ihre eigene URL-/Modell-/Key-Tabelle und beziehen `{modelId, baseUrl, apiKey}` aus
`getProviderByName(kiConfig.provider, brand)`.

- [ ] `website/src/lib/openai-compatible-session-agent.ts`: die lokalen `resolveEndpoint()`-,
      `resolveApiKey()`- und `resolveModel()`-Maps entfernen; stattdessen `getProviderByName()` aufrufen
      und `baseURL`/`apiKey`/`model` daraus setzen. `kiConfig.apiEndpoint`/`apiKey`/`modelName` bleiben
      als expliziter Override vor dem DB-Lookup erhalten (Kunden-Overrides).
- [ ] `website/src/lib/legacy-session-agent.ts`: die inline Model-Default-Tabelle
      (`gpt-4o-mini`/`mistral-small-latest`/`llama3`) entfernen; Modell/Key aus `getProviderByName()`
      beziehen. SDK-Auswahl (OpenAI vs. Mistral) bleibt providerabhängig.
- [ ] `website/src/lib/claude-session-agent.ts`: den unabhängigen
      `kiConfig.apiKey ?? process.env.ANTHROPIC_API_KEY`-Fallback in `buildClient()` entfernen; bei
      fehlender/deaktivierter DB-Zeile `getProviderByName()` werfen lassen statt still auf die Env-Var zu
      fallen (`baseURL` aus dem Lookup, `apiKey` aus `apiKeyForProvider`).
- [ ] **Verify:** `cd website && pnpm vitest run` gezielt für die betroffenen Session-Agent-Tests
      (bestehende `__tests__`), plus `cd website && pnpm tsc --noEmit` für Typkorrektheit.

<!-- vitest: bestehende Session-Agent-Tests werden erweitert statt neuer Datei; kein neues __tests__-File nötig -->

## Task 4 — TS-Call-Sites: Demo-Client + rohe `ANTHROPIC_API_KEY`-Bypässe entfernen

- [ ] `website/src/pages/api/demo/coaching-sim.ts`: den eigenen dritten `new OpenAI({...})`-Client-Bau
      entfernen und den Aufruf über `createSessionAgent()` aus `website/src/lib/session-agent-factory.ts`
      dispatchen (kein direkter Client mehr im Endpoint). `getActiveProvider()`-basierte KiConfig bleibt
      die Eingabe des Dispatchers.
- [ ] `website/src/lib/coaching-classifier.ts`: rohes `process.env.ANTHROPIC_API_KEY` (Zeile ~73–77)
      entfernen; stattdessen `getProviderConfig(SOURCE.coachingClassifier, 'haiku')` nutzen und
      `apiKey`/`baseURL`/`model` daraus in den Anthropic-Client übergeben (`baseURL` nur setzen, wenn die
      Zeile eine `baseUrl` liefert). Der injizierte `opts.client` bleibt für Tests vorrangig.
- [ ] `website/src/pages/api/admin/coaching/sessions/[id]/complete.ts`: den Legacy-Fallbackpfad
      (`const apiKey = process.env.ANTHROPIC_API_KEY`) durch
      `getProviderConfig(SOURCE.coachingSessionComplete, 'sonnet')` ersetzen; Client mit
      `apiKey`/`baseURL` aus dem Lookup bauen.
- [ ] **Verify:** `cd website && pnpm tsc --noEmit` und `cd website && pnpm vitest run` für die
      Coaching-bezogenen Test-Bundles.

<!-- vitest: reine Delegation an bereits getestete Helfer (session-agent-factory / getProviderConfig); kein neuer Logikpfad, daher bestehende Tests genügen -->

## Task 5 — `suggest-providers.ts` löschen + Cockpit-Consumer migrieren

- [ ] `website/src/pages/api/admin/cockpit/suggest.ts`: `resolveProvider(...)` (aus
      `lib/tickets/suggest-providers`) durch `getProviderByName(body.provider || 'deepseek', brand)`
      ersetzen; `.baseURL`/`.defaultModel`/`.apiKeyEnv`-Nutzung auf die `ProviderChoice`-Felder
      (`baseUrl`/`modelId`/`apiKey`) umstellen. Ein deaktivierter/fehlender Provider ergibt jetzt den
      typisierten Fehler statt `null`.
- [ ] `website/src/lib/tickets/suggest-providers.ts` löschen (nach der Migration referenziert nichts
      mehr `resolveProvider`/`ALLOWED_PROVIDERS`).
- [ ] `website/src/lib/tickets/__tests__/cockpit-api.test.ts`: die `resolveProvider`-Unit-Tests
      (Block „resolveProvider unit tests (B3)", ~Zeile 301–323) entfernen bzw. auf das neue
      `getProviderByName`-Verhalten umschreiben; verbleibende Cockpit-API-Tests bleiben.
- [ ] **Verify:** `cd website && pnpm vitest run src/lib/tickets/__tests__/cockpit-api.test.ts` und
      `cd website && pnpm tsc --noEmit` (keine dangling Imports auf die gelöschte Datei).

## Task 6 — Bash-Parität: `route-provider.sh` auf Bonsai + Delegation + tote Kopie entfernen

- [ ] **Failing-Test (RED):** In `tests/spec/software-factory.bats` einen `@test` ergänzen, der den
      Opus-Hardcode-Pfad prüft (hermetisch, keine DB): `route-provider.sh x opus` muss
      `baseUrl == http://127.0.0.1:18235` liefern. Auf dem aktuellen Branch liefert der Code
      `http://127.0.0.1:1234` → der Test ist rot:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats -f 'route-provider.sh opus routes to bonsai proxy'
# expected: FAIL — route-provider.sh gibt aktuell qwythos-9b-v2@127.0.0.1:1234 zurück
```

- [ ] **Fix (GREEN):** In `scripts/factory/route-provider.sh` `OPUS_MODEL`/`OPUS_BASE_URL` (Zeile 22–23)
      und den Emergency-Fallback (letzte Zeile) von `qwythos-9b-v2`@`http://127.0.0.1:1234` auf
      `ternary-bonsai-27b`@`http://127.0.0.1:18235` ändern. Der bats-Test aus dem RED-Step wird grün.
- [ ] `scripts/factory/auto-triage.sh`: die eigene Provider→URL-`case`-Tabelle in `call_llm`
      (`deepseek→api.deepseek.com`, `ollama→localhost:11434`, …, ~Zeile 168–195) entfernen und
      stattdessen die von `route-provider.sh` bereits gelieferte `baseUrl` als einzige URL-Quelle
      verwenden (die Extraktion des Endpunkts wird aus dem `case` heraus in die bestehende
      route-provider-Antwort verlagert; nur der `provider→api_key`-Env-Zweig bleibt, wo ein externer Key
      nötig ist).
- [ ] `scripts/factory/pipeline.js`: die inline `FACTORY_MODEL`-Konstante (Zeile 31) entfernen und den
      Wert zur Laufzeit über `route-provider.sh factory-implement <tier>` beziehen — gleiches Muster wie
      `scripts/factory/scout-llm-fallback.sh` es bereits nutzt (Aufruf → `jq`-Parse von
      `.provider`/`.modelId`/`.baseUrl`). `pipeline.js` ist in `s1.ignore` (sanktioniertes
      Monolith-Skript, T000460) — kein Zeilenbudget, aber der FA-SF-20-Strukturtest bleibt gültig.
- [ ] `scripts/factory/provider-router.js` und `scripts/factory/provider-router.test.mjs` **löschen**
      (dritte, abgedriftete, zur Laufzeit nirgends importierte Kopie).
- [ ] Den `FA-SF-71`-Block in `tests/spec/software-factory.bats`, der `node --test
      scripts/factory/provider-router.test.mjs` ausführt (~Zeile 3034), sowie die
      `provider-router`-Stringreferenz (~Zeile 3134) entfernen bzw. auf `route-provider.sh` umhängen, da
      die getestete Datei gelöscht wird.
- [ ] **Verify:** `tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats` (neuer Opus-Test
      grün, kein Verweis mehr auf gelöschte Dateien) und `bash -n scripts/factory/route-provider.sh
      scripts/factory/auto-triage.sh` (Syntax) plus `shellcheck` sofern verfügbar.

## Task 7 — Go: `factory_ask` shellt zu `route-provider.sh`

- [ ] `scripts/factory/mcp-go/main.go`: im `factory_ask`-Handler (`toolFactoryAsk`, ~Zeile 306/440) die
      eigenen `llmURL()`/`llmModel()`/`llmKey()`-Env-Defaults (`FACTORY_LLM_URL`=`192.168.100.10:1234`,
      `FACTORY_LLM_MODEL`=`hermes-3-llama-3.1-8b`, `FACTORY_LLM_API_KEY`) entfernen. Stattdessen per
      `os/exec` (bereits importiert) `route-provider.sh factory-mcp <tier>` aufrufen und dessen
      JSON-Ausgabe (`provider`/`modelId`/`baseUrl`) parsen. **Kein** neuer Go-DB-Treiber —
      `scripts/factory/mcp-go/go.mod` hat aktuell keine Dependencies, das MUSS so bleiben (JSON-Parse mit
      dem stdlib-`encoding/json`).
- [ ] Neue `source='factory-mcp'`-Auflösung: fällt über die `source='*'`-Bonsai-Zeilen aus Task 1
      deterministisch auf Bonsai zurück (keine eigene DB-Zeile nötig).
- [ ] **Verify:** `cd scripts/factory/mcp-go && go build ./... && go vet ./...` (kein neuer Eintrag in
      `go.mod`/`go.sum`; `git diff --exit-code scripts/factory/mcp-go/go.mod` muss sauber sein).

## Task 8 — Finale Verifikation

- [ ] OpenSpec-Delta validieren: `task test:openspec` (bzw. `bash scripts/openspec.sh validate`) muss
      grün sein.
- [ ] Test-Inventar nach Test-Änderungen regenerieren und mitcommitten:

```bash
task test:inventory   # aktualisiert website/src/data/test-inventory.json
```

- [ ] Die drei mandatory CI-Gates ausführen:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
