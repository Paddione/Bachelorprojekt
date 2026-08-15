## ADDED Requirements

### Requirement: Merged-PR-Dispatch-Gate

Ein Ticket, dessen Fix bereits auf `main` gemergt ist, SHALL nicht erneut dispatchen
oder zurückgesetzt werden — es SHALL geschlossen werden (Status `done`, Resolution nach
Typ). Beide Factory-Pfade, die ein Ticket in den Dispatch-Zustand bringen oder halten,
SHALL denselben Merged-Check anwenden, der `agent-lock.sh check-merged`-Semantik nutzt
(Subject-Grep auf `[T-NNNNNN]` in `git log origin/main`, M2-Regel T002506 — Commit-Body
zählt nicht als Merge-Beleg):

- **Dispatch-Gate** (`schedule.sh`): Ein Kandidat aus `queue.sh`, dessen Ticket-ID in
  einem gemergten Commit-Subject auf `main` erscheint, SHALL weder geclaimed noch
  dispatcht werden; das System SHALL stattdessen das Ticket auf `done` setzen
  (Resolution: `fixed` für Typ `fix`/`bug`, sonst `shipped`), einen Abschluss-Kommentar
  schreiben („Fix bereits auf main gemergt — Ticket geschlossen statt dispatcht") und
  mit dem nächsten Kandidaten fortfahren.
- **Watchdog-Stale-Sweep** (`watchdog.sh`): Ein `in_progress`-Ticket, dessen Ticket-ID
  in einem gemergten Commit-Subject auf `main` erscheint, SHALL NICHT auf
  `triage`/`backlog`/`plan_staged` zurückgesetzt und NICHT eskaliert werden; das System
  SHALL es stattdessen auf `done` setzen (Resolution wie oben), einen
  Abschluss-Kommentar schreiben und den Versuchszähler NICHT fortführen. Slot-Freigabe
  und Zombie-Worktree-Cleanup SHALL unverändert laufen.

Ist `origin/main` nicht verfügbar (rc=2 des Checks), SHALL sich das System fail-open
verhalten (bisheriges Verhalten) und die Situation sichtbar auf stderr melden — ein
Umgebungsfehler darf den Dispatch oder den Watchdog nicht anhalten.

Begründung (Mishap T006297): Der Watchdog-Sturm vom 2026-08-14 (22:41–23:18 UTC) entstand,
weil gemergte Tickets dispatchbar blieben — `queue.sh`/`schedule.sh` hatten keinen
Merged-Check, der Watchdog resettete gemergte `in_progress`-Tickets auf `plan_staged`
(STALE_MIN=0 in der Laufzeit-Umgebung), und die Idle-Retick-Loop dispatchte erneut in
frische Worktrees (Duplikat-Arbeitsrisiko an bereits gemergten Fixes). Der Gate schließt
die Schleife an beiden Kanten.

#### Scenario: Gemergter Dispatch-Kandidat wird geschlossen statt dispatcht

- **GIVEN** Ticket T002279 (Fix bereits in einem gemergten Commit-Subject auf `main`,
  `type=fix`) steht auf `plan_staged`
- **WHEN** `schedule.sh` den Kandidaten verarbeitet
- **THEN** T002279 erscheint NICHT im Launch-Plan; sein Status ist `done` mit
  `resolution=fixed`; ein Kommentar dokumentiert den Abschluss

#### Scenario: Nicht-gemergter Kandidat wird normal dispatcht (Positiv-Anker)

- **GIVEN** Ticket T007777 (kein Merge-Beleg auf `main`) steht auf `plan_staged`,
  Slot frei
- **WHEN** `schedule.sh` den Kandidaten verarbeitet
- **THEN** T007777 erscheint im Launch-Plan; sein Status bleibt `plan_staged`

#### Scenario: Watchdog schließt gemergtes stale Ticket statt Reset

- **GIVEN** Ticket T002279 ist seit 40 Minuten `in_progress`, sein Fix ist auf `main`
  gemergt, es trägt einen `FACTORY-PLAN-REF`
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T002279 erhält `status=done` mit `resolution=fixed` (kein Reset auf
  `plan_staged`); `pipeline_slot=NULL`; ein Abschluss-Kommentar statt eines
  Stale-Kommentars; der Versuchszähler wird nicht fortgeschrieben

#### Scenario: Watchdog resettet nicht-gemergtes stale Ticket unverändert (Positiv-Anker)

- **GIVEN** Ticket T007777 ist seit 40 Minuten `in_progress`, sein Fix ist NICHT auf
  `main` gemergt, es trägt einen `FACTORY-PLAN-REF`
- **WHEN** `watchdog.sh` ausgeführt wird (FACTORY_STALE_MIN=30)
- **THEN** T007777 erhält wie bisher `status=plan_staged`; der Stale-Kommentar wird
  geschrieben; `pipeline_slot=NULL`
