---
title: "mishap-agent-lock — Implementation Plan"
ticket_id: T002454
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-agent-lock — Implementation Plan

_Ticket: T002454_

## File Structure

```
CHANGED:
  scripts/agent-lock.sh                      — claim --force option und ps-Check
  .claude/skills/dev-flow-execute/SKILL.md   — intel.json Dokumentation korrigieren
  .claude/skills/references/repo-hygiene-ops.md — mergedAt Prüfung anpassen
NEW:
  tests/spec/agent-lock-force-claim.bats    — Testfälle für --force command und PID-Checks
```

| File | Ist | Restbudget |
|---|---|---|
| `scripts/agent-lock.sh` | 517 | 283 |

## Tasks

### 1. agent-lock.sh: claim --force und PID-Check implementieren

Implementierung des `--force`-Flags für `claim`. Wenn `--force` übergeben wird, wird geprüft, ob die `owner_pid` des Locks noch aktiv ist. Wenn der Prozess tot ist, wird der Lock übernommen und ein Log-Eintrag in `.reap.log` geschrieben.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-force-claim.bats
# expected: FAIL
```

### 2. dev-flow-execute/SKILL.md & repo-hygiene-ops.md anpassen

- In `.claude/skills/dev-flow-execute/SKILL.md` (und `.agents/skills/dev-flow-execute/SKILL.md`) die Dokumentation von `intel.json` von Pflicht (PFLICHT) zu Optional (Advisory/Optional) anpassen.
- In `.claude/skills/references/repo-hygiene-ops.md` die Überprüfung von `mergedAt` mit `[ -n "$mergedAt" ]` absichern, damit ein Fail-Closed statt Fail-Open bei API-Ausfall eintritt.

### 3. CI-Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
