---
title: "mishap-10er-bundle — Implementation Plan"
ticket_id: T002469
domains: [scripts, agents, infra, skills]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: [T002454]
---

# mishap-10er-bundle — Implementation Plan

_Ticket: T002469_

## File Structure

```
CHANGED:
  scripts/agent-collision.sh           — False Positives (M7, M9)
  scripts/worktree-create.sh           — auto-sync origin/main + git-crypt-key (M6, M10)
  scripts/agent-lock.sh                — stale-Lock opencode (M4) — wartet auf T002454
  scripts/ticket-mcp/go/...            — factory_excluded removen (M8)
  .agents/skills/ticket-ops/SKILL.md   — Line-Nummern + Dispatch (M1, M3)
  docs/                                — mcp-postgres Fallback (M2)
NEW:
  tests/spec/agent-collision-false-positives.bats
  tests/spec/agent-lock-opencode-stale.bats
```

## Partial-Manifest

| Partial | Files | Mishaps |
|---|---|---|
| p1 | scripts/agent-collision.sh, tests/spec/agent-collision-false-positives.bats | M7, M9 |
| p2 | scripts/worktree-create.sh | M6, M10 |
| p3 | scripts/agent-lock.sh, scripts/ticket-mcp/..., tests/spec/agent-lock-opencode-stale.bats | M4, M8 |
| p4 | .agents/skills/ticket-ops/SKILL.md, docs/ | M1, M2, M3, M5 |
| p5 | Tests + CI — task test:changed, task freshness:check | alle |

> **Hinweis:** p3 (agent-lock.sh) überschneidet sich teilweise mit T002454 (claim --force, bereits implementiert). p3 setzt voraus, dass T002454 gemergt ist, oder implementiert den opencode-spezifischen Teil auf dem Stand von T002454.

## Tasks

### p1 — agent-collision.sh False Positives

- [ ] 1.1 In `scripts/agent-collision.sh`: File-Exists-Prüfung (`[ -f "$peer_path" ]`) vor blob-Vergleich in der Peer-Scan-Logik — nicht-existente Dateien überspringen
- [ ] 1.2 Branch-vs-Slug-Unterscheidung: false positives bei Dateien vermeiden, die nur im aktuellen Branch existieren
- [ ] 1.3 `tests/spec/agent-collision-false-positives.bats` anlegen: Tests für brandneue Dateien, nicht-existente Peers

### p2 — worktree-create.sh Fixes

- [ ] 2.1 `scripts/worktree-create.sh`: `git fetch origin main && git rev-parse origin/main` statt lokalem `main`-Branch für auto-sync
- [ ] 2.2 git-crypt-Key-Kopie: beim Worktree-Anlegen `.git/git-crypt/keys/default` in den neuen Worktree kopieren

### p3 — agent-lock stale Locks + ticket-mcp factory_excluded

- [ ] 3.1 `scripts/agent-lock.sh`: stale-Lock-Prävention für opencode (--worktree-Handling verbessern, SID-Erkennung)
- [ ] 3.2 `scripts/ticket-mcp/go/internal/handlers/readiness.go`: `remove_readiness_flag`-Wrapper für factory_excluded (per psql `readiness - 'factory_excluded'`)
- [ ] 3.3 `tests/spec/agent-lock-opencode-stale.bats`: Tests für opencode-stale-Locks

### p4 — Doku + Prozess

- [ ] 4.1 `.agents/skills/ticket-ops/SKILL.md`: Line-Nummern-Prüfung dokumentieren (exakte Prüfung vor sed)
- [ ] 4.2 `.agents/skills/ticket-ops/SKILL.md`: Planning-vs-Execution-Dispatch-Unterscheidung dokumentieren
- [ ] 4.3 `docs/`: mcp-postgres Read-Only-Fallback für ticket-ops dokumentieren

### p5 — Tests + CI-Verifikation

- [ ] 5.1 `task test:changed` — alle Tests grün
- [ ] 5.2 `task freshness:regenerate && task freshness:check` — Artefakte aktuell
- [ ] 5.3 `task workspace:validate` — Kustomize-Dry-Run
