---
title: "unified-llm-gateway — Implementation Plan"
ticket_id: T002102
domains: [factory, llm, infra, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# unified-llm-gateway — Implementation Plan

_Ticket: T002102 · Design: `openspec/changes/unified-llm-gateway/design.md` · Partial-Modus (T002074)_

EIN health-überwachtes Gateway (`scripts/llm-proxy/`, Port 18235) für alle lokalen LLM-Backends:
Fixup-Parität + Cutover vom Alt-Proxy (D1–D3), Health-Goals auf drei Ebenen (D4), Modell-ID-
Reconciliation `ternary-bonsai` (D5), Factory-Wake-Wiring (D6), Split-Brain-Fix `pipeline.mjs`
(D7), Awareness-Surfaces für alle Harnesse (D8), Leak-/Staleness-Härtung (D9).
Details je Partial in `tasks.d/`.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1-proxy-core | tasks.d/p1-proxy-core.md | impl | scripts/llm-proxy/fixups.mjs, scripts/llm-proxy/discovery.mjs, scripts/llm-proxy/server.mjs, scripts/llm-proxy/backends.mjs | |
| p2-host-rollout | tasks.d/p2-host-rollout.md | impl | scripts/llm-proxy/llm-proxy.service, scripts/llm-proxy/cutover.sh, Taskfile.llm.yml, scripts/factory/provider-register-bonsai.sh, scripts/factory/route-provider.sh, scripts/migrations/2026-07-23-unified-llm-gateway.sql | p1-proxy-core |
| p3-factory-wake | tasks.d/p3-factory-wake.md | impl | scripts/vda/ticket/stage-plan.sh, scripts/factory/dispatcher-bridge.sh, scripts/factory/pipeline.mjs, scripts/factory/factory-forcetick.service, scripts/factory/factory-forcetick.timer, scripts/factory/forcetick-poll.sh | |
| p4-docs-surfaces | tasks.d/p4-docs-surfaces.md | impl | AGENTS.md, .opencode/agent-models.jsonc, .claude/skills/references/mcp-tool-guide.md, .claude/skills/llama-cpp/references/bonsai-server-windows.md, docs/agent-guide/registry/tools.yaml | |
| p5-tests | tasks.d/p5-tests.md | tests | scripts/llm-proxy/server.test.mjs, tests/spec/local-llm-proxy.bats, tests/spec/software-factory.bats, website/src/data/test-inventory.json | |

## File Structure

```
scripts/llm-proxy/fixups.mjs                                   (mod — Fix 1 byte-exakt, Fix 2 billing-header neu)
scripts/llm-proxy/discovery.mjs                                (mod — Wildcard-Alias, strict resolveModel)
scripts/llm-proxy/server.mjs                                   (mod — /healthz, Reasoning-Metrics light, 404 unknown_model)
scripts/llm-proxy/backends.mjs                                 (mod — degraded-Flag bei Registry-Poll-Fehlern)
scripts/llm-proxy/server.test.mjs                              (mod — Golden-Parity-Fixtures, strict-Mode-Tests)
scripts/llm-proxy/llm-proxy.service                            (neu — systemd user unit, Restart=on-failure)
scripts/llm-proxy/cutover.sh                                   (neu — Quiesce, Stop+Disable Alt-Unit, Smoke, Rollback)
Taskfile.llm.yml                                               (mod — llm:proxy:install, systemd-Präferenz, Port-Guard)
scripts/factory/provider-register-bonsai.sh                    (mod — :18235 + ternary-bonsai, Re-Drift-Quelle tot)
scripts/factory/route-provider.sh                              (mod — opus-Hardcode + Emergency-Fallback → Gateway)
scripts/migrations/2026-07-23-unified-llm-gateway.sql          (neu — Modell-ID-Rename + Registry-Alias)
scripts/vda/ticket/stage-plan.sh                               (mod — Force-Tick-Flag + systemctl start factory.service)
scripts/factory/dispatcher-bridge.sh                           (mod — Pre-Dispatch /healthz-Gate vor budget-guard)
scripts/factory/pipeline.mjs                                   (mod — FACTORY_MODEL env-getrieben, minimal-Diff)
scripts/factory/factory-forcetick.service                      (neu — Oneshot-Flag-Poller)
scripts/factory/factory-forcetick.timer                        (neu — 30s-Timer)
scripts/factory/forcetick-poll.sh                              (neu — Flag-Check → systemctl start factory.service)
AGENTS.md                                                      (mod — bonsai-Subagent → Gateway; LLM-Gateway-Abschnitt)
.opencode/agent-models.jsonc                                   (mod — llama-bonsai-server → :18235/v1, ternary-bonsai)
.claude/skills/references/mcp-tool-guide.md                    (mod — LLM-Gateway-Abschnitt)
.claude/skills/llama-cpp/references/bonsai-server-windows.md   (mod — :8093 als Backend-intern markiert)
docs/agent-guide/registry/tools.yaml                           (mod — Gateway-Eintrag; Maps via task agent-guide:maps regeneriert)
tests/spec/local-llm-proxy.bats                                (mod — FA-LLMPROXY-IDs, Golden-Parity, healthz, Config-Lint, DB-Anti-Drift)
tests/spec/software-factory.bats                               (mod — Stage-Plan-Wake, Dispatcher-Health-Gate, Register-Skript-Gate)
website/src/data/test-inventory.json                           (regeneriert — task test:inventory)
```

## S1-Zeilenbudgets (wirksame Schwelle je Datei, unbaselined ⇒ Extension-Limit)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/llm-proxy/fixups.mjs` | 32 | 468 |
| `scripts/llm-proxy/discovery.mjs` | 99 | 401 |
| `scripts/llm-proxy/server.mjs` | 67 | 433 |
| `scripts/llm-proxy/backends.mjs` | 50 | 450 |
| `scripts/llm-proxy/server.test.mjs` | 67 | 433 |
| `scripts/factory/provider-register-bonsai.sh` | 32 | 468 |
| `scripts/factory/route-provider.sh` | 77 | 423 |
| `scripts/factory/dispatcher-bridge.sh` | 135 | 365 |
| `scripts/vda/ticket/stage-plan.sh` | 53 | 447 |

`scripts/factory/pipeline.mjs` steht auf der `s1.ignore`-Liste (sanktionierter Monolith, T000460)
— Diff trotzdem strikt auf den `FACTORY_MODEL`-Konstantenblock begrenzen. Neue `.sh`-Dateien
(`cutover.sh`, `forcetick-poll.sh`) bleiben unter dem 500er-Limit. `.yml`/`.md`/`.jsonc`/`.bats`/
`.sql`/`.service`/`.timer` sind S1-ungated.

## Ausführungsreihenfolge

1. **p5-tests** schreibt zuerst RED (Golden-Parity-Fixtures + Gate-Tests schlagen gegen den
   Ist-Stand fehl — Failing-Test-Step mit Runner im Partial),
2. **p1-proxy-core** und **p3-factory-wake** unabhängig (disjunkte Dateien, gang-fähig),
   **p4-docs-surfaces** jederzeit parallel,
3. **p2-host-rollout** nach p1 (Cutover-Preflight braucht die Paritäts-Fixups),
4. dann finaler Verify-Task unten (GREEN).

Zwischen p5 (RED) und p1/p2/p3 (GREEN) sind einzelne Tests transient rot — das ist beabsichtigt
(rot→grün); der finale Verify-Task ist das Gate.

## Task F: Finale Verifikation (nach allen Partials)

- [ ] Alle Partial-Verify-Steps sind grün: `node --test scripts/llm-proxy/` und die
      BATS-Suites aus p5 laufen GREEN.
- [ ] Test-Inventar nach Test-Umbenennungen/-Neuanlagen regenerieren und committen:

```bash
task test:inventory
git add website/src/data/test-inventory.json
```

- [ ] OpenSpec-Validierung (Deltas gegen `local-llm-proxy` + `software-factory`):

```bash
task test:openspec
```

- [ ] CI-Äquivalenz-Gates (S1–S4-Ratchet inklusive):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Cutover-Runbook (manuell, Host — dokumentiert in `scripts/llm-proxy/cutover.sh`):
      Factory quiesced → `bash scripts/llm-proxy/cutover.sh` (stoppt+disabled
      `bonsai-msg-fixup-proxy.service`, installiert+startet `llm-proxy.service`, Smoke beider
      Request-Shapes, Rollback bei Fehler) → Migration auf beide Brand-DBs →
      `autopilot.env`/globale opencode-Config gemäß cutover.sh-Checkliste →
      `curl -sf http://127.0.0.1:18235/healthz` liefert 200 und
      `bash scripts/factory/route-provider.sh factory-implement sonnet` liefert
      `http://127.0.0.1:18235` mit `ternary-bonsai`.
