# Proposal: unified-llm-gateway

## Why

Der lokale LLM-Verkehr des agentischen SDLC läuft heute über **drei divergierende Routing-Wahrheiten**:

1. Der äußere Factory-Orchestrator (`claude -p` je Ticket) spricht `:18235` — bedient vom **alten,
   nicht versionierten Python-Fixup-Proxy** (`bonsai-msg-fixup-proxy.service`, blinder
   Single-Backend-Forward auf `:8093`, kein Health-Check, kein Failover).
2. Die Phase-Agents (`scripts/factory/pipeline.mjs`, ~25 Call-Sites) umgehen `:18235` komplett —
   hartkodiert `http://127.0.0.1:1234` (LM Studio, `qwythos-9b-v2`): **Split-Brain** innerhalb
   eines Pipeline-Laufs.
3. Die DB (`tickets.provider_config`, `tickets.factory_model_slots`) zeigt auf `:18235`, wird aber
   von `scripts/factory/provider-register-bonsai.sh` bei jedem idempotenten Lauf auf `:8093`
   **zurückgedreht** (strukturelle Re-Drift-Quelle).

Der in T002081 gebaute Node-Proxy (`scripts/llm-proxy/`, health-checked Multi-Backend-Routing,
DB-Registry `tickets.llm_proxy_backends` — bereits geseedet) wurde **nie in Betrieb genommen**
(Task-8-Rollout unchecked, kein systemd-Unit, `~/.local/state/llm-proxy/` existiert nicht).
Seine Fixups sind unvollständig: Fix 2 (Billing-Header-Cache-Normalisierung) fehlt, Fix 1 weicht
byte-weise ab (`[system] `-Präfix), Reasoning-Metrics fehlen — ein selbst-dokumentierter
Cutover-Blocker (`fixups.mjs` Header-Kommentar).

Weitere Folgen des abgebrochenen Rollouts: `openspec/specs/software-factory.md` (verlangt `:8093`)
widerspricht `openspec/specs/local-llm-proxy.md` (verlangt proxy-only). Die Modell-ID
`ternary-bonsai-27b` ist überall stale (real geladen: Bonsai-8B). `stage-plan.sh` weckt die
Factory nicht (Force-Tick-Flag ist Write-only-Telemetrie; bis ~5,5 min Wartezeit). Ein toter
Endpoint verbrennt einen Gang-Slot für bis zu 30 min, weil kein Pre-Dispatch-Health-Gate existiert.
Andere Harnesse lernen den Gateway nicht: AGENTS.md dokumentiert `:8093`,
`.opencode/agent-models.jsonc` geht direkt auf `:8093`, agent-guide-Maps/mcp-tool-guide haben
null Coverage.

## What

**Ein** health-überwachtes Gateway auf `:18235` (Node-Proxy), von allen Schichten genutzt,
mit strukturellen Anti-Staleness-Garantien (Entscheidungen D1–D9, Detail in `design.md`):

- **Fixup-Parität + Cutover (D1–D3):** Fix 1 byte-exakt (Präfix entfernen), Fix 2 portieren,
  Reasoning-Metrics light (gleiches JSONL-Schema, `estimated:true`); Golden-Diff-Tests;
  `llm-proxy.service` (systemd user, Restart=on-failure) + `task llm:proxy:install`;
  `scripts/llm-proxy/cutover.sh` mit Quiesce-Check, Stop+Disable des Alt-Units, Smoke-Tests
  (beide Request-Shapes) und Rollback-Pfad.
- **Health-Goals (D4):** `GET /healthz` aggregiert (200 nur wenn ≥1 Backend healthy; meldet
  Registry-Poll-Alter); Pre-Dispatch-Gate in `dispatcher-bridge.sh` vor `budget-guard.sh`
  (toter Gateway ⇒ skip ohne Slot-Burn); statischer Config-Lint (fail-closed, CI) gegen
  `:8093`/`:1234`-Literale in Config-Surfaces; DB-Anti-Drift-BATS (skip-guarded).
- **Modell-ID-Reconciliation (D5):** logische ID `ternary-bonsai` (Migration
  `factory_model_slots` + `provider_config` + `autopilot.env` + `route-provider.sh`);
  Registry-Wildcard-Alias `"ternary-bonsai": "*"` am Bonsai-Backend; `resolveModel` strict
  (unbekannte ID ⇒ 404 statt Silent-Any-Model; Loose-Modus per `LLM_PROXY_LOOSE_FALLBACK=1`).
- **Factory-Wake (D6):** `stage-plan.sh` setzt Force-Tick-Flag und startet `factory.service`
  fire-and-forget; `factory-forcetick.timer` (30s-Poller) macht den Admin-Force-Tick-Button real.
- **Split-Brain-Fix (D7):** `pipeline.mjs` `FACTORY_MODEL` env-getrieben
  (`FACTORY_LLM_BASE_URL`/`FACTORY_LLM_MODEL`, Default Gateway); `route-provider.sh`
  Emergency-Fallback auf Gateway; `provider-register-bonsai.sh` schreibt `:18235` + logische ID.
- **Awareness (D8):** AGENTS.md, `.opencode/agent-models.jsonc`, mcp-tool-guide,
  agent-guide-Registry (+ Map-Regen), `bonsai-server-windows.md`; Spec-Deltas gegen
  `local-llm-proxy` **und** `software-factory` (Widerspruch aufgelöst).
- **Kein Leak / keine Distraction (D9):** Remote-API-Keys nur im Gateway-Env (`api_key_env`);
  Registry-Poll-Staleness sichtbar; test-inventory-konforme Test-IDs für `local-llm-proxy.bats`.

**Out of scope:** das In-Cluster-LLM-System der Website (`llm-gateway-lmstudio` k8s-Service,
wg-gpu) — architektonisch getrennt, bleibt unberührt.

_Ticket: T002102_
