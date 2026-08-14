# Proposal: mishap-rollup-artifacts

## Why

**Symptom (beobachtet, reproduzierbar):** Bei der ersten Anlage des ephemeren
Rollup-Modells (2026-08-14, Container T004899) erzeugte der Generator einen
Zyklus-Change ohne `.ticket`-Datei (T002836) und ohne `specs/`-Delta. Beides
musste manuell nachgelegt werden (Commit `9f0404e54`), weil `openspec.sh
validate` fail-closed ist (`missing specs/ delta dir`, `no .ticket link`) und
jeder Zyklus-PR in CI rot wäre.

**Ursache (belegt):** Der Umbau auf den Zyklus-Slug (T004898/PR #4423) hat die
Artefakt-Erzeugung des alten Generators nicht portiert — `mishap-rollup.sh`
schreibt nur `proposal.md` und `tasks.md`. Zusätzlich behauptet die
Create-Boilerplate in `cmd_rollup_container` weiterhin „Dieses Ticket bleibt
dauerhaft offen." — ein Widerspruch zum ephemeren Closure-Modell.

## What

- Neues Skript `scripts/factory/mishap-rollup-artifacts.sh`: erzeugt aus dem
  Batch-Body (stdin, Flusher-Format) die `.ticket`-Datei (Container-ID) und
  `specs/<slug>.md` (Mishaps als `ADDED Requirements`, eigener Slug als
  Delta-Name — Bundles archivieren mit `--create-new`, plan-archive-steps).
  Der Generator ruft es nach der `tasks.md`-Generierung auf.
- `scripts/ticket.sh` `cmd_rollup_container`: Create-Beschreibung auf die
  ephemeren Closure-Semantik umformulieren.
- SSOT-Delta: MODIFIED „Mishap rollup generates compliant change per run"
  (Generator SHALL erzeugen `.ticket` + `specs/<slug>.md`) und ADDED
  Requirement zur Beschreibungssemantik.
- Tests (RED belegt): `container-create-description.bats` (INSERT-Assertion)
  und `generator-cycle-artifacts.bats` (Skript-Output-Verifikation).

_Ticket: T005031_
