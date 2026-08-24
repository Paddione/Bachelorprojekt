---
title: "finalize-archive-self-verify — Implementation Plan"
ticket_id: T015783
domains: [scripts-infra]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# finalize-archive-self-verify — Implementation Plan

_Ticket: T015783_

## File Structure

```
scripts/devflow-post-merge-finalize.sh          (geändert — Argumentparser, _archive_state, Schritt 8)
tests/spec/agent-skills/finalize-archive-state.bats  (neu — RED bereits committet)
openspec/changes/finalize-archive-self-verify/  (Proposal + Delta-Spec)
```

**S1-Budget.** `.sh`-Limit ist 800 Zeilen (`docs/code-quality/gates.yaml:61`),
`scripts/devflow-post-merge-finalize.sh` steht bei 624 und ist **nicht** gebaselined
(`docs/code-quality/baseline.json` trägt nur den `dataset_inspector.py`-Eintrag). Wirksame
Schwelle ist also das Limit selbst: 176 Zeilen Spielraum. Der Zuwachs unten liegt bei rund
70 Zeilen, eine Verkleinerung ist nicht nötig.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Test liegt bereits als eigene Datei vor und reproduziert
      den Defekt über Kommando-Output gegen ein Fixture-Repo mit lokalem Bare-Remote — keine DB,
      kein Netz. Drei der vier Tests müssen auf diesem Branch fehlschlagen, der vierte
      (Fail-closed-Anker) ist heute trivial grün und wird erst nach dem Fix aussagekräftig.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-state.bats
# expected: FAIL (rot — --archive-state existiert noch nicht; 3 von 4 Tests scheitern
# an `[ "$status" -eq 0 ]`, weil das Skript das unbekannte Flag mit Usage-Fehler abweist)
```

- [ ] **Task 1 — `_archive_state` als Zustandsfunktion einziehen.**
      Neue Funktion in `scripts/devflow-post-merge-finalize.sh`, direkt nach
      `_archive_already_done` (heute Zeile 341–368). Sie schreibt genau einen der Werte
      `archived` / `half` / `pending` auf stdout und trennt dabei eine fehlende Messung von
      einem negativen Ergebnis.

      Aufbau, in dieser Reihenfolge:

      1. `git ls-remote --heads origin` **einmal** aufrufen und den Exit-Code getrennt von der
         Pipeline auswerten. Schlägt der Aufruf fehl, ist origin nicht erreichbar: Fehlermeldung
         nach stderr, `return 2`, **kein** Zustand auf stdout. Ohne diesen Schritt liefert ein
         Netzfehler dieselbe leere Ausgabe wie „Branch existiert nicht" — die Fehlerklasse aus
         `repo-hygiene-ops.md` §3.
      2. `archived`, wenn `_archive_already_done` greift. Die bestehende Disjunktion wird
         **wiederverwendet**, nicht nachgebaut: sie trägt die Datumspräfix-Behandlung und den
         Exakt-statt-Suffix-Vergleich aus Code-Review PR #4744, die ein zweiter Ausdruck sonst
         verlieren würde.
      3. `half`, wenn `openspec/changes/$SLUG` im Arbeitsbaum fehlt **und** ein Verzeichnis
         `openspec/changes/archive/*-$SLUG` dort existiert, das auf `origin/main` noch nicht
         liegt. Der Vergleich läuft über denselben Datumspräfix-Abgleich wie in
         `_archive_already_done` (`^[0-9]{4}-[0-9]{2}-[0-9]{2}-(.+)$` plus Alt-Konvention ohne
         Präfix), damit ein kurzer oder generischer Slug nicht fremde Einträge trifft.
      4. `pending` sonst.

      Die Funktion arbeitet auf einem übergebenen Verzeichnis, nicht auf implizitem cwd, damit
      sie für Worktree und Haupt-Checkout dieselbe Antwort gibt.

- [ ] **Task 2 — Subkommando `--archive-state <slug> [--repo <dir>]` im Argumentparser.**
      Einstieg vor der Ticket-Auflösung (heute ab Zeile 43 `usage()` / Parser), damit der Pfad
      **ohne** `ticket.sh get` und ohne DB läuft — das ist die Voraussetzung dafür, dass die
      Tests Output statt Quelltext prüfen. Verhalten: den Zustand ermitteln, ihn auf stdout
      schreiben, mit dem Rückgabewert der Funktion enden (0 bei bestimmtem Zustand, ≠ 0 bei
      nicht durchführbarer Messung). `usage()` um die neue Zeile ergänzen.

- [ ] **Task 3 — Schritt 8 rät nicht mehr.**
      Der `else`-Zweig der `ARCHIVE_DIR`-Zuordnung (heute Zeile 373–381) meldet aktuell
      `mark_skip "… existiert nicht mehr (bereits archiviert?)"` — die Abwesenheit des Ordners
      wird als Erledigung gelesen. Ersetzen durch: `ARCHIVE_BRANCH` setzen (die Variable wird
      heute erst **innerhalb** des `if [[ -n "${ARCHIVE_DIR:-}" ]]`-Blocks belegt und muss für
      die Zustandsabfrage vorgezogen werden), dann `_archive_state` aufrufen und verzweigen:

      - `archived` → `mark_skip` wie bisher, jetzt aber belegt statt vermutet.
      - `half` → `ARCHIVE_DIR` auf den Arbeitsbaum setzen, in dem das Archivverzeichnis liegt,
        und in den Resume-Pfad aus Task 4 gehen. **Kein** `mark_skip`.
      - Messung nicht durchführbar → Fehler melden und mit ≠ 0 enden.

- [ ] **Task 4 — Resume-Pfad in der Archiv-Sektion.**
      Innerhalb der bestehenden Subshell (heute ab Zeile 399) `bash scripts/openspec.sh archive`
      überspringen, wenn der Zustand `half` ist. Ein zweiter Aufruf hätte dort keine Wirkung
      außer einem Abbruch: der Change-Ordner existiert nicht mehr (`no such change`) und das
      Archivziel ist bereits belegt (`Archivziel existiert bereits`) — beide Guards greifen
      fail-closed. Alles danach — `task freshness:regenerate`, `git add`, `git commit`,
      `freshness:check`, `git push`, `gh pr create`, `gh pr merge --auto` — bleibt unverändert
      und schließt die vorhandene Verschiebung ab.

      `git checkout -B "$ARCHIVE_BRANCH" origin/main` bleibt ebenfalls unverändert: es nimmt die
      uncommitteten Änderungen mit auf den Archiv-Branch, was im Resume-Fall genau erwünscht ist.

- [ ] **Task 5 — Abschluss am Positiv-Signal belegen.**
      Nach der Subshell steht heute unbedingt `mark_ok "Schritt 8: OpenSpec-Change archiviert
      (Archiv-PR erstellt)"` (Zeile ~496) — eine Behauptung ohne Messung. Davor prüfen, dass
      **beide** positiven Signale vorliegen:

      1. `git ls-remote --exit-code --heads origin "$ARCHIVE_BRANCH"` liefert 0, und
      2. `gh pr list --head "$ARCHIVE_BRANCH" --json number` antwortet erfolgreich **und**
         nichtleer.

      Für (2) den Exit-Code des `gh`-Aufrufs getrennt auswerten, bevor die Ausgabe gelesen wird:
      „gh konnte nicht antworten" und „es gibt keinen PR" erzeugen beide eine leere Ausgabe
      (`repo-hygiene-ops.md` §3, T002523-M7). Fehlt eines der Signale oder scheitert seine
      Abfrage, `mark_err` statt `mark_ok` und mit ≠ 0 enden — ein fehlender Abschluss ist ein
      Fehler des Laufs, kein übersprungener Schritt.

      Prüfen, ob `mark_err` (oder ein gleichwertiger Fehlermarker) im Skript bereits existiert;
      falls nur `mark_ok`/`mark_skip`/`mark_warn` vorhanden sind, den fehlenden Marker analog
      ergänzen.

- [ ] **Task 6 — Regressionstest grün.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/finalize-archive-state.bats
# alle 4 Tests grün
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/post-merge-finalize-guards.bats
# unverändert grün — die bestehenden Guards dürfen nicht brechen
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
