# Proposal: openspec-sh-propose-help

## Why

`bash scripts/openspec.sh propose --help` gibt heute `ERROR: propose requires
--ticket <ext-id>` aus und endet mit Exit 1. Grund: `cmd_propose` nimmt das
erste Argument unbesehen als `<slug>` an (`local slug="${1:-}"`), die
Optionsschleife findet danach nichts mehr, und der Guard in Zeile 105
(`[[ -n "$ticket" ]] || die "propose requires --ticket <ext-id>"`) schlaegt zu.
Wer die Optionen nachschlagen will, bekommt also eine Fehlermeldung ueber eine
andere Option — und keinerlei Hinweis darauf, dass `--target-spec` und
`--resume` ueberhaupt existieren.

`grep -n -- '--help' scripts/openspec.sh` findet keine einzige Behandlung; das
Skript kennt die Option auf keiner Ebene. Die bestehende Requirement
„Unbekannter Verb wird mit Fehler und Usage abgewiesen" in
`openspec/specs/openspec-workflow.md` deckt nur den Verb-Fall ab
(`openspec.sh frobnicate`), nicht die Hilfe zu einem gueltigen Verb.

Dieselbe Klasse Fehler wurde unter T002783 in `scripts/worktree-create.sh`
bereits behoben — dort steht `--help` als erster Block vor allen Guards und
beendet mit 0. Diese Struktur wird uebernommen, statt eine zweite Variante zu
erfinden.

## What

- `scripts/openspec.sh`: `propose --help` behandelt die Hilfe **vor** dem Slug-
  und dem Ticket-Guard, druckt Usage samt Optionsliste (`--ticket`,
  `--target-spec`, `--resume`) und endet mit Exit 0, ohne ein
  Change-Verzeichnis anzulegen und ohne `ticket.sh update-status` aufzurufen.
- Die bestehenden Guards bleiben fuer echte Aufrufe unveraendert scharf:
  fehlendes `--ticket`, fehlender `<slug>` und unbekannte Optionen brechen
  weiterhin mit Exit ungleich 0 ab.
- Neue BATS-Datei `tests/spec/openspec-workflow/propose-help.bats` sichert
  beides ab (drei Tests fuer das neue Verhalten, drei Regressions-Anker fuer
  die Guards).

_Ticket: T002908_
