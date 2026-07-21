---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-21
---

# Zentrales LLM-Provider-Routing (Bonsai-only) — Design

## Problem

Eine Repo-weite Bestandsaufnahme (24 Aufrufstellen) zeigt, dass die Entscheidung "welcher LLM-Provider
wird für diesen Aufruf verwendet" an mindestens sechs unabhängigen Stellen getroffen wird, obwohl eine
echte DB-SSOT bereits existiert (`tickets.provider_config` / `tickets.provider_health`, Postgres,
Cooldown + Priorität + Source-Spezifität):

1. `website/src/lib/provider-config.ts` — die vollständigste Implementierung (`getProviderConfig(source, tier)`),
   genutzt von 4 Call-Sites (`claude.ts`, `assistant/llm.ts`, `ticket-triage.ts`, `admin/tickets/[id]/classify.ts`).
2. `website/src/lib/openai-compatible-session-agent.ts` — eigene hardcodierte `resolveEndpoint()`-URL-Map
   für Coaching-Provider (`deepseek`, `anthropic`, `local-cluster`, `local-lmstudio`, `local-ollama`).
3. `website/src/lib/legacy-session-agent.ts` — dritte Model-Default-Tabelle (`openai`/`mistral`/`claude-als-OAI-compat`).
4. `website/src/lib/tickets/suggest-providers.ts` — vierte, komplett unabhängige 2-Zeilen-Tabelle
   (`deepseek`/`anthropic`), berührt die DB gar nicht.
5. `scripts/factory/route-provider.sh` — bash-Reimplementierung desselben DB-Query-Algorithmus wie (1),
   mit eigenen Opus-/Emergency-Hardcodes (aktuell `qwythos-9b-v2`@`127.0.0.1:1234`).
6. `scripts/factory/provider-router.js` — eine JS-"Spec" für (5), die bereits von ihr **abgedriftet** ist
   (`ternary-bonsai-27b`@`18235` vs. `qwythos-9b-v2`@`1234`) und zur Laufzeit toter Code ist (nur vom
   eigenen Test importiert).

Zusätzlich umgehen drei Stellen jede zentrale Config komplett und lesen `process.env.ANTHROPIC_API_KEY`
roh (`coaching-classifier.ts`, `admin/coaching/sessions/[id]/complete.ts` Legacy-Fallback), und
`scripts/factory/pipeline.js` sowie `scripts/factory/mcp-go/main.go` haben je eine vierte/fünfte,
vollständig unabhängige Provider-Config-Oberfläche.

Der Auslöser dieses Changes: der neu installierte `ternary-bonsai-27b`-Server (siehe Memory
`reference-ternary-bonsai-27b-test-server`, läuft nur erreichbar über den Fixup-Proxy `:18235`, nie
direkt `:8093`) soll ab sofort der einzige aktive Provider sein — aber diese Umschaltung an sechs
unabhängigen Stellen synchron nachzuziehen ist genau das Wartungsproblem, das die Drift zwischen (5)
und (6) bereits demonstriert hat.

## Ziel

Eine Provider-Entscheidung, zwei kanonische Implementierungen (TS als Referenz, bash als
Nicht-TS-Pendant), alle anderen Aufrufstellen delegieren an eine von beiden. DB-Zeilen steuern, welcher
Provider aktiv ist — für "jetzt nur Bonsai" wird das über Daten (alle anderen Zeilen `enabled=false`),
nicht über Code-Bypass gelöst, damit spätere Provider-Aktivierung ohne Code-Änderung funktioniert.

## Architektur

### 1. TS-Referenzimplementierung — `website/src/lib/provider-config.ts`

Bleibt die SSOT-Implementierung für alle Node/TS-Aufrufer. Bekommt eine zweite Export-Funktion:

- **`getProviderConfig(source, tier)`** (bestehend, unverändert) — automatisches Tier-Cascading:
  Source-spezifische Zeilen vor `'*'`-Wildcard, dann Priorität, Cooldown-Check, Circuit-Breaker.
  Für Aufrufer, die "irgendein passender Provider für diesen Zweck" wollen.
- **`getProviderByName(providerName, brand?)`** (neu) — direkter Lookup by Providername für Stellen,
  an denen der Provider eine explizite Nutzer-/Admin-Wahl ist (Coaching-Konfiguration pro Kunde,
  Admin-Cockpit-Aktion), keine Cascade. Liefert dieselbe Rückgabeform (`{provider, modelId, baseUrl,
  apiKey}`) wie `getProviderConfig`, plus einen typisierten Fehler, wenn der gewählte Provider nicht
  `enabled=true` in der DB ist (relevant, sobald nur Bonsai aktiv ist — jede andere Wahl liefert einen
  klaren Fehler statt eines toten Hardcoded-Fallbacks).

Call-Sites, die ab jetzt ausschließlich eine dieser zwei Funktionen aufrufen (keine eigene URL-/
Modell-Tabelle mehr):

| Datei | Vorher | Nachher |
|---|---|---|
| `openai-compatible-session-agent.ts` | eigene `resolveEndpoint()`-Map | `getProviderByName(kiConfig.provider)` |
| `legacy-session-agent.ts` | eigene Model-Default-Tabelle | `getProviderByName(kiConfig.provider)` |
| `tickets/suggest-providers.ts` | eigene 2-Zeilen-Tabelle, keine DB | ersetzt durch `getProviderByName()`; Datei entfällt |
| `coaching-classifier.ts` | roh `process.env.ANTHROPIC_API_KEY` | `getProviderConfig(SOURCE.coachingClassifier, 'haiku')` (neue SOURCE-Konstante) |
| `admin/coaching/sessions/[id]/complete.ts` (Legacy-Pfad) | roh `process.env.ANTHROPIC_API_KEY` | `getProviderConfig(SOURCE.coachingSessionComplete, 'sonnet')` |
| `demo/coaching-sim.ts` | eigener dritter `OpenAI`-Client-Bau | dispatcht über `session-agent-factory.ts` statt eigenem Client |

`claude-session-agent.ts` bezieht bereits über `coaching-ki-config-db.ts` aus derselben Tabelle, hat
aber einen zusätzlichen, unabhängigen `process.env.ANTHROPIC_API_KEY`-Fallback-Pfad — der entfällt;
bei fehlender/deaktivierter DB-Zeile wirft `getProviderByName` statt still auf Env zu fallen.

### 2. Bash-Parität — `scripts/factory/route-provider.sh`

Bleibt die kanonische Nicht-TS-Implementierung gegen dieselbe DB-Tabelle (`factory_psql`, wie heute).
Änderungen:

- Opus-/Emergency-Hardcode korrigiert von `qwythos-9b-v2`@`http://127.0.0.1:1234` auf
  `ternary-bonsai-27b`@`http://127.0.0.1:18235` (der Proxy — direkter Zugriff auf `:8093` ist laut
  Memory-Eintrag für JEDEN Client falsch, weil `:8093` das `role:"system"`-Mid-Array-Problem hat, das
  der Proxy patcht).
- `auto-triage.sh`s eigene Provider→URL-`case`-Tabelle (`deepseek→api.deepseek.com`,
  `ollama→localhost:11434`, …) entfällt — sie nutzt stattdessen die `baseUrl`, die
  `route-provider.sh` bereits aus der DB-Zeile zurückgibt (die DB-Zeile ist die einzige URL-Quelle).
- `scripts/factory/pipeline.js`s eigener, hardcodierter `FACTORY_MODEL`-Konstante entfällt; ruft
  stattdessen zur Laufzeit `route-provider.sh factory-implement <tier>` auf (gleiches Muster wie
  `scout-llm-fallback.sh` es bereits tut), statt eine feste Kopie zu inlinen.
- **`scripts/factory/provider-router.js` und `provider-router.test.mjs` werden gelöscht.** Sie sind
  die dritte, bereits abgedriftete Kopie desselben Algorithmus und werden zur Laufzeit nirgends
  importiert — sie sind exakt das Duplikations-Muster, das dieser Change beseitigt. Ersatz: ein
  bats-Test gegen `route-provider.sh` selbst (siehe Testing unten) übernimmt die Rolle "Algorithmus
  ist getestet", ohne eine dritte Implementierung zu pflegen.

### 3. Go — `scripts/factory/mcp-go/main.go`

Der `factory_ask`-MCP-Tool-Handler hat aktuell eigene `FACTORY_LLM_URL`/`FACTORY_LLM_MODEL`/
`FACTORY_LLM_API_KEY`-Env-Defaults (`192.168.100.10:1234`, `hermes-3-llama-3.1-8b`), unabhängig von
der DB. Er bekommt keinen neuen Postgres-Treiber (kein `go.sum`-Wachstum) — stattdessen shellt der
Handler bei Tool-Aufruf zu `route-provider.sh factory-mcp <tier>` (neue `source='factory-mcp'`-Zeilen
in der DB) und parsed dessen JSON-Ausgabe, exakt das Muster, das `auto-triage.sh` und
`scout-llm-fallback.sh` bereits für bash-Aufrufer etablieren.

### 4. DB-Seed-Migration — Bonsai als einziger aktiver Provider

Neue Migration `scripts/migrations/2026-07-21-provider-config-bonsai-only.sql`, idempotent, auf beide
Brand-Kontexte anzuwenden (`workspace` und `workspace-korczewski`, analog zu bestehenden
Provider-Migrationen):

- `UPDATE tickets.provider_config SET enabled=false WHERE provider <> 'ternary-bonsai-27b'` — bestehende
  Zeilen werden **deaktiviert, nicht gelöscht** (reversibel: andere Provider später einfach wieder
  `enabled=true` setzen, keine Code-Änderung nötig).
- Für jede in Gebrauch befindliche Tier/Source-Kombination (`sonnet`, `haiku`, `opus`, `flash`, `cheap`,
  Coaching-Provider-Namen etc. — die exakte Liste ermittelt der Plan-Agent aus den echten `tier`-Werten
  in der Tabelle) eine `ternary-bonsai-27b`-Zeile mit `base_url='http://127.0.0.1:18235'`,
  `enabled=true`, `priority=1` sicherstellen (`INSERT ... ON CONFLICT DO UPDATE`).

### Bewusst außen vor

- **`.opencode/*`** (`opencode.jsonc`, `agent-models.jsonc`) — konfiguriert die Modellwahl des
  Dev-Harness selbst (welches Modell ein opencode-Subagent nutzt), nicht die Applikation. Andere
  Zwecke, andere Lebenszyklus — bleibt unangetastet.
- **`scripts/factory/ci-review.mjs`** — GitHub-Actions-Codereview, braucht bewusst Cloud-Modell-Qualität
  für Review-Genauigkeit, nicht das lokale Bonsai-Modell. Bleibt unangetastet, als dokumentierte
  Ausnahme im SSOT-Spec vermerkt.

## Fehlerbehandlung

- `getProviderByName()` wirft einen typisierten Fehler (kein stiller Fallback auf Env-Var), wenn der
  gewählte Provider nicht `enabled=true` ist — macht sichtbar, dass z.B. eine Kunden-Coaching-Config
  auf `deepseek` zeigt, während nur Bonsai aktiv ist, statt dass der Request auf einen ungewollten
  Hardcoded-Default zurückfällt.
- `route-provider.sh`s bestehender Emergency-Fallback-Pfad (kein Kandidat verfügbar/claimbar) bleibt
  erhalten, zeigt aber ab jetzt ebenfalls auf `ternary-bonsai-27b`@`18235` statt `qwythos-9b-v2`@`1234`.
- Bestehende Cooldown-/Circuit-Breaker-Mechanik (`tickets.provider_health`) bleibt unverändert aktiv —
  auch mit nur einem enabled Provider schützt sie vor Endlos-Retries gegen einen abgestürzten
  Bonsai-Server.

## Testing

- **Bats-Test** gegen `route-provider.sh` (in `tests/spec/software-factory.bats` oder passendem
  Spec-File): GIVEN eine DB mit nur `ternary-bonsai-27b` enabled, WHEN `route-provider.sh <source>
  sonnet` aufgerufen wird, THEN liefert es `baseUrl=http://127.0.0.1:18235`. Rot vor der
  Migration/dem Bash-Fix, grün danach.
- **Vitest** für `getProviderByName()` (neue Funktion) — Provider gefunden/enabled → Config
  zurückgegeben; Provider disabled/nicht vorhanden → typisierter Fehler, kein stiller Fallback.
- Bestehende `provider-config`-Tests (falls vorhanden) laufen weiter unverändert grün — Verhalten von
  `getProviderConfig()` selbst ändert sich nicht, nur wer sie aufruft.
- Kein produktiver Live-Call gegen den echten Bonsai-Server im Test — DB-Fixtures/Mocks wie bei den
  bestehenden `provider-router.test.mjs`-artigen Tests (die als lebendes Beispiel vor dem Löschen als
  Vorlage für die neuen Tests dient).

## Scope-Hinweis für die Implementierung

~15 Dateien über TS/bash/Go/SQL. Der Plan-Agent soll die Aufgaben nach den Task-Sizing-Konventionen aus
`openspec/config.yaml` aufteilen (vermutlich mehrere Tasks pro Sprach-Ebene: DB-Migration zuerst,
dann TS-Referenz + Call-Site-Migration, dann bash-Parität, dann Go, jeweils mit eigenem
Verify-Schritt) statt eines einzigen monolithischen Tasks.
