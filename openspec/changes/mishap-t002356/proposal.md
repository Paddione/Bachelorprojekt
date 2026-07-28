# Proposal: mishap-t002356

## Why

Drei aus T002350 protokollierte Mishaps sollen entweder gefixt oder — falls die im
Ticket notierte Hypothese sich als falsch erweist — als widerlegt dokumentiert werden,
statt einen Fix fuer eine nicht existierende Ursache zu bauen.

## What

- **M1** (Negativtests ohne Positiv-Anker): bereits in CLAUDE.md dokumentiert
  ("Positiv-Anker-Pflicht bei Negativtests [T002356-M1]"). Repo-weiter Scan nach
  `case " $x " in *" N "*)`/`! grep`-Mustern durchgefuehrt (Recon, kein Code-Fix noetig
  — der eine konkrete Fall aus dem Mishap, `tests/spec/mcp-gateway.bats`, hat den
  Positiv-Anker bereits).
- **M2** (Ticketstatus in_progress statt plan_staged): Hypothese
  (`reconcile-ticket-status.sh` hebt Tickets automatisch auf in_progress) am Code
  **widerlegt** — das Skript kennt nur fuenf andere Muster und setzt an keiner Stelle
  `status='in_progress'`. Der tatsaechliche Uebergang passiert in
  `scripts/factory/slots.sh` beim Slot-Claim (Dispatch-Zeitpunkt, by design). Diese
  Widerlegung war bereits durch T002375 (PR #3434,
  `tests/spec/openspec-workflow.bats::"T002375-p5: reconcile-ticket-status.sh setzt KEIN
  in_progress (Befund, kein Fix)"`) unabhaengig erbracht und getestet — eigene
  Verifikation kam zum selben Ergebnis, kein weiterer Test noetig (Duplikat vermieden).
- **M3** (`openspec.sh propose` ohne Resume-Pfad): bereits durch T002375 (PR #3434)
  implementiert — `--resume`, `_propose_state_report`, `_is_placeholder_file`,
  `_seed_if_placeholder` existieren bereits auf `main` inkl. Tests. Kein weiterer
  Code-Fix noetig.

_Ticket: T002356_
