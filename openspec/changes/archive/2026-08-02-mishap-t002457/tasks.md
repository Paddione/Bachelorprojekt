---
title: "Mishap-Bundle T002457 — Implementation Plan"
ticket_id: T002457
domains: [scripts, infra, ci, plans, website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Mishap-Bundle T002457 — Implementation Plan

_Ticket: T002457_

## File Structure

```
CHANGED:
  — (keine Code-Änderungen — reine Tracking/Koordination)
VERIFIED:
  Change 1: Bereits in T002447 adressiert (agent-lock-identity.sh)
  Change 4: Bereits durch `git worktree prune` behoben
  Change 7: Bereits in PR #3513 behoben
  Change 9: Bereits durch Proposal `scout-prediction-quality` adressiert
```

## Tasks

### 1. Verifikation der bereits behobenen Changes

Prüfe dass die als "bereits behoben" markierten Changes tatsächlich erledigt sind:

- Change 1: T002447 PR #3515 existiert und ist merged oder in_review
- Change 4: `git worktree prune` bestätigen
- Change 7: PR #3513 ist gemergt
- Change 9: Proposal `scout-prediction-quality` existiert

### 2. Nachverfolgung der offenen Changes

- Change 2 (mcp-postgres): Ticket für Port-Forward-Stabilisierung erstellen
- Change 3 (agent-collision Fehlalarme): An T002444 anknüpfen
- Change 5/6 (Worktree-Aufräumung): `repo-hygiene`-Skill ausführen
- Change 8 (preflight-pr-scope): Workaround dokumentieren

### 3. CI-Gates

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

## Verify

```bash
echo "Change 1: T002447 PR #3515"
gh pr view 3515 --json state,mergeStateStatus 2>/dev/null || echo "PR nicht gefunden"
echo "Change 4: worktree prune"
git worktree prune && echo "OK"
echo "Change 7: PR #3513 merged?"
gh pr view 3513 --json state 2>/dev/null || echo "PR nicht gefunden"
echo "Change 9: proposal exists"
test -f openspec/changes/scout-prediction-quality/proposal.md && echo "OK" || echo "Nicht gefunden"
```
