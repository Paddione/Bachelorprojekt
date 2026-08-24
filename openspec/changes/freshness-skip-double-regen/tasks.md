---
title: "freshness-skip-double-regen — Implementation Plan"
ticket_id: T015827
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freshness-skip-double-regen — Implementation Plan

_Ticket: T015827_

Skip-Guard gegen den doppelten Freshness-Regen-Zyklus an Archiv-PR #5191 sowie
Dokumentation/Entschärfung der merge=ours-Rebase-Falle. Diagnose und Evidenz:
`proposal.md` in diesem Change.

## File Structure

```
scripts/freshness-regen-in-flight.sh          (NEU, ~60 Zeilen)  — gemeinsamer Detektor
scripts/pr-refresh.sh                         (+~25 Zeilen)      — Guard vor _refresh_branch-Regen
scripts/devflow-ci-watch.sh                   (+~20 Zeilen)      — Guard im DIRTY-Preflight
scripts/factory/babysit-prs.sh                (+~15 Zeilen)      — Guard im freshness-Fix-Pfad
tests/spec/ci-cd/freshness-regen-skip-guard.bats (NEU, ~150)     — RED→GREEN Guards (Stub-Pattern aus tests/spec/pr-refresh.bats)
tests/spec/ci-cd/merge-ours-rebase-direction.bats (NEU, ~50)     — Doku-Guard .gitattributes + Taskfile-NOTE
.gitattributes                                (+~12 Kommentarzeilen)
Taskfile.yml                                  (+~8 Kommentarzeilen, nur NOTE bei freshness:regenerate)
```

S1-Budgets: `.sh`-Limit 800; pr-refresh.sh 268, devflow-ci-watch.sh 241,
babysit-prs.sh 290 — alle weit unter Limit, keine baseline.json-Ratchet-Einträge
für die Zieldateien (geprüft). Taskfile.yml wird nur kommentierend erweitert.

## Gruppe 1 — Skip-Guard gegen den Doppelzyklus

- [ ] **Failing-Test-Step (RED).** Neue BATS-Datei nach dem gh-Stub-Muster von
      `tests/spec/pr-refresh.bats` (PR_REFRESH_GH_CMD/PR_REFRESH_DRY_PUSH-Indirektion,
      Push-Log statt echtem Push):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/freshness-regen-skip-guard.bats
# expected: FAIL (rot — Detektor und Guards existieren noch nicht)
```

      Tests: (a) offener `chore/freshness-regen-*`-PR im Stub ⇒ pr-refresh.sh pusht keinen
      Regen-Commit (Push-Log leer bzw. ohne Regen-Commit), Positiv-Anker: Lauf bewertet den PR;
      (b) kein Regen in flight (Kontroll-Anker) ⇒ bestehendes Verhalten unverändert;
      (c) Detektor meldet „in flight" bei gestubbtem `gh run list --status in_progress/queued`;
      (d) DIRTY-Preflight von devflow-ci-watch.sh erzeugt bei „in flight" keinen
      Auto-Rebase-Regen-Commit; (e) babysit-prs.sh class=freshness pusht bei „in flight"
      keinen `chore: refresh (ci-babysitter)`-Commit.

- [ ] **Detektor implementieren.** `scripts/freshness-regen-in-flight.sh`: Exit 0, wenn ein
      offener PR mit `headRefName startswith chore/freshness-regen-` existiert ODER ein Run von
      `freshness-regen.yml` auf `in_progress` oder `queued` steht; Exit 1 sonst. `gh`-Aufruf
      über Indirektionsvariable (Vorbild `PR_REFRESH_GH_CMD`) injectable halten, damit die Tests
      netzfrei bleiben. Fehlerhafte gh-Aufrufe sind fail-open zu behandeln (Exit 1 + Warnung auf
      stderr), damit der Guard den Heilungspfad nie blockiert.

- [ ] **pr-refresh.sh verdrahten.** In `_refresh_branch()` vor dem Regenerations-Block
      (aktuell Zeile 222–228): Detektor befragen; bei „in flight" Regeneration+Commit
      überspringen, Rebase und Push fortsetzen, Bilanz-Kategorie unverändert lassen.
      Header-Kommentar um eine Zeile zum Skip-Guard ergänzen.

- [ ] **devflow-ci-watch.sh verdrahten.** Im DIRTY-Preflight (aktuell Zeile 34–44): nach
      erfolgreichem Rebase den Detektor befragen; bei „in flight" den Regenerate-Commit-Schritt
      überspringen und das mit einer Logzeile sichtbar machen, dann normal weiterpushen.

- [ ] **babysit-prs.sh verdrahten.** Im freshness-Fix-Pfad (aktuell Zeile 248–253): vor
      `task freshness:regenerate && git commit && git push` den Detektor befragen; bei „in
      flight" Fix als übersprungen melden (post_marker mit decision=skipped-regen-in-flight,
      kein Commit, kein Push), Worktree-Aufräumen unverändert.

## Gruppe 2 — merge=ours-Rebase-Falle dokumentieren und entschärfen

- [ ] **Doku-Guard (RED).** Neue Datei `tests/spec/ci-cd/merge-ours-rebase-direction.bats`
      (Source-Verification-Modus, Präzedenz:
      `tests/spec/ci-cd/freshness-regen-rebase-guard.bats`): prüft, dass `.gitattributes` UND
      die `freshness:regenerate`-NOTE in `Taskfile.yml` die Rebase-Asymmetrie benennen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/merge-ours-rebase-direction.bats
# expected: FAIL (rot — Doku-Text fehlt noch)
```

- [ ] **.gitattributes erweitern.** Kommentarblock unterhalb des merge=ours-Blocks (Zeile
      ~13–26): Rebase-Richtung explizit — „ours" ist beim `git rebase` das NEUE BASE
      (origin/main); der Driver verwirft stillschweigend Branch-seitige Artefakt-Änderungen.
      Nach jedem Rebase eines Branches, der diese Artefakte berührt, ist `task
      freshness:regenerate` Pflicht (Kompensation ist die Regeneration, nicht der Driver).

- [ ] **Taskfile-NOTE erweitern.** NOTE-Block bei `freshness:regenerate` (Taskfile.yml
      Zeile ~1311–1316) um denselben Rebase-Richtungs-Hinweis ergänzen, inkl. Verweis auf
      `scripts/pr-refresh.sh` als Referenz-Umsetzung der Post-Rebase-Regeneration.

- [ ] **SSOT-Korrektur liegt im Delta.** Das falsche Szenario „merge=ours-Driver
      automatisiert die Auflösung" (zugunsten des PR-Branch) ist in diesem Change bereits als
      MODIFIED Requirement in `specs/ci-cd.md` korrigiert — kein separater Schritt nötig; beim
      Implementieren nicht zusätzlich in `openspec/specs/ci-cd.md` editieren (Delta wird erst
      beim Archivieren gemergt).

- [ ] **Entschärfung verifizieren.** Bestätigen, dass beide automatisierten Rebase-Pfade
      (pr-refresh.sh, devflow-ci-watch.sh) die Post-Rebase-Regeneration tatsächlich ausführen,
      wenn KEIN Regen in flight ist — genau diese Kombination (Rebase ohne Folgeregeneration)
      ist die Falle. Fehlt sie in einem Pfad, im selben PR nachziehen.

## Verify (RED → GREEN)

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

      Zusätzlich gezielt die beiden neuen BATS-Dateien und den Bestand:
      `tests/unit/lib/bats-core/bin/bats tests/spec/ci-cd/freshness-regen-skip-guard.bats
      tests/spec/ci-cd/merge-ours-rebase-direction.bats tests/spec/pr-refresh.bats`.
