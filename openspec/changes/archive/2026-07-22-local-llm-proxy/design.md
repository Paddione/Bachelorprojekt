---
ticket_id: T002081
plan_ref: openspec/changes/local-llm-proxy/tasks.md
status: active
date: 2026-07-22
domains: [factory, website, infra]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# local-llm-proxy — SSOT-Gateway mit dynamischer Modell-Discovery + Steuerungs-GUI

## Problem

T002015 (#3009) hat die Provider-*Entscheidung* konsolidiert (DB-SSOT `tickets.provider_config`,
`getProviderConfig`/`getProviderByName`, `route-provider.sh`). Aber der *Datenpfad* ist weiterhin
fragmentiert und driftet bereits wieder:

1. Der Fixup-Proxy `:18235` (patcht den `role:"system"`-Mid-Array-Bug des Bonsai-Servers `:8093`)
   läuft **ad-hoc außerhalb des Repos** — nicht versioniert, nicht neustartfest, nicht erweiterbar.
2. **Live-Drift in der DB:** `provider_config`-Zeilen für `factory-implement`/`factory-review` und
   zwei `factory_model_slots` (implement/verify) zeigen **direkt** auf `http://127.0.0.1:8093/v1`
   und umgehen damit den Fixup-Patch; die `source='*'`-Zeilen zeigen korrekt auf `:18235`.
3. `route-provider.sh` trägt noch den Opus-/Emergency-Hardcode `qwythos-9b-v2`@`:1234`.
4. **Keine dynamische Discovery:** Model-IDs stehen statisch in der DB. Wechselt das in LM Studio
   geladene Modell oder fällt der llama.cpp-Server aus, laufen Requests gegen stale IDs in Fehler,
   statt auf ein tatsächlich verfügbares Modell auszuweichen.
5. **Keine GUI für den Datenpfad:** Der Steuerung-Tab (`/admin/pipeline?tab=control`) zeigt
   Provider-*Konfiguration* (KiRoutingPanel, FactoryModelSlots), aber nicht, welche Backends/Modelle
   *jetzt gerade* erreichbar/geladen sind; das Sidekick-Submenü hat keinen LLM-Proxy-Eintrag.

## Ziel

Ein **repo-verwalteter lokaler LLM-Proxy** als alleiniges Gateway zwischen allen Clients
(Factory-Skripte, Website-Dev, opencode, claude-CLI) und allen Backends — llama.cpp (`:8093`),
LM Studio Windows (`:1234`), DeepSeek API, Opencode Go (opencode-zen). Dazu dynamische
`/v1/models`-Discovery mit Verfügbarkeits-Fallback und eine funktionale GUI in Steuerung-Tab
**und** Sidekick-Submenü.

## Entscheidungen (Brainstorming 2026-07-22, Board `.lavish/local-llm-proxy-brainstorm.html`)

| # | Entscheidung | Verworfen | Begründung |
|---|---|---|---|
| 1 | Node.js-Service `scripts/llm-proxy/` auf dem WSL-Host | Website-API als Proxy; Go | Backends sind nur host-lokal erreichbar (127.0.0.1); Website läuft im Cluster; kein neues Runtime |
| 2 | **Port 18235 übernehmen** (ersetzt Ad-hoc-Proxy in-place) | neuer Port + Massen-Migration | Alle korrekten DB-Zeilen/Client-Configs bleiben gültig; nur Drift-Zeilen werden migriert |
| 3 | Neue Tabelle `tickets.llm_proxy_backends` als Backend-Registry | `provider_config` überladen | `provider_config` = „welcher Provider für welchen Zweck"; Backend-Liste = „welche Upstreams kennt der Proxy" — getrennte Semantik |
| 4 | Discovery: 30s-Poll + on-demand `/v1/models` je Backend; Fallback: exakte ID → Alias-Map → erstes Modell des höchstprioren gesunden Backends | statisches Routing | Kern-Anforderung „whatever model is available" |
| 5 | GUI: neues `LlmProxyPanel.svelte` im Steuerung-Tab (control-extras) + neuer Sidekick-Eintrag `llm-proxy` mit eigener Drawer-View | dritte Admin-Seite | User-Vorgabe: bestehender Steuerung-Tab + Sidekick-Submenü |
| 6 | Migration biegt alle enabled `provider_config`-Zeilen + `factory_model_slots` + `route-provider.sh`-Hardcodes auf `:18235` | — | „sole gateway": Direktzugriff auf `:8093`/`:1234` nur noch proxy-intern |

## Architektur

### 1. Proxy-Service — `scripts/llm-proxy/`

Node.js ≥20, keine neuen npm-Dependencies (nur `node:http`/`fetch`). Module:

- **`server.mjs`** — HTTP-Server auf `LLM_PROXY_PORT` (Default **18235**). Endpunkte:
  - `POST /v1/chat/completions` (+ transparentes Pass-through weiterer `/v1/*`-Pfade inkl.
    SSE-Streaming als Byte-Pipe): Routing per Modell-ID (s. Discovery), Backend-spezifische
    Request-Fixups anwenden, Upstream-Antwort durchreichen. Antwort-Header
    `x-llm-proxy-backend` und `x-llm-proxy-served-model` machen jede Substitution sichtbar.
  - `GET /v1/models`: aggregierte Live-Modellliste über alle gesunden enabled Backends.
  - `GET /admin/state`: JSON-Status (Backends, Health, entdeckte Modelle, letzte Probe,
    Routing-Zähler) für die GUI.
  - `POST /admin/reload`: DB-Registry + Discovery sofort neu laden.
  - `GET /health`: Liveness (200 solange der Prozess läuft).
- **`backends.mjs`** — Registry-Loader: liest `tickets.llm_proxy_backends` (über `pg`-freies
  `psql`-Subprocess-Pattern wie `factory_psql`, oder `DATABASE_URL`+`node-postgres` falls im
  Repo bereits vorhanden — der Plan prüft das und folgt dem bestehenden Muster), 30s-Poll.
  Backend-Form: `{ name, kind: 'llamacpp'|'lmstudio'|'openai-remote', baseUrl, apiKeyEnv,
  enabled, priority, fixups, modelAliases }`. API-Keys kommen **ausschließlich aus Env**
  (`DEEPSEEK_API_KEY`, `OPENCODE_API_KEY`) — nie aus der DB.
- **`discovery.mjs`** — probt je Backend `GET /v1/models` (für `kind=lmstudio` zusätzlich
  `/api/v0/models`, um den `loaded`-Status zu nutzen); hält In-Memory-Katalog
  `modelId → [backends nach Priorität]`; markiert Backends nach Fehlprobe als unhealthy
  (Backoff, kein Hard-Remove).
- **Fixups** (aus `fixups` jsonb der Backend-Zeile): benannte, im Proxy implementierte
  Transformationen; initial `bonsai-system-role-fixup` (der `role:"system"`-Mid-Array-Patch des
  bisherigen Ad-hoc-Proxys — Verhalten wird vor Abschaltung des Alt-Proxys aus dessen laufender
  Instanz/Memory-Doku `reference_ternary-bonsai-27b-test-server` übernommen).

Prozess-Management: `task llm:proxy:start|stop|status|logs` in `Taskfile.llm.yml`
(nohup + PID-File unter `~/.local/state/llm-proxy/`, Logs ebenda — gleiches Muster wie
bestehende `llm:`-Tasks).

### 2. Routing-/Fallback-Semantik

1. Request-Modell-ID exakt in Discovery-Katalog → höchstpriores gesundes Backend, das sie anbietet.
2. Sonst: `model_aliases`-Treffer (z. B. `"sonnet" → "ternary-bonsai-27b"`) → wie (1).
3. Sonst (**Verfügbarkeits-Fallback**): erstes entdecktes Modell des höchstprioren gesunden
   Backends; Original-ID wird im Upstream-Request ersetzt, Substitution via Header + Log sichtbar.
4. Kein gesundes Backend → 503 mit strukturiertem JSON-Fehler (`{error:{code:'no_backend'}}`).
   Remote-Backends (DeepSeek, opencode-zen) stehen per Konvention auf niedrigster Priorität —
   kostenpflichtiger letzter Fallback, per GUI umsortierbar.

### 3. DB — Migration `scripts/migrations/2026-07-22-llm-proxy-backends.sql`

Idempotent, beide Brand-Kontexte (Muster: `2026-07-21-provider-config-bonsai-only.sql`):

- `CREATE TABLE IF NOT EXISTS tickets.llm_proxy_backends (…)` + Seed der vier Backends:
  `llamacpp-bonsai` (`http://127.0.0.1:8093/v1`, prio 1, fixups `["bonsai-system-role-fixup"]`),
  `lmstudio` (`http://127.0.0.1:1234/v1`, prio 2), `deepseek` (`https://api.deepseek.com/v1`,
  `api_key_env='DEEPSEEK_API_KEY'`, prio 90), `opencode-zen` (Opencode-Go-Endpoint,
  `api_key_env='OPENCODE_API_KEY'`, prio 91).
- Drift-Korrektur: `UPDATE tickets.provider_config SET base_url='http://127.0.0.1:18235' WHERE
  enabled AND base_url LIKE 'http://127.0.0.1:%'` (deckt `:8093/v1`-Zeilen ab); dito
  `tickets.factory_model_slots`. Remote-URLs (DeepSeek) bleiben unberührt — sie sind disabled
  bzw. laufen künftig über den Proxy nur wenn explizit auf ihn umgestellt.
- `route-provider.sh`: `OPUS_MODEL`/`OPUS_BASE_URL`-Hardcode → `ternary-bonsai-27b`@
  `http://127.0.0.1:18235`.

### 4. Website-API — `website/src/pages/api/admin/llm-proxy/*`

Muster: `/api/admin/ki/providers` (isAdmin-Guard, `json()`, Whitelist-Validierung,
`prerender=false`); DB-Layer `website/src/lib/llm-proxy-db.ts` analog `ki-config-db.ts`.

- `GET/POST /api/admin/llm-proxy/backends` — Liste/Anlage (Whitelist: name, kind, base_url,
  api_key_env, enabled, priority, model_aliases; `fixups` nur aus fester Enum).
- `PUT/DELETE /api/admin/llm-proxy/backends/[id]` — Update/Löschen (letztes enabled lokales
  Backend nicht löschbar — Schutz wie `deleteProvider`).
- `GET /api/admin/llm-proxy/status` — proxied `GET <LLM_PROXY_URL>/admin/state` mit kurzem
  Timeout (1.5s); bei Nichterreichbarkeit `200 { proxy: 'offline', backends: [DB-Stand] }` —
  **offline-tolerant**, denn die Cluster-Website erreicht `127.0.0.1:18235` nicht.
- `POST /api/admin/llm-proxy/reload` — proxied `POST /admin/reload` (nach GUI-Edits).

### 5. GUI

**Steuerung-Tab** (`/admin/pipeline?tab=control`): neues **`LlmProxyPanel.svelte`**
(`website/src/components/factory/`), gerendert in `DevStatusTabs.svelte` innerhalb
`control-extras` neben `FactoryModelSlots`/`KiRoutingPanel`. Inhalt:

- Proxy-Status-Zeile (online/offline, Port, Uptime, Version).
- Backend-Tabelle: Name, Kind, URL, Health (ok/unhealthy/disabled), Priorität (↑↓),
  enabled-Toggle, entdeckte Modelle (aufklappbar, mit loaded-Badge bei LM Studio).
- Aktionen: „Jetzt proben" (reload), Backend anlegen/bearbeiten (Inline-Form nach
  `FactoryModelSlots`-Muster — kein neuer Drawer).
- Effektive Auflösung: pro Factory-Phase (aus `factory_model_slots`/`provider_config`) das
  Modell+Backend, das der Proxy JETZT bedienen würde (inkl. „→ Fallback auf X"-Hinweis).

**Sidekick-Submenü**: neuer Eintrag `llm-proxy` („LLM-Proxy", sub „Backends · Modelle · Routing",
`show: isAdmin`) in `SidekickHome.svelte`; in `PortalSidekick.svelte` View-Union + titleMap +
Lazy-Import-Zweig → neue **`LlmProxyView.svelte`** (`website/src/components/assistant/`):
kompakter Status (online/offline, Backends mit Health-Dot, aktives Modell je Phase),
enabled-Toggles, Reload-Button, Link „Im Steuerung-Tab bearbeiten"
(`/admin/pipeline?tab=control`). **S1-Achtung:** `PortalSidekick.svelte` hat nur ~27 Zeilen
Budget — der neue Zweig muss minimal bleiben (≤12 Zeilen), alle Logik lebt in `LlmProxyView`.

## Fehlerbehandlung

- Proxy erreicht kein Backend → 503 `no_backend` (Clients behalten ihre bestehende
  Cooldown-/Emergency-Logik via `provider_health`).
- Discovery-Fehlprobe → Backend unhealthy + Backoff; Requests routen automatisch am kranken
  Backend vorbei (das IST der dynamische Fallback).
- Status-API offline-tolerant (s.o.); GUI zeigt „Proxy offline — Start: `task llm:proxy:start`".
- DB nicht erreichbar beim Registry-Poll → letzter bekannter Stand bleibt aktiv (Log-Warnung),
  Proxy bleibt funktional.

## Testing

- **BATS `tests/spec/local-llm-proxy.bats`** (RED zuerst): Proxy-Start gegen Mock-Backends
  (zwei `python3 -m http.server`-artige Stub-Server bzw. node-Stubs); Aggregat-`/v1/models`;
  Routing exakte ID; Verfügbarkeits-Fallback bei stale ID; 503 ohne Backends;
  `route-provider.sh` liefert nach Migration `:18235` (kein `:8093` mehr in enabled Zeilen).
- **Vitest `scripts/llm-proxy/server.test.mjs`** (Node-Test gegen Modul-Funktionen):
  Routing-Entscheidung (exakt/Alias/Fallback), Fixup-Anwendung, Header-Setzung.
- **Vitest Website**: `llm-proxy-db.ts` (CRUD-Whitelist), `status.ts` (offline-Pfad → 200).
- Kein Live-Call gegen echte Modelle in CI.

## Bewusst außen vor

- `.opencode/*`-Harness-Modellwahl und `scripts/factory/ci-review.mjs` (wie T002015).
- Kein k8s-Deployment des Proxys (Backends nur host-lokal erreichbar).
- Kein Token-/Kosten-Accounting im Proxy (existiert in `ai-quality`-Sicht bereits).
- Anthropic-`/v1/messages`-Protokoll-Übersetzung: Pass-through ja (LM Studio kann es nativ),
  aktive Übersetzung OpenAI↔Anthropic nein.

## Rollout-Hinweis

Vor `task llm:proxy:start` muss der alte Ad-hoc-Fixup-Proxy auf `:18235` gestoppt werden
(Port-Konflikt). Reihenfolge: Alt-Proxy stoppen → neuen Proxy starten → Migration anwenden →
`route-provider.sh`-Smoke-Test.
