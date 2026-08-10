---
title: "Mishap-Bundle T002506 — 7 Fixes (agent-lock, post-merge-deploy, collision, plan-lint, docs)"
ticket_id: "T002506"
domains: [factory, scripts, ci, docs]
status: plan_staged
partials: 5
---

# Implementation Plan: mishap-bundle-T002506

## File Structure

### Geänderte Dateien
- `scripts/agent-lock-merged.sh` — M2: check-merged false-positive fix
- `scripts/devflow-post-merge-deploy.sh` — M7: --merges entfernen
- `scripts/agent-collision.sh` — M3: COLLISION false-positive fix
- `scripts/plan-lint.sh` — M6: W3/G1 H3-Tolerant
- `.opencode/skills/opencode-flow-execute/SKILL.md` — M1: Fallunterscheidung
- `CLAUDE.md` — M4: gitleaks-Setup + M10: Ticket-Closure-Konvention

### Neue Dateien
- `tests/spec/mishap-bundle-T002506.bats` — RED Tests für M2, M3, M6, M7

## Partials

| # | Pfad | Rolle | Targets | Deps |
|---|------|-------|---------|------|
| P1 | `tasks.d/p1-script-fixes.md` | impl | `scripts/agent-lock-merged.sh`, `scripts/devflow-post-merge-deploy.sh` | |
| P2 | `tasks.d/p2-collision.md` | impl | `scripts/agent-collision.sh` | |
| P3 | `tasks.d/p3-plan-lint.md` | impl | `scripts/plan-lint.sh` | |
| P4 | `tasks.d/p4-docs.md` | impl | `.opencode/skills/opencode-flow-execute/SKILL.md`, `CLAUDE.md` | |
| P5 | `tasks.d/p5-tests.md` | tests | `tests/spec/mishap-bundle-T002506.bats` | |

## Verify
1. `bash scripts/plan-lint.sh openspec/changes/mishap-bundle-T002506/tasks.md` → PASS
2. `task test:changed` → grün
3. `task freshness:regenerate` → Artefakte aktuell
4. `task freshness:check` → keine stale Artefakte
5. `bash tests/unit/lib/bats-core/bin/bats tests/spec/mishap-bundle-T002506.bats` → 4 RED → nach Fix: 4 GREEN
