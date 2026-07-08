---
ticket_id: T001590
plan_ref: openspec/changes/local-agent-budget-routing/tasks.md
status: active
date: 2026-07-03
---

# Epic local-agent-orchestration — Design

## Zweck

qwen3.5-9b@iq4_xs (LM Studio auf dem Windows-Host) wird primärer Agent-Provider für
kontextleichte Orchestrierungsarbeit (Factory-Scout, Factory-Plan, Ticket-Triage,
Lavish-HTML-Generierung). Die Concurrency wird über ein Token-Budget-Semaphor gesteuert
(180k Gesamtbudget: 3×60k, 1×120k+1×60k oder 1×180k gleichzeitig). Subagenten laufen im
opencode-Harness. Admins ordnen Agent, Modell und Kontextgröße pro Factory-Komponente
grafisch auf dem Factory Floor zu; factory-unabhängige Orchestrierungs-Settings und die
komplette Provider-Verwaltung ziehen in einen neuen Sidekick-View um.

Grilling-Session: `local-agent-orchestration-grilling-v1` an Ticket T001588 (10 Fragen,
alle beantwortet). Design-Freigabe über Lavish-Board am 2026-07-03.

## Fixierte Entscheidungen (Grilling T001588)

| Thema | Entscheidung |
|---|---|
| Concurrency | Token-Budget-Semaphor: `context_budget=180000` pro Provider, Claims reservieren `context_window` (60k/120k/180k) |
| Budget-Scope | Generisch für alle Provider; `context_budget = NULL` ⇒ unbegrenzt (Cloud-Rows unverändert, dort greift weiter nur `max_concurrent`) |
| Kontextgröße | Admin-Zuordnung pro Komponente (Factory Floor), persistiert in `provider_config.context_window` |
| Routing-Scope | `factory-scout`, `factory-plan`, `ticket-triage`, `lavish-artifact` → local-qwen35 **primär** (prio 1); Cloud als prio-2-Fallback via bestehendem Circuit-Breaker. `factory-implement`/`factory-review` bleiben Cloud |
| Endpoint (SSOT) | Mesh-IP `http://100.102.71.114:1234/v1` (erreichbar aus WSL und Cluster) |
| LM-Studio-Parallelität | Vom User als getestet bestätigt: parallele Requests, 3×60k VRAM-seitig machbar |
| opencode-Spawn | CLI-Wrapper `scripts/agents/opencode-spawn.sh` als Kern + dünner mcp-task-runner-Task |
| Lavish | Delegation mit Review: HTML-Generierung zuerst an lokalen 180k-Subagenten, Claude validiert und übernimmt nur bei Fehlschlag |
| Neue Provider | OpenRouter, opencode Zen (deckt das Opencode-Go-Abo ab — kein eigener Eintrag), Google Gemini, GitHub Models |
| Floor-UI | Badge + Drawer pro Station (KiProviderDrawer-Muster verallgemeinert) |
| Sidekick | Alles-in-Sidekick: Provider-Verwaltung inkl. Keys zieht um; `/admin/ki-konfiguration` wird Redirect |
| Slicing | Epic-Ticket (type=project) + 3 Change-Tickets; Change ① wird zuerst voll durchgeplant |

## Architektur

Kernprinzip: Die bestehende atomare Slot-Claim-Mechanik in `scripts/factory/route-provider.sh`
(`UPDATE tickets.provider_health SET active_agents = active_agents + 1 WHERE active_agents <
max_concurrent`) wird um Token-Arithmetik erweitert — kein neues Locking-System.

```
factory pipeline.js (Scout/Plan) ─┐
dev-flow Skills ──────────────────┼─► route-provider.sh ──► provider = local-qwen35?
lavish Skill (HTML-Generierung) ──┘    Claim: reserved_tokens + ctx <= context_budget
                                       │                      (NULL = unbegrenzt)
                     ┌─────────────────┴──────────────────┐
                     ▼ ja                                  ▼ nein / Circuit-Open
        scripts/agents/opencode-spawn.sh          Cloud-Route (bisheriger Weg,
        opencode run headless @ 60k/120k/180k     anthropic/deepseek/…, prio-Kette)
                     │
                     ▼
        LM Studio Windows-Host (Mesh-IP :1234/v1)
        Release im trap: reserved_tokens -= ctx
```

Beteiligte Bestandsdateien: `tickets.provider_config` / `tickets.provider_health`
(Schema-SSOT `website/src/lib/schema/provider-config-schema.ts`), drei parallele
Routing-Implementierungen (`website/src/lib/provider-config.ts`,
`scripts/factory/provider-router.js`, `scripts/factory/route-provider.sh` — zusätzlich
inline-kopiert in `scripts/factory/pipeline.js` `routeProviderSync()`), Katalog-SSOT
`website/src/lib/ki-catalog.ts`, Service-Registry `website/src/lib/ki-services.ts`.

## Change ① — `local-agent-budget-routing` (Backend)

- **Migration** `scripts/migrations/2026-07-03-context-budget.sql` + idempotentes DDL in
  `provider-config-schema.ts`: `provider_config.context_window int` (pro Row),
  `provider_config.context_budget int NULL` (pro Provider),
  `provider_health.reserved_tokens int NOT NULL DEFAULT 0`.
- **Claim/Release** in `route-provider.sh`: Claim reserviert `context_window` Tokens
  (Guard: `context_budget IS NULL OR reserved_tokens + ctx <= context_budget`), Release
  gibt sie frei. Paritäts-Update in `provider-router.js isUsable()` und
  `provider-config.ts` sowie im Inline-Klon in `pipeline.js`. Ein **Paritäts-BATS-Test**
  prüft alle Implementierungen gegen dieselben Fixtures.
- **Katalog** `ki-catalog.ts`: neuer Eintrag `local-qwen35` (defaultBaseUrl Mesh-IP,
  suggestedModels `qwen3.5-9b@iq4_xs`, kein Key) sowie `openrouter`, `opencode-zen`,
  `google-gemini`, `github-models` mit `apiKeyEnv`. `environments/schema.yaml` +=
  `OPENROUTER_API_KEY`, `OPENCODE_API_KEY`, `GEMINI_API_KEY`, `GITHUB_MODELS_TOKEN`.
- **Seeds**: prio-1-Rows `local-qwen35` für die Sources `factory-scout`, `factory-plan`,
  `ticket-triage` und die neue Source `lavish-artifact` (Registrierung in
  `ki-services.ts`); Default `context_window=60000`, `context_budget=180000`. Bestehende
  Cloud-Rows dieser Sources rutschen auf prio 2 (Fallback).

## Change ② — `opencode-agent-harness` (Spawn + Lavish)

- **Spawn-Wrapper** `scripts/agents/opencode-spawn.sh`: Slot-Claim via
  `route-provider.sh` → `opencode run` headless (Modell, Prompt-Datei,
  Arbeitsverzeichnis, Kontextklasse) → Release via `trap` (auch bei Crash/Timeout).
  Timeout pro Kontextklasse: 60k → 15 min, 120k → 30 min, 180k → 45 min (hebt das
  15-min-Limit aus `.opencode/plugins/background-agents.ts` für große Läufe an).
- **mcp-task-runner-Anbindung**: dünner Task `agent:spawn-local` über den Wrapper.
- **Factory-Anbindung**: liefert die Route für Scout/Plan `provider=local-qwen35`, führt
  `pipeline.js` die Phase über den Spawn-Wrapper aus statt über einen Claude-Subagenten.
- **Lavish-Delegation mit Review**: `lavish/SKILL.md` bekommt einen vorgelagerten
  Schritt — HTML-Generierung zuerst an einen 180k-opencode-Subagenten delegieren; Claude
  validiert (Datei vorhanden, parsebares HTML, keine error-severity layout_warnings nach
  dem Öffnen) und generiert nur bei Fehlschlag selbst. Fehlschlag = Timeout, invalides
  oder leeres HTML, error-layout_warnings.

## Change ③ — `factory-floor-agent-ui` (Floor + Sidekick)

- **Factory Floor**: Stationen (aus `PHASE_ORDER` in
  `website/src/lib/factory-floor-types.ts`) mit Agent-Bedarf zeigen ein Badge
  „Provider/Modell/ctx"; Klick öffnet einen aus `KiProviderDrawer.svelte`
  verallgemeinerten `AgentAssignDrawer` (Provider → Modell → Kontextgröße 60k/120k/180k →
  Priorität), der `provider_config`-Rows der Station-Source schreibt.
- **Sidekick-View `agent-settings`** (admin-only): View-Union in
  `PortalSidekick.svelte` + Eintrag in `SidekickHome.svelte` + `sidekick-nudge.ts`.
  Inhalt: komplette Provider-Verwaltung (Liste, Drawer, Keys — umgezogen von
  `/admin/ki-konfiguration`) plus Orchestrierungs-Globals (`context_budget`,
  Default-Kontextgrößen, opencode-Harness an/aus, Lavish-Delegationsregel,
  Kill-Switch-Status). Globals persistieren als Keys in `tickets.factory_control`.
- **`/admin/ki-konfiguration`** wird dünner Redirect auf den Sidekick-View. Die
  bestehenden `/api/admin/ki/*`-Endpoints bleiben und werden wiederverwendet.

## Fehlerbehandlung

- **Leakende Reservierungen**: Release im `trap` des Spawn-Wrappers; zusätzlich setzt der
  Dispatcher-Watchdog-Sweep `reserved_tokens` verwaister Claims zurück (Muster existiert
  für `active_agents`).
- **Lokaler Provider down/überlastet**: bestehender Circuit-Breaker
  (`FAILURE_THRESHOLD=3`, `COOLDOWN_MINUTES=10`) demotet automatisch auf die
  prio-2-Cloud-Route.
- **Lavish-Delegation schlägt fehl**: hartes Review-Gate, Claude generiert selbst —
  Funktionalität degradiert nie, nur die Kostenersparnis entfällt.

## Tests

- Paritäts-BATS-Test der drei Routing-Implementierungen (Change ①, `tests/spec/`).
- BATS-Tests für Claim/Release-Arithmetik inkl. Budget-Grenzfälle (2×120k > 180k wird
  abgelehnt; NULL-Budget erlaubt unbegrenzt).
- Spawn-Wrapper-Test mit Fake-`opencode`-Binary (Timeout, trap-Release).
- Playwright-Tests für Floor-Badge/Drawer und Sidekick-View (Change ③).

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Drift der 3+1 Routing-Implementierungen (ts/js/bash + pipeline-Inline-Klon) | Paritäts-BATS-Test als fester Bestandteil von Change ① |
| 9B-Qualität für anspruchsvolle Aufgaben | implement/review bleiben Cloud; Lavish-Review-Gate; Circuit-Breaker |
| opencode-Timeout bei großen Kontexten | Timeout-Staffelung 15/30/45 min pro Kontextklasse |
| VRAM-Überlastung des Windows-Hosts | Budget-Semaphor begrenzt Gesamtkontext auf 180k; LM-Studio-Parallelität vom User als getestet bestätigt |
