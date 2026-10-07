# Proposal: CI-Rot-Intake entprellen (T900759)

## Pfad-Wahl (Schritt 0)

**feature.** Type=`ci`, neue Automation (Intake-Skript + Auto-Resolve + Scheduled-Poller)
plus Konventions-Doku. Kein Fix-Pfad (kein fehlerhaftes Verhalten mit Reproducer,
kein failing Test gegen bestehende Spec sinnvoll) und kein Chore (Verhaltensänderung:
Tickets entstehen/schließen sich künftig deterministisch statt manuell).

## WARUM

Die Bug-Triage-Konvention (`AGENTS.md`, CFR-Gate G-DORA03) verlangt für jedes Rot
sofort ein Ticket. Stand 2026-09-28: 20 ungesichtete Tickets, davon ~7
Rot-auf-main-Funde vom 26./27., obwohl main aktuell grün war. Flakes und
kurzzeitiges Rot landen unterschiedslos im Backlog (Triage-Stau); manuelles
Sichten jedes Flakes kostet, Nicht-Sichten verdeckt Dauer-Rot.

## WAS (User-Entscheidung 2026-10-07: Option Auto-Resolve)

Ticket sofort anlegen, bei Grün automatisch mit Beleg-Run als done schließen.
Verworfen (begründet, keine offene Gabel):

- **Debounce (Timer N Minuten):** braucht Watchdog-Automation (existiert nicht);
  schweigender Watchdog braucht eigene Überwachung; deckt nur CI-Rot ab.
- **Schwelle (erst ab 2. konsekutivem Rot):** Retry-Semantik je Check-Run ist
  nicht uniform abfragbar; Sonderlogik pro Workflow.
- **Nur-Dedupe verschärfen:** löst den Stau nicht — Flake-Tickets blieben offen,
  bis ein Mensch sie schließt.

Akzeptanz (Ticket): genau eine Option als Konvention in `AGENTS.md`
Bug-Triage-Abschnitt dokumentieren + umsetzen; Flake-Rot hinterlässt kein offenes
Ticket; Dauer-Rot sofort sichtbar; manuelle Funde per Sofort-Erfassung.

## Prior-Art (Schritt 0.7, T002829)

Gesucht: `dedupe|entprell|debounce|auto-resolve` in `docs/adr/` (12 ADRs),
`T001147` repo-weit, Ticket-Intake in `.github/workflows/` + `scripts/`.

- `tests/spec/dev-flow-chore-ticket-ops-mishaps.bats:83,85,111-127` —
  ticket-ops Phase 4 Step 4.4 braucht Title-Dedupe-Guard mit kanonischer
  Referenz T001147 (bzw. T001148); Regression-Marker gegen stille
  Duplikat-Anlage (4 Duplikate T001196/T001197/T001201/T001202 am 2026-06-27).
- `.claude/skills/references/repo-hygiene-ops.md:615-621` — Title-Dedupe-Guard
  [T001210]: vor Anlage case-insensitiv/whitespace-normalisiert nach offenem
  Ticket gleichen Titels suchen; bei Treffer kommentieren/re-triggern statt neu
  anlegen. **Zweitquelle Mishap-Buffer [T002844:623-630]:** Ticket-Suche allein
  meldet „kein Duplikat", obwohl der Befund als Buffer-Eintrag vorliegt
  (beobachtet 2026-08-09, T002830 doppelt erfasst).
- `AGENTS.md:55` — Bug-Triage-Konvention (CFR-Gate G-DORA03): jeder
  Nach-Merge-Fehler als `type=bug`-Ticket; Messung via `bash scripts/vda.sh cfr`.
- `scripts/check-fix-ticket-guard.sh:4-15` — technische Durchsetzung (fix()-Commit
  ohne Ticket-ID wird geblockt).
- `docs/adr/`: **kein Treffer** — kein ADR regelt CI-Rot-Intake; Ticket erklärt
  ADR explizit zum Nicht-Ziel (Owner-Entscheidung 2026-09-28).
- `ticket.sh` erreicht die DB via `kubectl exec … psql` in den shared-db-Pod
  (Beleg: `.github/workflows/arbitration.yml:88-98`); GitHub-gehostete Läufe
  brauchen dafür eine scoped Kubeconfig (Vorbild: `ARBITRATION_KUBECONFIG`,
  `arbitration.yml:100-119`, fail-open mit `continue-on-error`).

Konsequenz: Es gibt **keine** bestehende Auto-Resolve-Entscheidung (Frage
„behalten oder ersetzen" entfällt); der Dedupe-Guard wird **ausgebaut**
(Titel-Dedupe + Mishap-Buffer-Check wandern ins Intake-Skript), nicht ersetzt.

## Brainstorming (A.4) — ohne Lavish-Board

Nicht-interaktive Session: kein Browser-Consent möglich (T002523-M3), Ersatz ist
diese dokumentierte Entscheidung. Offene Gabeln: keine (User-Entscheidung liegt
vor). Kernentscheidungen für den Plan:

1. **Ticket-Typ:** `type=bug`, `areas=[ci]`, Titelmuster
   `CI-Rot auf main: <workflow> @ <short-sha> (<failed-checks>)` — SHA im Titel
   ist der Dedupe-Schlüssel (gleiche SHA = Re-Run/Lärm, neue SHA = neuer Befund).
2. **Close-Semantik:** einheitlich `resolution=fixed` mit Beleg-Kommentar
   (Run-URL + Head-SHA + `conclusion=success`); Flake vs. echter Fix wird nicht
   unterschieden — grün ist der Fix-Nachweis. Kein Debounce-Delay: Dauer-Rot ist
   sofort als Ticket sichtbar.
3. **Fail-closed:** unbestimmbarer CI-Status (gh-Fehler, leere Check-Liste,
   fehlender Cluster-Zugriff) schließt **nie**; Poller degradiert sichtbar
   (Workflow-Run bleibt als solcher sichtbar — anders als der verworfene
   Debounce-Watchdog, dessen Schweigen niemand bemerkt).
4. **Kein neuer Required Check**, keine Baseline-Ausnahme, kein ADR.

## Umsetzungsskizze (3 Tasks, Single-Plan, `--partials 1`)

1. `scripts/ci-red-intake.sh` (neu, `intake` + `resolve`) + Konvention in
   `AGENTS.md` + Targets in `taskfiles/Taskfile.ci.yml` (neu, Include in
   `Taskfile.yml`).
2. `.github/workflows/ci-red-intake.yml` (neu: 15-min-Schedule +
   `workflow_dispatch`, ruft die Targets; Skip bei fehlendem Cluster-Zugriff
   nach Arbitration-Vorbild).
3. `tests/spec/ci-red-intake-autoresolve.bats` (neu, Stub-basiert: fake-`gh` +
   fake-`ticket.sh` via PATH-Override) + `task test:inventory`.

Abweichung vom Skill: kein Plan-Subagent (dieser Runtime stehen keine
Delegations-Tools zur Verfügung); Single-Plan direkt vom Orchestrator aus dem
vollen Brainstorming-Kontext geschrieben. Plan-lint bleibt das harte Gate.
