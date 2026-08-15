---
title: "post-merge-finalize-archive-branch-restore — Implementation Plan"
ticket_id: T006791
domains: [scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# post-merge-finalize-archive-branch-restore — Implementation Plan

**Goal:** `scripts/devflow-post-merge-finalize.sh` merkt vor der Archiv-Sektion (Schritt 8)
den aktuellen Branch (`ARCHIVE_PREV_BRANCH`) und stellt ihn nach der Sektion wieder her —
auch auf Fehlerpfaden. Der BATS-Guard Assertion 5
(`tests/spec/agent-skills/post-merge-finalize-guards.bats`) wird von `skip` auf eine echte
Assertion zurückgestellt (im Stage-Commit bereits geschehen).

**Architecture:** Der Fix lebt in der Archiv-Sektion (Z. ~209–246): PREV-Merken im
Hauptfluss vor der Subshell, Restore als EXIT-Trap IN der Subshell. Die Trap deckt sowohl den
Happy-Path (nach Push/PR) als auch die Fehlerpfade (`gh pr create`/`gh pr merge` FATAL →
Subshell-Exit 1) ab — die naheliegende Restore-Nach-der-Subshell-Variante liefe bei
`set -euo pipefail`-Abbruch nie und hinterließe genau im Fehlerfall den gewechselten
Arbeitsbaum (T002357-Fallenklasse, siehe design.md).

**Tech Stack:** Bash (Skript-Subshell), git (`git -C "$ARCHIVE_DIR" rev-parse`,
`git checkout`), BATS (vendored, `tests/unit/lib/bats-core/bin/bats`).

**Spec:** `design.md` + Delta-Spec in diesem Change — Ticket T006791, Branch
`fix/devflow-post-merge-finalize-archive-restore-T006791`.

## Global Constraints

- Kein Verhalten der Archiv-Sektion selbst ändern (Archive-Commit, checkout -B,
  cherry-pick, push, gh pr create/merge bleiben unverändert) — nur PREV-Merken + Restore.
- Der Restore darf den Subshell-Exit-Code nicht verschlucken: Fehler in der Sektion
  enden weiterhin mit Exit 1, ein Restore-Fehler ebenfalls (FATAL auf stderr).
- BATS-Guard Assertion 5 bleibt im Source-Grep-Modus (dokumentierte Ausnahme von
  T002448-M4: der Laufzeitpfad braucht Cluster/DB) — die Datei dokumentiert den Modus
  bereits im Header.
- Positiv-Anker (Test 4, `refs/heads/$ARCHIVE_BRANCH`) bleibt unangetastet.

## File Structure

| File | Change | Size | Budget |
|---|---|---|---|
| `scripts/devflow-post-merge-finalize.sh` | modify | ~340 L | +15 (PREV-Merken, Trap-Funktion, Restore) |
| `tests/spec/agent-skills/post-merge-finalize-guards.bats` | modify | 102 L | skip-Entfernung (im Stage-Commit enthalten) |
| `openspec/changes/post-merge-finalize-archive-branch-restore/*` | scaffold | — | bereits im Stage-Commit |

## Partials

- partial: 1/1 — post-merge-finalize-archive-branch-restore (Skript + Tests)

## Tasks

### Task 1: [x] RED — Assertion 5 aktivieren (Stage-Commit, bereits erledigt)

Die `skip`-Zeile in `tests/spec/agent-skills/post-merge-finalize-guards.bats` (Test 5,
`T006348: Skript restauriert den Arbeitsbaum-Branch nach der Archiv-Sektion`) wurde im
Stage-Commit entfernt; der Test prüft `grep -qF 'ARCHIVE_PREV_BRANCH' "$FINALIZE"`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
# expected: FAIL — Test 5 rot (7/8 grün, `[ "$status" -eq 0 ]' failed`), weil die
# Variable im Skript noch nicht existiert (verifiziert am 2026-08-15 gegen main).
```

### Task 2: [x] Fix implementieren — ARCHIVE_PREV_BRANCH merken + Restore-Trap

Datei: `scripts/devflow-post-merge-finalize.sh`, Archiv-Sektion (`if [[ -n "${ARCHIVE_DIR:-}" ]]`).

Schritt 2.1 — PREV im Hauptfluss merken, direkt vor der Subshell (im `else`-Zweig nach dem
ls-remote-Skip, vor `(`):

```bash
      # T006791: Vor der Archiv-Sektion den aktuellen Branch merken — die Sektion
      # wechselt per checkout -B den Branch des geteilten Arbeitsbaums (Worktree
      # oder Haupt-Checkout); der Restore in der Subshell-Trap stellt ihn nach der
      # Sektion wieder her (auch auf Fehlerpfaden, T002357-Fallenklasse).
      ARCHIVE_PREV_BRANCH="$(git -C "$ARCHIVE_DIR" rev-parse --abbrev-ref HEAD)"
```

Schritt 2.2 — Restore-Trap als ersten Befehl IN der Subshell (nach `cd "$ARCHIVE_DIR"`,
vor `bash scripts/openspec.sh archive "$SLUG"`):

```bash
        # T006791: Restore bei jedem Sektions-Ende — Happy-Path (nach Push/PR) und
        # Fehlerpfade (Subshell exit 1) hinterlassen den Arbeitsbaum auf dem
        # gemerkten Branch. No-op, wenn kein Wechsel stattfand; Restore-Fehler
        # enden mit Exit 1 statt still Erfolg zu melden.
        _restore_prev_branch() {
          local _prev_rc=$?
          if [[ -n "$ARCHIVE_PREV_BRANCH" ]] && \
             [[ "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)" != "$ARCHIVE_PREV_BRANCH" ]]; then
            if git checkout "$ARCHIVE_PREV_BRANCH" >/dev/null 2>&1; then
              echo "Schritt 8: Branch-Restore auf $ARCHIVE_PREV_BRANCH nach Archiv-Sektion (T006791)"
            else
              echo "FATAL: Branch-Restore auf $ARCHIVE_PREV_BRANCH fehlgeschlagen — Arbeitsbaum bleibt auf $ARCHIVE_BRANCH (T006791)" >&2
              _prev_rc=1
            fi
          fi
          exit "$_prev_rc"
        }
        trap _restore_prev_branch EXIT
```

Erwartung: `mark_ok "Schritt 8: OpenSpec-Change archiviert (Archiv-PR erstellt)"` bleibt
unverändert; im Normal-Lauf erscheint zusätzlich die Restore-Meldung der Trap.

### Task 3: [x] GREEN — BATS-Lauf

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
# expected: PASS — 8/8 grün (Assertion 5 greift jetzt `ARCHIVE_PREV_BRANCH`).
```

### Task 4: [x] Verifikation + Commit

```bash
bash -n scripts/devflow-post-merge-finalize.sh
task test:changed
task freshness:regenerate
task freshness:check
task openspec:validate
git add scripts/devflow-post-merge-finalize.sh tests/ openspec/changes/post-merge-finalize-archive-branch-restore/ website/src/data/
git commit -m "fix(scripts): restore worktree branch after archive section in devflow finalize [T006791]"
git push origin fix/devflow-post-merge-finalize-archive-restore-T006791
```

- `task test:changed` — alle vom Branch betroffenen Offline-Tests (inkl. Guard-Datei).
- `task openspec:validate` — fail-closed Delta/SSOT-Gate; die Delta-Spec wurde auf den
  Parent-Slug `agent-skills.md` benannt (T001304).
- Der Commit-msg-Guard (`check-commit-vs-diff.sh`) verlangt hier `fix(scripts):`, weil der
  Diff Production-Code (Skript) + Tests enthält.
