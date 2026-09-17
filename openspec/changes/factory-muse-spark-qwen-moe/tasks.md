---
title: "factory-muse-spark-qwen-moe — Implementation Plan"
ticket_id: T900210
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# factory-muse-spark-qwen-moe — Implementation Plan

_Ticket: T900210_
_Proposal: openspec/changes/factory-muse-spark-qwen-moe/proposal.md_
_Delta: openspec/changes/factory-muse-spark-qwen-moe/specs/software-factory.md_
_Design: docs/superpowers/specs/2026-09-17-factory-muse-spark-qwen-moe-design.md_

## File Structure

```
.opencode/agent-models.jsonc          # p1: Muse-Spark-Modelle + orchestrator + planner-muse
.opencode/prompts/orchestrator.md     # p2: Header + Eskalationskette + Empty-Return M2
scripts/factory/dispatcher-bridge.sh  # p3: Executor-Default + FACTORY_MODE
scripts/factory/opencode-exec.sh      # p4: Modus-Satz im Prompt
tests/spec/software-factory/factory-mode.bats  # p3/p4: neue Guards (angelegt in p3)
wakeup.sh + AGENTS.md                 # p5: Header/Notiz + Sync + Verify
```

Partials sind disjunkt (keine zwei Partials berühren dieselbe Datei).
`qwen38-primary`, `local`, `reviewer`, `opencode.jsonc`-Default, KV-Pool und
Compaction bleiben unangetastet.

## Partial p1 — Model-Registry (REQ-SF-EXECUTOR-004)

- `opencode-zen`: `muse-spark-1.3-contributor-free` (ctx 1048576, output
  131072, Mess-Kommentar mit Datum).
- `opencode-go`: `muse-spark-1.3-contributor` (gleiche Limits).
- `orchestrator.model` → Zen-Free-Modell; Description aktualisiert.
- Neuer Subagent `planner-muse` (Go-Modell, Planungs-Prompt); Allow-Listen von
  `orchestrator`, `big-pickle`, `qwen38-primary` erweitert (exakte Namen).
- Done when: JSONC parst, `opencode models`-Smoke zeigt beide Modelle (free
  zuerst, Go zweitens).

## Partial p2 — Orchestrator-Prompt (REQ-SF-EXECUTOR-004)

- Zeile 1: Muse Spark 1.3 Free (1M ctx, Training-Data-Sharing-Hinweis).
- Eskalationskette: `local` (2×) → `planner-muse` → `deepseek-helper-go` →
  `deepseek-helper` → `pro/pro-direct`; Empty-Return-Regel nennt
  `planner-muse` als M2.
- Done when: Prompt nennt keinen Laguna-Default mehr; Kette exakt wie oben.

## Partial p3 — Dispatcher-Default + FACTORY_MODE (REQ-SF-EXECUTOR-001/003)

- `executor="${FACTORY_EXECUTOR:-opencode}"`; `claude|opencode|dsh`-Cases und
  unknown→claude-Warnung bleiben (Guards: executor.bats, partial-deploy-gang).
- Neu: `FACTORY_MODE="${FACTORY_MODE:-mixed}"`, validiert
  (`local|api|mixed`, unknown→mixed mit Warnung), Export an `opencode-exec.sh`.
- Neue Guards in `tests/spec/software-factory/factory-mode.bats`:
  Default-ist-opencode, `FACTORY_EXECUTOR=claude` nutzt `claude -p`,
  unknown→claude-Warnung, unknown-Mode→mixed-Warnung.
- Done when: neue BATS-Datei grün + bestehende Executor-Guards grün.

## Partial p4 — opencode-exec Prompt-Modus (REQ-SF-EXECUTOR-003)

- Ein Modus-Satz im Orchestrator-Prompt: `local` = nur `local`-Subagent, keine
  Cloud-Eskalation; `api` = Eskalation zu `planner-muse` beim ersten Stall;
  `mixed` = bisheriges Verhalten.
- Guards: Prompt enthält den Modus-String je `FACTORY_MODE` (Output-Verifikation
  wie opencode-exec-*.bats, mit Stubs, kein echter LLM-Lauf).
- Done when: Guards grün; Exit-Codes 2/6/7/8 und Phase-Events unverändert.

## Partial p5 — Doku, Sync, Verify

- `wakeup.sh`-Header + `AGENTS.md`-Core-Commands-Notiz (Default opencode,
  `FACTORY_MODE`).
- `scripts/opencode-sync-agents.sh`-Lauf (Repo-Kanon → globale Config).
- `OPENCODE_BIN`-Export + Install-Notiz für die systemd-Unit (D4, nur Env/Doku).
- Finaler Verify-Task (siehe unten).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Neue `factory-mode.bats` gegen den
      unveränderten Dispatcher laufen lassen — Default- und Mode-Assertions
      scheitern auf dem alten Default `claude`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/factory-mode.bats
# expected: FAIL (red — Default ist noch claude, FACTORY_MODE existiert nicht)
```

- [ ] **Fix-Step (GREEN).** p1–p4 implementieren. Die BATS-Datei aus dem
      vorherigen Schritt muss jetzt grün sein; bestehende Guards
      (`dsh-harness-integration/executor.bats`, `partial-deploy-gang.bats`,
      `readiness-gate-before-launch.bats`) bleiben grün.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:check
task workspace:validate
```
