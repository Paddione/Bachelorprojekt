---
ticket_id: T002102
plan_ref: openspec/changes/unified-llm-gateway/tasks.md
status: active
date: 2026-07-23
---

# unified-llm-gateway — Design-Spec

_Ticket: T002102 · Brainstorm-Board: `.lavish/unified-llm-gateway-brainstorm.html` · Recon: 5-Agent-Workflow (2026-07-23)_

## Kontext / Ist-Zustand (verifiziert)

| Schicht | Route heute | Beleg |
|---|---|---|
| Äußerer Orchestrator (`claude -p`) | `~/.config/factory/autopilot.env` → `ANTHROPIC_BASE_URL=http://localhost:18235` → **alter** Python-Proxy (`bonsai-msg-fixup-proxy.service`, systemd user, PID 396) → blind auf `http://127.0.0.1:8093` (Windows llama-server, Bonsai-8B) | `scripts/factory/wakeup.sh:33-38` sourced env |
| Phase-Agents | `scripts/factory/pipeline.mjs:16-24` hartkodiert `FACTORY_MODEL = {provider:'lmstudio', modelId:'qwythos-9b-v2', baseUrl:'http://127.0.0.1:1234'}` — **umgeht 18235** | ~25 Call-Sites `{model: FACTORY_MODEL}` |
| DB-Routing | `route-provider.sh` (nur noch auto-triage/scout-fallback/mcp-go): opus-Tier hartkodiert `ternary-bonsai-27b@:18235`; Emergency-Fallback `qwythos-9b-v2@:1234`. DB-Rows zeigen `:18235`, Modell-ID stale `ternary-bonsai-27b` | `route-provider.sh:22-26,76-77` |
| Re-Drift-Quelle | `scripts/factory/provider-register-bonsai.sh` schreibt bei jedem Lauf `http://127.0.0.1:8093/v1` in `provider_config` + `factory_model_slots` | idempotentes ON CONFLICT |
| Neuer Proxy | `scripts/llm-proxy/` (T002081): nie gestartet; kein systemd-Unit; `~/.local/state/llm-proxy/` existiert nicht. Registry `tickets.llm_proxy_backends` **existiert und ist geseedet**: llamacpp-bonsai `:8093/v1` prio 1, lmstudio `:1234/v1` prio 2, deepseek prio 90, opencode-zen prio 91 | DB-Check 2026-07-23 |
| Factory-Wake | `stage-plan.sh` = reiner DB-Write. Force-Tick-Flag (`tickets.factory_control`) wird von `wakeup.sh:70-83` nur gelesen/geloggt/gelöscht — beschleunigt nichts. `factory.timer`: OnBootSec=2min, OnUnitInactiveSec=5min | Recon factory-flow |
| Health | Kein Pre-Dispatch-Gate. Toter Endpoint ⇒ `claude -p` stirbt, Ticket bleibt `in_progress`, Watchdog resetted erst nach 30 min (`watchdog.sh:20-51`) — Gang-Slot brennt (FACTORY_GLOBAL_CAP=1) | Recon factory-flow |

### Fixup-Verhalten Alt-Proxy (`~/.config/factory/qwythos-msg-fixup-proxy.py`) — Paritäts-Referenz

- **Fix 1 (system-role):** `messages[i].role=="system"` mit `i>0` ⇒ `role:"user"`, Content **byte-unverändert** (KEIN Präfix).
- **Fix 2 (billing-header, 2026-07-21):** Anthropic-Shape `system`-Feld (Block-Liste): matcht `system[0].text` auf `^x-anthropic-billing-header:.*$` ⇒ ersetze durch Konstante `"x-anthropic-billing-header: (normalized-for-cache);"` (llama.cpp-Prompt-Cache-Schutz).
- **Reasoning-Metrics:** Response-Beobachter, extrahiert Reasoning/Thinking (Anthropic+OpenAI, streaming+non-streaming), Token-Zählung via Upstream-`POST /tokenize` (Fallback chars/3.5), JSONL-Append `~/.config/factory/reasoning-metrics.jsonl` (`ts, path, reasoning_tokens, estimated, budget, capped, duration_s`), Budget aus `REASONING_BUDGET` (Unit setzt 4096).

**Divergenzen im neuen `fixups.mjs`:** Fix 1 fügt `[system] `-Präfix hinzu (falsch), Fix 2 fehlt komplett, Reasoning-Metrics fehlen. Header-Kommentar in `fixups.mjs` verlangt Verifikation gegen die Live-Instanz vor Cutover.

## Entscheidungen

### D1 — Ein Gateway: Node-Proxy übernimmt :18235
Alt-Unit `bonsai-msg-fixup-proxy.service` wird gestoppt + disabled (Datei bleibt auf dem Host als Rollback). Der Node-Proxy ist die einzige Instanz auf `:18235`. In-Cluster-Website-LLM (k8s `llm-gateway-lmstudio`) bleibt unberührt (separates System).

### D2 — Fixup-Parität, bewiesen durch Golden-Diff-Tests
- `fixups.mjs` Fix 1: `[system] `-Präfix **entfernen** — role-Rewrite only, Content byte-identisch zum Alt-Proxy.
- `fixups.mjs` Fix 2 neu: `billing-header-cache-fixup` — exakt die Regex/Konstante des Alt-Proxys, operiert auf Anthropic-Shape `body.system[0].text`.
- Reasoning-Metrics **light**: Response-Observer in `server.mjs` (nur non-streaming Bodies + SSE-Sammelpuffer), Extraktion beider Shapes, Token-Schätzung **nur** chars/3.5 (`estimated:true` immer), gleiches JSONL-Schema + Pfad (`~/.config/factory/reasoning-metrics.jsonl`), `REASONING_BUDGET` env (Default 8192). Kein `/tokenize`-Roundtrip (bewusste Vereinfachung).
- Tests: Fixture-basierte Golden-Tests in `server.test.mjs` bzw. `tests/spec/local-llm-proxy.bats` — identische Payloads (OpenAI-Shape mit mid-array system; Anthropic-Shape mit billing-header) durch `applyFixups` ⇒ Ergebnis byte-identisch zur dokumentierten Alt-Proxy-Transformation (Fixtures aus obiger Paritäts-Referenz abgeleitet).

### D3 — Supervision + Cutover
- Neu `scripts/llm-proxy/llm-proxy.service` (systemd **user** unit): `ExecStart=node <repo>/scripts/llm-proxy/server.mjs`, `Restart=on-failure`, `RestartSec=2`, `WantedBy=default.target`, Env-File optional `~/.config/llm-proxy/env`.
- `task llm:proxy:install`: kopiert Unit nach `~/.config/systemd/user/`, `daemon-reload`, `enable`. `llm:proxy:start|stop` bevorzugen systemd wenn Unit installiert, sonst nohup-Fallback (bestehendes Verhalten).
- Neu `scripts/llm-proxy/cutover.sh`: (1) Quiesce-Check — kein laufender factory-Tick (`systemctl --user is-active factory.service` ≠ active, sonst Abbruch), (2) Parity-Preflight — `node --test scripts/llm-proxy/` grün, (3) `systemctl --user disable --now bonsai-msg-fixup-proxy.service`, (4) `task llm:proxy:install && systemctl --user start llm-proxy.service`, (5) Smoke: `/healthz` 200, `/v1/models` non-empty, je 1 Completion beider Request-Shapes, (6) bei Fehler: Rollback (llm-proxy stop, Alt-Unit re-enable+start), Exit ≠ 0. Idempotent.

### D4 — Health-Goals (drei Ebenen)
1. **Gateway:** Neu `GET /healthz` — 200 nur wenn ≥1 Backend healthy, Body `{healthy_backends, total_backends, registry_poll_age_s, degraded}`; 503 sonst. `/health` bleibt Liveness (Abwärtskompatibilität). Registry-Poll-Fehler ⇒ `degraded:true` in `/healthz` + `/admin/state` (Staleness sichtbar statt silent).
2. **Factory:** `dispatcher-bridge.sh` — vor `budget-guard.sh` im Per-Ticket-Loop: `curl -sf --max-time 3 "$GATEWAY/healthz"`; Fehler ⇒ Log-Zeile + `continue` (Ticket unberührt, kein Slot-Burn). Gateway-URL aus `ANTHROPIC_BASE_URL` (Default `http://localhost:18235`).
3. **CI (fail-closed):** Config-Lint-BATS: kein `:8093`- oder `127.0.0.1:1234`-Literal in den Gateway-Consumer-Surfaces (`.opencode/agent-models.jsonc`, `scripts/factory/provider-register-bonsai.sh`, `scripts/factory/route-provider.sh`, `scripts/factory/pipeline.mjs`, `AGENTS.md`-Zeile zum bonsai-Subagent) — Ausnahme: `tickets.llm_proxy_backends`-Seeds/Migrationen (dort gehören Backend-URLs hin) und explizit markierte Backend-Doku. DB-Anti-Drift-BATS (skip-guarded via bestehendem DB-Reachability-Pattern): keine enabled `provider_config`/`factory_model_slots`-Row mit `:8093`/`:1234` direkt.

### D5 — Modell-ID-Reconciliation (logische ID + Wildcard-Alias)
- Logische ID **`ternary-bonsai`** ersetzt `ternary-bonsai-27b` in: SQL-Migration (`factory_model_slots.model_id`, `provider_config.model_id` + `provider`-Spalte wo `ternary-bonsai-27b`), `route-provider.sh` (opus-Hardcode), `provider-register-bonsai.sh`, `autopilot.env` (Host-Datei — Cutover-Schritt, dokumentiert in cutover.sh-Output). 
- Registry: `UPDATE tickets.llm_proxy_backends SET model_aliases = jsonb '{"ternary-bonsai":"*"}'` für llamacpp-bonsai. `"*"` = „erstes verfügbares Modell dieses Backends" — explizites Opt-in statt globalem Silent-Fallback.
- `discovery.mjs` `resolveModel`: Schritt 2 versteht Wildcard-Alias (`"*"` ⇒ erstes `models[0]` des Backends). Schritt 3 (globaler Any-Model-Fallback) nur noch wenn `LLM_PROXY_LOOSE_FALLBACK=1`; Default: `null`-analoges Verhalten ⇒ Server antwortet 404 `unknown_model` (unterscheidbar von 503 `no_backend`).

### D6 — Factory-Wake
- `stage-plan.sh` nach den DB-Writes: (a) Force-Tick-Flag-Upsert (`tickets.factory_control`, wie `force-tick.ts` writeControl), (b) `systemctl --user start factory.service 2>/dev/null || true` (fire-and-forget; non-fatal ohne systemd). 
- Neu `scripts/factory/factory-forcetick.timer` + `.service` (30s, `OnUnitActiveSec`): Oneshot-Skript prüft Flag per `factory_psql` (1 SELECT), bei gesetztem Flag `systemctl --user start factory.service`. Install analog zu bestehenden factory-Units. Damit wirkt der Admin-Button (Website-Pod kann kein systemctl) in ≤30 s.
- `wakeup.sh` Flag-Konsum bleibt (Audit-Log) — Flag wird dort weiterhin gelöscht.

### D7 — Split-Brain-Fix (ein Egress)
- `pipeline.mjs`: `FACTORY_MODEL` liest `process.env.FACTORY_LLM_BASE_URL` (Default `http://127.0.0.1:18235`), `FACTORY_LLM_MODEL` (Default `ternary-bonsai`), `FACTORY_LLM_PROVIDER` (Default `llamacpp`). Minimaler Diff (nur die Konstanten-Definition; Call-Sites unverändert).
- `route-provider.sh`: opus-Hardcode + Emergency-Fallback beide auf `ternary-bonsai@http://127.0.0.1:18235`.
- `autopilot.env` (Host): ergänzt `FACTORY_LLM_BASE_URL`/`FACTORY_LLM_MODEL` — dokumentiert im Cutover-Runbook (cutover.sh druckt Checkliste; Datei ist nicht repo-tracked).

### D8 — Awareness-Surfaces (andere Agenten)
- `AGENTS.md`: bonsai-Subagent-Abschnitt → Gateway `:18235`; neuer Kurzabschnitt „LLM-Gateway" (ein Endpoint, `/healthz`, `task llm:proxy:status`).
- `.opencode/agent-models.jsonc`: `llama-bonsai-server.baseURL` → `http://127.0.0.1:18235/v1`; Modell-ID → `ternary-bonsai` (Alias löst auf).
- `.claude/skills/references/mcp-tool-guide.md`: Abschnitt „LLM-Gateway (Port 18235)" — wann Gateway vs. direkte Backend-Ports (nie), Health-Kommandos.
- `docs/agent-guide/registry/tools.yaml` (+ ggf. `goals.yaml`): Gateway-Eintrag; danach `task agent-guide:maps` regenerieren.
- `.claude/skills/llama-cpp/references/bonsai-server-windows.md`: `:8093` als Backend-intern markieren, Gateway als Konsumenten-Endpoint.
- Globale `~/.config/opencode/opencode.jsonc`: Modell-ID auf `ternary-bonsai` — Host-Datei, Cutover-Runbook-Punkt (nicht repo-tracked).

### D9 — Kein Leak / keine Distraction
- Remote-Backends (deepseek, opencode-zen): API-Keys ausschließlich via `api_key_env` im Gateway-Prozess-Env — Factory-/Agent-Prompts tragen keine Keys; `autopilot.env` behält Dummy-Token.
- `tests/spec/local-llm-proxy.bats`: Test-Titel auf inventar-konforme IDs (`FA-LLMPROXY-1` …) umbenennen, damit `build-test-inventory.sh` sie erfasst; `task test:inventory` + Commit.

## Ziel-Informationsfluss

```
stage-plan.sh ─DB─▶ plan_staged ─▶ Flag + systemctl start factory.service (D6)
factory.timer / factory-forcetick.timer ─▶ wakeup.sh (autopilot.env: EIN Endpoint)
  ─▶ factory-prep ─▶ dispatcher-bridge.sh ─▶ /healthz-Gate (D4) ─▶ claude -p
       └▶ pipeline.mjs-Phasen (D7) ──┐
claude -p (Orchestrator) ────────────┤ beide → :18235
opencode (global + agent-models) ────┤
agy/andere (via AGENTS.md-Doku) ─────┘
  ─▶ llm-proxy.service (D1/D3, Registry tickets.llm_proxy_backends, Probe 30s, Alias ternary-bonsai→*)
       ─▶ :8093 Bonsai │ :1234 LM Studio │ deepseek │ opencode-zen (Keys nur hier, D9)
```

## Risiken & Rollback

| Risiko | Mitigation |
|---|---|
| Fixup-Divergenz bricht Bonsai-Tuning | Golden-Diff-Tests vor Cutover (D2); cutover.sh Preflight |
| Port-Race 18235 | cutover.sh erzwingt Stop+Disable vor Start; `llm:proxy:start` prüft fremden Listener |
| Cutover bricht laufenden Tick | Quiesce-Check in cutover.sh |
| Gateway down nach Cutover | systemd Restart=on-failure; Rollback-Pfad re-enabled Alt-Unit |
| Re-Drift durch Register-Skript | provider-register-bonsai.sh schreibt :18235 + Config-Lint-BATS fail-closed |
| DB nicht erreichbar (Registry-Poll) | last-known-good Cache + `degraded`-Flag sichtbar in /healthz (D4) |
