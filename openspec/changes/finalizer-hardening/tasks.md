---
title: "finalizer-hardening — Implementation Plan"
ticket_id: T012256
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# finalizer-hardening — Implementation Plan

_Ticket: T012256_

## File Structure

```
tests/spec/agent-skills/finalize-hardening.bats   new     (bereits im RED-Commit)
scripts/devflow-post-merge-finalize.sh            modify  435 L vorher, S1-Limit .sh = 800, Budget 365
openspec/specs/agent-skills.md                    modify  (Archiv-Merge des Deltas, durch openspec archive)
```

## Partials

| # | Rolle | target_files |
|---|-------|--------------|
| p1 | fix + tests | `scripts/devflow-post-merge-finalize.sh`, `tests/spec/agent-skills/finalize-hardening.bats` |

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt im Stage-Commit dieses Branches. Er extrahiert
      die betroffenen Funktionen und Abschnitte per awk-Bereichsmuster aus dem Skript und führt
      sie gegen Sandbox-Repos bzw. `git`/`gh`-Stubs aus.
      `expected: FAIL` für 7 der 8 Tests; grün ist zunächst nur der B2-Positiv-Anker
      („mark_ok und mark_skip zaehlen getrennt").

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-hardening.bats
# expected: FAIL — u.a. "not ok 2 B2: mark_warn existiert", "not ok 8 B1: zwei gleichzeitige Archiv-Sektionen ueberlappen nicht"
```

## Task 1 — B2: Warn-Marker einführen und Schritt 10 den Widerspruch melden lassen

- [ ] `mark_warn()` neben `mark_ok`/`mark_skip` ergänzen, mit eigenem Zähler `WARN_COUNT`
      (Initialisierung neben `SKIP_COUNT=0`). Ausgabe mit Präfix `[warn]` nach stderr; der
      Zähler für erledigte und übersprungene Schritte bleibt unberührt.
- [ ] Die Schlusszeile um die Warnungszahl erweitern. Bei `WARN_COUNT > 0` zusätzlich eine
      erklärende Zeile nach stderr, die auf die Wiederholbarkeit hinweist.
- [ ] **Der Exit-Code bleibt 0.** Eine Warnung darf den Lauf nicht als gescheitert markieren —
      die offenen Schritte sind über den idempotenten Wiederholungslauf nachholbar, und ein
      Exit ≠ 0 würde Aufrufer dazu bringen, einen im Wesentlichen erfolgreichen Abschluss als
      Fehler zu behandeln.
- [ ] In Schritt 10 den `else`-Zweig („Worktree bereits entfernt") aufteilen: existiert der
      aufgelöste Pfad nicht, aber `git worktree list --porcelain` weist einen Worktree mit
      `branch refs/heads/$BRANCH` aus, ist das ein Widerspruch → `mark_warn` mit beiden Pfaden
      in der Meldung. Nur wenn kein Worktree den Branch hält, bleibt es ein `mark_skip`.

## Task 2 — B3: Idempotenz über den Zielzustand statt über die Branch-Existenz

- [ ] `_archive_already_done()` einführen, aufgerufen anstelle des bisherigen
      `git ls-remote --exit-code --heads origin "$ARCHIVE_BRANCH"` in Schritt 8. Drei Signale,
      jedes für sich hinreichend:
      1. Archiv-Branch liegt noch remote (Archivierung läuft, PR offen)
      2. `git ls-tree -d --name-only origin/main openspec/changes/archive/` enthält einen
         Eintrag, der auf `-<slug>` endet (Zielzustand erreicht — bleibt auch nach dem Löschen
         des Archiv-Branches wahr)
      3. `gh pr list --head "$ARCHIVE_BRANCH" --state merged` liefert eine PR-Nummer
- [ ] Die Skip-Meldung so formulieren, dass sie alle drei Wege benennt — sonst liest sich der
      Skip wie der alte, rein branch-basierte.
- [ ] Signal 2 ist das tragende: Schritt 8 löscht den Archiv-Branch selbst per
      `gh pr merge --auto --squash --delete-branch` und stellt den Zustand „gemergt, Branch weg"
      damit im Normalbetrieb her. Signal 3 ist die Absicherung für den Fall, dass der
      Archiv-Ordner unter abweichendem Datumspräfix liegt.

## Task 3 — B1: Archiv-Sektion serialisieren

- [ ] `_archive_lock()` einführen und als erste Anweisung im Archivierungszweig von Schritt 8
      aufrufen (im `else` von `_archive_already_done`, vor dem `git checkout -B`).
- [ ] Der Lock liegt auf einer Datei im gemeinsamen Git-Verzeichnis
      (`git rev-parse --git-common-dir`, `GIT_COMMON_DIR` überschreibbar für Tests) — damit gilt
      er über alle Worktrees desselben Repos, was genau der Reichweite des geteilten Index
      entspricht.
- [ ] `flock` hält die Sperre am offenen Dateideskriptor; sie fällt beim Prozessende von selbst,
      auch bei Abbruch. Kein manuelles Aufräumen, keine Stale-Lock-Behandlung.
- [ ] **Fail-open, nicht fail-closed:** fehlt `flock` oder ist die Lock-Datei nicht zu öffnen,
      läuft die Sektion unserialisiert weiter und meldet das per `mark_warn`. Die Archivierung
      zu blockieren wäre der schlechtere Tausch — sie ist der Zweck des Schritts, die
      Kollision ein seltenes Timing.

- [ ] GREEN-Nachweis:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-hardening.bats
# expected: 8/8 ok
```

## Task 4 — Regression und abschließende Verifikation

- [ ] Die bestehenden Finalizer-Guards (T006348, T008014, T012240, T012243) greifen auf dieselben
      Abschnitte zu und dürfen nicht brechen:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills/
```

- [ ] Vollständiger Verify-Lauf:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

