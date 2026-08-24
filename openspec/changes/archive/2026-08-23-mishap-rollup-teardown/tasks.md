---
title: "mishap-rollup-teardown — Implementation Plan"
ticket_id: T014104
domains: [factory, tickets]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-rollup-teardown — Implementation Plan

## File Structure

```
tests/spec/mishap-tracking/rollup-teardown.bats        (neu, liegt vor) RED-Test des Abbaus
scripts/factory/wakeup.sh                              Aufruf des Rollup-Generators entfernen (Ist 386, Limit 800)
scripts/ticket.sh                                      cmd_rollup_container + Dispatch entfernen (Ist 1138, schrumpft)
scripts/ticket-mcp/go/internal/tools/mishap.go         ROLLUP_-Konstanten + Container-Lookup entfernen (Ist 396, Limit 900)
scripts/hooks/mishap-tracker.sh                        auf Ticket-Kommentar umbauen (Ist 46, Limit 800, Budget 754)
scripts/factory/mishap-rollup.sh                       (loeschen) 516 Zeilen
scripts/factory/rollup-carryover.sh                    (loeschen) 316 Zeilen
scripts/factory/rollup-plan-tasks.sh                   (loeschen) 151 Zeilen
scripts/factory/rollup-archive-janitor.sh              (loeschen) 105 Zeilen
scripts/factory/rollup-recurrence.sh                   (loeschen) 91 Zeilen
scripts/factory/mishap-rollup-artifacts.sh             (loeschen) 72 Zeilen
scripts/factory/rollup-publish.sh                      (loeschen) 66 Zeilen
tests/spec/mishap-rollup/                              (loeschen) 21 Dateien, 1646 Zeilen
openspec/specs/mishap-rollup.md                        (loeschen ueber archive) 424 Zeilen
.claude/skills/mishap-tracker/SKILL.md                 Rollup-Sektionen entfernen (Ist 297, Limit 800)
openspec/changes/mishap-incident-rollup-2026-08-22-*/  (6 Verzeichnisse) regulaer archivieren
```

## Partial-Manifest

Ein Partial. Der Abbau ist ueber `wakeup.sh`, `ticket.sh` und `mishap.go` hart gekoppelt: wer den
Generator loescht, ohne im selben Zug den Aufruf und den Container-Lookup zu entfernen, hinterlaesst
einen Tick, der bei jedem Lauf auf ein fehlendes Skript laeuft. Eine Aufteilung in disjunkte
Datei-Partials waere hier kuenstlich und wuerde Zwischenstaende erzeugen, die schlechter sind als
der Ausgangszustand.

## Tasks

- [ ] **1. Failing test (RED).** Der Test liegt bereits im Branch
      (`tests/spec/mishap-tracking/rollup-teardown.bats`, 6 Faelle). Vor der ersten Aenderung
      erneut laufen lassen und den roten Stand bestaetigen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/mishap-tracking/rollup-teardown.bats
      ```

      expected: FAIL — alle 6 Faelle rot. Jeder Fall traegt einen Positiv-Anker (Datei existiert,
      `ticket.sh help` antwortet mit Exit 0, Nachbar-Spec lebt), damit ein fehlender Pfad den
      Negativ-Check nicht faelschlich gruen faerbt. Rot sind ausschliesslich die Negativ-Checks.

- [ ] **2. Trigger kappen.** In `scripts/factory/wakeup.sh` den Aufruf des Rollup-Generators
      (samt Kommentarblock `T002407/T013304`) entfernen. Der Mishap-Flush davor und der
      `auto-chore-plan`-Schritt danach bleiben unveraendert — nur der Generator-Aufruf faellt.
      Danach Fall 1 des RED-Tests gruen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/mishap-tracking/rollup-teardown.bats -f "wakeup"
      ```

- [ ] **3. Autocreate entfernen.** In `scripts/ticket.sh` die Funktion `cmd_rollup_container`
      (inkl. Step-2-Autocreate, das den Container bei erfolgloser Suche neu anlegt) und ihren
      Eintrag im `case`-Dispatch entfernen. Ebenso die zugehoerige Konstante `ROLLUP_TITLE`, falls
      sie danach unreferenziert ist:

      ```bash
      grep -rn 'ROLLUP_TITLE\|rollup-container' scripts/ | grep -v '^scripts/factory/'
      ```

      Ein Aufruf `bash scripts/ticket.sh rollup-container` MUSS danach mit Exit ungleich 0 enden
      und darf kein Ticket anlegen. Der Usage-Block in `scripts/lib/ticket-help.sh` wird
      mitgezogen, falls er das Kommando nennt.

- [ ] **4. Go-Adapter bereinigen.** In `scripts/ticket-mcp/go/internal/tools/mishap.go` die
      Konstanten `ROLLUP_BRANCH` und `ROLLUP_CHANGE_DIR`, den Typ `rollupTicket`, `parseTicketList`
      und den Container-Lookup ueber `ticket.sh rollup-container` entfernen.
      `buildFactoryFixTicketArgs` und `buildIncidentTicketArgs` bleiben unveraendert — der
      Incident-Pfad ist nicht Gegenstand des Abbaus. Die zugehoerigen Faelle in
      `mishap_test.go` und `mishap_no_conversion_test.go`, die den Rollup-Container pruefen,
      fallen mit. Danach:

      ```bash
      (cd scripts/ticket-mcp/go && go build ./... && go test ./internal/tools/)
      ```

- [ ] **5. Erfassung auf Ticket-Kommentar umbauen.** `scripts/hooks/mishap-tracker.sh` schreibt
      nicht-kritische Mishaps als Kommentar an das Ticket, bei dessen Bearbeitung sie auftraten
      (`ticket.sh comment --id <ticket> --body "MISHAP: ..."`), statt sie in den Rollup-Buffer zu
      geben. Fehlt der Ticket-Kontext, wird der Eintrag auf stderr protokolliert und verworfen —
      Exit 0, kein Ticket, kein Container. Der Incident-Pfad (`incident`/`broken`/`security` →
      je ein Ticket) bleibt unangetastet. Die Ticket-ID wird aus der Umgebung gelesen; wie sie
      dort landet, zeigt der bestehende Aufrufweg:

      ```bash
      grep -rn 'mishap-tracker.sh' .claude/skills/ scripts/
      ```

- [ ] **6. Skripte und Testsuite loeschen.** Die 7 Rollup-Skripte unter `scripts/factory/` und das
      Verzeichnis `tests/spec/mishap-rollup/` per `git rm -r` entfernen. Danach pruefen, dass
      kein Aufrufer zurueckbleibt — ein verwaister Aufruf wuerde als S4-Orphan-Violation auffallen
      oder still zur Laufzeit brechen:

      ```bash
      grep -rn 'rollup-carryover\|rollup-plan-tasks\|rollup-archive-janitor\|rollup-recurrence\|rollup-publish\|mishap-rollup' \
        --include='*.sh' --include='*.yml' --include='*.yaml' --include='*.go' --include='*.mjs' . \
        | grep -v node_modules | grep -v openspec/changes/archive
      ```

      Erwartet: keine Treffer ausserhalb der Change-Artefakte dieses Plans.

- [ ] **7. Skill-Dokumentation nachziehen.** In `.claude/skills/mishap-tracker/SKILL.md` die
      Rollup-Sektionen (Container, Zyklus, Carry-over, Watchlist, Eskalation) entfernen und die
      Beschreibung auf das neue Verhalten stellen: nicht-kritische Mishaps werden Kommentar am
      Verursacher-Ticket, Incidents erzeugen je ein Ticket. Die `description:`-Frontmatter darf
      keinen Rollup-Container mehr versprechen. Ebenso die Erwaehnungen in
      `.claude/skills/OVERVIEW.md` und den `dev-flow-*`-Skills pruefen:

      ```bash
      grep -rn 'Rollup\|rollup' .claude/skills/ | grep -v node_modules
      ```

- [ ] **8. Altlasten aufraeumen.** Die 6 verwaisten Change-Verzeichnisse regulaer archivieren
      (nicht per `rm` — sonst bleibt der half-archive-Check blind), den Rollup-Spec mit
      archivieren, den stehengebliebenen Worktree samt Branch entfernen und den zuletzt erzeugten
      Container schliessen:

      ```bash
      for slug in $(ls openspec/changes/ | grep '^mishap-incident-rollup'); do
        bash scripts/openspec.sh archive "$slug"
      done
      bash scripts/worktree-clean-check.sh .worktrees/mishap-incident-rollup-2026-08-22-T013914-reuse \
        && git worktree remove .worktrees/mishap-incident-rollup-2026-08-22-T013914-reuse --force \
        && git branch -D chore/mishap-incident-rollup-2026-08-22-T013914
      bash scripts/ticket.sh list --title 'Mishap Rollup — fortlaufende Sammlung'
      ```

      Jeden noch offenen Container per `ticket.sh transition-status` auf `done` setzen. Schlaegt
      `worktree-clean-check.sh` fehl (dirty oder fremder Claim), den Worktree stehen lassen und im
      PR-Text vermerken, statt ihn zu erzwingen.

- [ ] **9. Go-Binary neu bauen.** Das laufende `ticket-mcp`-Binary haelt sonst das alte Verhalten,
      auch wenn der Code gemergt ist — ein `(deleted)`-Prozess bedient weiter den alten Lookup.
      Nach dem Merge:

      ```bash
      ps aux | grep -c '[t]icket-mcp'
      (cd scripts/ticket-mcp/go && go build -o ../bin/ticket-mcp ./cmd/ticket-mcp)
      ```

      Laufende Prozesse pruefen und neu starten; der Erfolg wird an den Prozessen gemessen, nicht
      am Code-Stand.

- [ ] **10. Final Verification.** Der neue Test muss vollstaendig gruen sein und die
      Repo-Gates duerfen nicht brechen:

      ```bash
      ./tests/unit/lib/bats-core/bin/bats tests/spec/mishap-tracking/rollup-teardown.bats
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```

      Erwartet: 6/6 gruen, `test:changed` gruen, `freshness:check` gruen. Zusaetzlich der
      Positiv-Beleg, dass der Automat wirklich nicht wiederkehrt — ein Factory-Tick darf keinen
      Container mehr anlegen:

      ```bash
      before=$(bash scripts/ticket.sh list --limit 50 | grep -c 'Mishap Rollup' || true)
      bash scripts/factory/wakeup.sh
      after=$(bash scripts/ticket.sh list --limit 50 | grep -c 'Mishap Rollup' || true)
      echo "Container vorher=$before nachher=$after"; [ "$before" -eq "$after" ]
      ```
