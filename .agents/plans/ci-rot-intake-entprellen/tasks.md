---
title: "CI-Rot-Intake entprellen per Auto-Resolve"
ticket_id: T900759
domains: [ci, scripts, tests]
status: active
file_locks: [scripts/ci-red-intake.sh, taskfiles/Taskfile.ci.yml, .github/workflows/ci-red-intake.yml, tests/spec/ci-red-intake-autoresolve.bats]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ci-rot-intake-entprellen — Implementation Plan

Umsetzung der User-Entscheidung vom 2026-10-07 (Ticket-Timeline): **Option
Auto-Resolve**. Intake sofort bei Rot, automatisches Schließen bei Grün mit
Beleg-Run. Entscheidungen, verworfene Optionen und Prior-Art stehen in
`proposal.md` im selben Ordner.

## File Structure

- `scripts/ci-red-intake.sh`: neues Intake/Auto-Resolve-Skript (Subcommands
  `intake` und `resolve`, Titel-Dedupe plus Mishap-Buffer-Check, fail-closed).
  Neu, Zielgröße deutlich unter dem statischen .sh-Limit (800).
- `taskfiles/Taskfile.ci.yml`: neue Task-Ziele `ci:red-intake` und
  `ci:green-resolve` als S4-Anbindung des Skripts. Neu, klein.
- `Taskfile.yml`: genau eine Include-Zeile für die neue Task-Datei (derzeit
  169 Zeilen, .yml ohne S1-Limit).
- `AGENTS.md`: Bug-Triage-Abschnitt um die Auto-Resolve-Konvention ergänzen
  (derzeit 154 Zeilen, .md ohne S1-Limit).
- `.github/workflows/ci-red-intake.yml`: neuer Scheduled-Poller (15-min-Takt
  plus `workflow_dispatch`), ruft die Task-Ziele, Skip ohne Cluster-Zugriff
  nach Arbitration-Vorbild. Neu, klein.
- `tests/spec/ci-red-intake-autoresolve.bats`: neue Stub-basierte Spec
  (fake-`gh` plus fake-`ticket.sh` per PATH-Override, Vorbild
  `tests/spec/cbm-refresh-cron-A4.bats`). Neu.
- `components/website/src/data/test-inventory.json`: generiert, nur via
  `task test:inventory` aktualisieren.

## Quality budgets

Keine geänderte Datei trägt einen S1-Baseline-Eintrag (`AGENTS.md`,
`Taskfile.yml` und alle neuen Dateien sind nicht in
`docs/code-quality/baseline.json` enthalten; `.md`/`.yml`/`.bats` haben kein
statisches S1-Limit, `.sh` hat 800). Das neue Skript bleibt mit angepeilten
höchstens 250 Zeilen weit unter dem .sh-Limit. S2: keine TS-Imports. S3: keine
Brand-Domain-Literale (Run-URLs kommen aus `gh`-Ausgaben, nie als Literale in
den Plan oder Code). S4: das neue Skript ist über Taskfile-Ziele und den neuen
Workflow erreichbar, kein Orphan. Keine Baseline- oder Ignore-Ausnahme.
Vitest-Abweichung: kein neuer Vitest-Test nötig, weil ausschließlich Shell-,
Workflow- und Dokudateien geändert werden (BATS deckt die Logik ab).

## Tasks

- [ ] **1. RED — Spec anlegen und Rot nachweisen.** `tests/spec/ci-red-intake-autoresolve.bats`
  neu anlegen nach Stub-Vorbild `tests/spec/cbm-refresh-cron-A4.bats`
  (`setup()` mit `REPO_ROOT`, `stub_cli`-Helfer für fake-`gh` und
  fake-`ticket.sh` per PATH-Override, Aufruf-Logs in `$BATS_TEST_TMPDIR`).
  Fälle: Intake legt bei Rot genau ein Ticket mit Titelmuster
  `CI-Rot auf main: <workflow> @ <short-sha> (...)` an; zweite Intake mit
  gleicher SHA legt kein Duplikat an, sondern kommentiert das offene Ticket
  (Dedupe-Guard T001147); Mishap-Buffer-Eintrag gleichen Titels blockt die
  Neuanlage ebenfalls (T002844); `resolve` schließt bei grünem Beleg-Run als
  done mit Beleg-Kommentar (Run-URL plus Head-SHA); `resolve` bei
  unbestimmbarem CI-Status schließt nichts (fail-closed); `AGENTS.md`
  enthält den Auto-Resolve-Abschnitt. Runner-Befehl (jetzt rot, Skript fehlt):

  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/ci-red-intake-autoresolve.bats
  # expected: FAIL — scripts/ci-red-intake.sh existiert noch nicht
  ```

- [ ] **2. Intake- und Resolve-Skript implementieren.** `scripts/ci-red-intake.sh`
  mit `set -u -o pipefail`, Subcommands `intake --sha <sha> --workflow <name>`
  und `resolve --sha <sha>` plus `--dry-run`. `intake`: Rot-Status per
  `gh api repos/<repo>/commits/<sha>/check-runs?filter=latest`
  (Vorbild `scripts/devflow-ci-watch.sh`: nur `failure`/`timed_out` am
  aktuellen HEAD zählen, `cancelled` ist kein Fehler); Dedupe per
  `ticket.sh list --status triage` (Titelvergleich case-insensitiv,
  whitespace-normalisiert) plus `jq`-Suche in `.git/mishap-buffer.json`
  (Datei fehlt bedeutet Buffer leer, kein Fehler); Neuanlage nur ohne Treffer
  als `type=bug`, `areas=ci`, sonst Kommentar ans offene Ticket.
  `resolve`: offene Rot-Tickets suchen, grünen Beleg-Run (`conclusion=success`
  auf aktuellem main-HEAD) verlangen, dann `update-status --status done
  --resolution fixed` mit Beleg-Kommentar. Jeder unbestimmbare Zustand bricht
  ohne Schließung ab (Exit ungleich 0). Danach die Spec aus Task 1 grün laufen
  lassen.

- [ ] **3. Konvention und Task-Anbindung.** `AGENTS.md`-Bug-Triage-Abschnitt
  ergänzen: Auto-Resolve als einzige Rot-Intake-Konvention (sofort anlegen,
  bei Grün mit Beleg-Run als done schließen, Flake hinterlässt kein offenes
  Ticket, Dauer-Rot sofort sichtbar, manuelle Funde per Sofort-Erfassung).
  `taskfiles/Taskfile.ci.yml` neu mit `ci:red-intake` und `ci:green-resolve`
  (rufen das Skript mit main-HEAD-SHA auf, `gh`-Verfügbarkeits-Guard per
  `command -v gh` mit klarem Skip-Hinweis); genau eine Include-Zeile in
  `Taskfile.yml` nach bestehendem Muster ergänzen.

- [ ] **4. Scheduled-Poller-Workflow.** `.github/workflows/ci-red-intake.yml`
  neu: `schedule` alle 15 Minuten plus `workflow_dispatch`, ruft
  `task ci:red-intake` und danach `task ci:green-resolve`. Kubeconfig für
  `ticket.sh` (DB via `kubectl exec` in den shared-db-Pod) nach
  Arbitration-Vorbild (`.github/workflows/arbitration.yml`): scoped Secret,
  `continue-on-error`, Aufräumen per `shred -u`, sichtbarer Skip ohne
  Cluster-Zugriff statt stillem Versagen. Kein Required Check, keine
  Branch-Protection-Änderung.

- [ ] **5. Verify — Inventar plus alle Gates.** `task test:inventory`
  (Spec aus Task 1 registrieren), dann:

  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```

  Erwartung: BATS-Spec grün, Quality-Ratchet (S1 bis S4) grün,
  Baseline-Key-Count unverändert.
