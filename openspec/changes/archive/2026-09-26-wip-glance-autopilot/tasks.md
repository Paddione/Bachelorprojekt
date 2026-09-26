---
title: "wip-glance-autopilot — Implementation Plan"
ticket_id: T900481
domains: [agent-behavior, repo-structure]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wip-glance-autopilot — Implementation Plan

_Ticket: T900481_

## File Structure

```
scripts/wip-glance.sh                                  neu (read-only Uebersicht)
scripts/wip-finish.sh                                  neu (fail-closed Finisher)
tests/spec/scripts/wip-glance.bats                     neu (6 Tests)
tests/spec/scripts/wip-finish.bats                     neu (10 Tests)
.opencode/skills/sdlc-autopilot/SKILL.md               geaendert (Schritt 0 + W)
openspec/changes/wip-glance-autopilot/{proposal,tasks,specs/agent-skills}.md
```

## Tasks

- [x] **1. `scripts/wip-glance.sh`.** Porcelain-Parsing von
      `git worktree list`, `git status --porcelain` pro Worktree, Alter aus
      `git log -1 --format=%ct`, Locks aus `scripts/agent-lock.sh list` plus
      den JSON-Dateien, Branches ueber `git merge-base --is-ancestor`, PRs
      via `gh` (graceful, wenn `gh` fehlt), Stashes. Flags `--json`,
      `--quiet`, `--stale-hours`, `--repo`. **Read-only.**

- [x] **2. `tests/spec/scripts/wip-glance.bats`.** Hermetisch ueber
      Stub-`git` im `PATH` und Stub-`scripts/agent-lock.sh`; die Fixture
      nutzt `--repo` und `AGENT_LOCK_DIR`. Deckt JSON-Shape,
      Kurzantwort, Read-only-Nachweis, `live` vs. `unlocked-dirty`,
      `abandoned`-Klassifikation und die fail-closed Argumente ab.

- [x] **3. `scripts/wip-finish.sh`.** Kandidaten aus `wip-glance.sh --json`
      (ein jq-Objekt pro Zeile). Heuristik `abandoned`+dirty → `commit-dirty`,
      `abandoned`+clean+kein PR → `open-pr`, sonst `review-stash`; `live` und
      `unlocked-dirty` → immer `none`. Rail-Auswahl ueber
      `--rails host:port|ssh-alias:port`, Antwortformat
      `ACT=<aktion>|REASON=<kurz>`. Flags `--apply`, `--allow`,
      `--require-rail`, `--waive-lock`, `--max-items`, `--json`, `--rails`.

- [x] **4. `tests/spec/scripts/wip-finish.bats`.** Testet das FALSCHE
      Verhalten: Planlauf read-only, `--apply` ohne `--allow` ohne Wirkung,
      `commit-dirty` ohne eigenen Lock = `skipped`, nicht angebotene
      Rail-Aktion wird verworfen, unbrauchbare Antwort faellt auf die
      Heuristik zurueck, Stashes werden nie `commit-dirty`,
      `--require-rail` ohne Rail endet mit Exit 1.

- [x] **5. `.opencode/skills/sdlc-autopilot/SKILL.md`.** Schritt 0
      (WIP-Lage) in der Loop-Reihenfolge, Abschnitt "W. Abandoned-WIP
      aufraeumen (bis clean)" mit Sicherheitsmodell und Rail-Tabelle,
      Eintrag in den Abbruchbedingungen.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** Ohne die Skripte scheitern beide Suiten
      an der fehlenden Datei; erwartet: FAIL.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/scripts/wip-glance.bats
# expected: FAIL (rot — scripts/wip-glance.sh existiert noch nicht)
```

- [x] **Fix-Step (GREEN).** Nach Implementierung 6/6 bzw. 10/10 gruen.

- [x] **Final Verification.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/scripts/wip-glance.bats tests/spec/scripts/wip-finish.bats
bash scripts/wip-glance.sh --quiet
bash scripts/wip-finish.sh --rails 127.0.0.1:1 | tail -5
task test:changed
task freshness:regenerate
task freshness:check
```
