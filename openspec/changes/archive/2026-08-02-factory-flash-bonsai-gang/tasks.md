---
title: "factory-flash-bonsai-gang — Implementation Plan"
ticket_id: T002128
domains: [factory, llm, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-flash-bonsai-gang — Implementation Plan

_Ticket: T002128 · Design: `openspec/changes/factory-flash-bonsai-gang/design.md` · Partial-Modus (T002074)_

Stage-Auto-Tick (D1, supersedet T002102-p3) + opt-in opencode-Executor: Orchestrator auf
`opencode-go/deepseek-v4-flash` dispatcht bis zu 4 `bonsai-8b`-Subagents auf disjunkte
Partials (D3 opt-in via `FACTORY_EXECUTOR`); Gang-Konfiguration wird Repo-Kanon inkl.
Q2_0-Modell-ID-Fix (D5); llm-proxy erhält DB-gesteuertes per-Backend-`max_inflight`
(D4, Default 1 = heutiges Verhalten). Entscheidungen D1–D5 User-bestätigt (Lavish,
2026-07-23). Details je Partial in `tasks.d/`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1-stage-auto-tick | tasks.d/p1-stage-auto-tick.md | impl | scripts/vda/ticket/stage-plan.sh, openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md | |
| p2-opencode-executor | tasks.d/p2-opencode-executor.md | impl | scripts/factory/dispatcher-bridge.sh, scripts/factory/opencode-exec.sh | |
| p3-opencode-canon | tasks.d/p3-opencode-canon.md | impl | .opencode/agent-models.jsonc, .opencode/prompts/orchestrator.md, AGENTS.md | |
| p4-llmproxy-inflight | tasks.d/p4-llmproxy-inflight.md | impl | scripts/llm-proxy/server.mjs, scripts/llm-proxy/backends.mjs, scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql | |
| p5-tests | tasks.d/p5-tests.md | tests | tests/spec/software-factory.bats, website/src/data/test-inventory.json | p1-stage-auto-tick, p2-opencode-executor, p3-opencode-canon, p4-llmproxy-inflight |

## File Structure

```
scripts/vda/ticket/stage-plan.sh                               (mod — idempotenter force-tick-requested-Upsert + best-effort factory.service-Start, non-fatal)
openspec/changes/unified-llm-gateway/tasks.d/p3-factory-wake.md (mod — Supersede-Hinweis-Block: Task 1/4/5 durch T002128-p1 abgelöst)
scripts/factory/dispatcher-bridge.sh                           (mod — FACTORY_EXECUTOR-Verzweigung; claude-Zweig byte-identisch)
scripts/factory/opencode-exec.sh                               (neu — Orchestrator-Prompt-Bau, opencode run --agent orchestrator, Phase-Event-Telemetrie, kein claude-Fallback)
.opencode/agent-models.jsonc                                   (mod — orchestrator + bonsai-8b-4 in den Kanon; Modell-ID TQ2_0→Q2_0; Kommentar-Drift)
.opencode/prompts/orchestrator.md                              (neu — Orchestrator-Systemprompt: Gang-Dispatch, /admin/state-Gating, Eskalation deepseek-helper)
AGENTS.md                                                      (mod — Parallelitäts-Aussage auf Ist-Zustand: -np 1, max_inflight-konfigurierbar)
scripts/llm-proxy/server.mjs                                   (mod — per-Backend-Semaphor bis max_inflight, FIFO-Dequeue erhalten; /admin/state um inflight/max_inflight)
scripts/llm-proxy/backends.mjs                                 (mod — max_inflight im Registry-SELECT + Backend-Objekt)
scripts/migrations/2026-07-23-llm-proxy-max-inflight.sql       (neu — ADD COLUMN max_inflight integer NOT NULL DEFAULT 1, idempotent)
tests/spec/software-factory.bats                               (mod — FA-SF-Tests: Stage-Flag, Executor-Verzweigung, Telemetrie, max_inflight; RED zuerst)
website/src/data/test-inventory.json                           (regeneriert — task test:inventory)
```

## S1-Zeilenbudgets (wirksame Schwelle je Datei, unbaselined ⇒ Extension-Limit)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/vda/ticket/stage-plan.sh` | 58 | 442 |
| `scripts/factory/dispatcher-bridge.sh` | 135 | 365 |
| `scripts/factory/opencode-exec.sh` | 0 (neu) | 500 |
| `scripts/llm-proxy/server.mjs` | 169 | 331 |
| `scripts/llm-proxy/backends.mjs` | 50 | 450 |

`.jsonc`/`.md`/`.sql`/`.bats`/`.json` sind S1-ungated — Diffs trotzdem minimal-invasiv halten.

## Verify (final, nach allen Partials)

- [ ] **Finale Verifikation (STRUCT3).** Alle Partials umgesetzt, p5-Tests GREEN
      (der STRUCT2-Failing-Test-Step mit `expected: FAIL` liegt in
      `tasks.d/p5-tests.md` — RED vor p1–p4, GREEN danach). Danach die drei
      Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] **Sync-Smoke.** `bash scripts/opencode-sync-agents.sh` ausführen und
      verifizieren, dass die globale opencode-Config orchestrator + bonsai-8b-1..4
      enthält (REQ-SF-OPENCODE-CANON-001-Scenario).

- [ ] **Stage-Tick-Smoke.** Auf einem Wegwerf-Ticket `stage-plan` ausführen und
      `tickets.factory_control` auf `force-tick-requested` prüfen (danach Flag
      aufräumen), plus `wakeup.sh`-Konsum im nächsten Tick beobachten.
