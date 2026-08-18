# Proposal: fix-opencode-exec-ci-signal

## Why

`scripts/factory/opencode-exec.sh` meldet nach dem PR-Schritt `pr-ready`
(phase-event done), ohne zu prüfen, ob CI für den PR-HEAD überhaupt lief. Ein
PR mit nie gestarteter CI erscheint in der Telemetrie als verifiziert, bis der
nächste Wakeup-Tick des Scanners das (bisher nicht erkannte) Problem fände.
Sekundärbefund 3 aus T012239.

## What

Nach erfolgreichem `ensure_pr`: best-effort `headRefOid` des PRs lesen und die
check-runs-API (`total_count`) fragen. `total_count == 0` → stderr-Meldung
`ci-never-ran` + `phase_event blocked` statt `done`; sonst die Check-Zahl als
Detail am done-Event. Fail-soft: bei gh-Ausfall bleibt das done-Event — der
PR-Schritt selbst war erfolgreich.

_Ticket: T012266_
