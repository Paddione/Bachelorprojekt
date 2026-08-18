---
slug: fix-devflow-post-merge-deploy-grep
ticket: T009368
status: completed
---

# Fix: devflow-post-merge-deploy.sh --grep Archiv-Commit

## Problem

`devflow-post-merge-deploy.sh` mit `--grep="[T008017]" -1` traf den gemergten **Archiv-Commit** statt des Feature-Merge-Commits → "Keine bekannten Deploy-Trigger", kein Phase-Event, kein Closure-Scan.

## Tasks

### Task 1: Commit-Subject-Klasse filtern

`--grep`-Selektion erweitern um Archiv-Commits auszuschließen:

```bash
# Current (broken):
git log --grep="$TICKET_ID" -1 --format="%H"

# Fixed: Archiv-Commits ausschließen
git log --grep="$TICKET_ID" --grep="chore(plans): archive" --all-match --invert-match -1 --format="%H"
```

### Task 2: Fallback auf PR-Nummer

Alternative: PR-Nummer als Eingabe verwenden statt `--grep -1` zu raten.

## Acceptance Criteria

- [x] `devflow-post-merge-deploy.sh` findet den Feature-Merge-Commit, nicht den Archiv-Commit
- [x] Archiv-Commits werden von --grep ausgeschlossen
- [x] Testfall: Ticket mit Archiv-PR + Feature-PR
