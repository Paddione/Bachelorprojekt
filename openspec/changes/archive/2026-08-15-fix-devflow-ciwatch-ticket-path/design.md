# Design: devflow-ciwatch-ticket-path (T006370)

Brainstorming-Artefakt (Fix-Pfad Schritt 2.8). Vollständige Analyse mit
Symptom/Hypothese-Trennung und Reproducer: siehe `proposal.md` — hier die
Entscheidungslandschaft kompakt.

## Root-Cause (verifiziert, 2026-08-15)

Vier Aufrufe in `scripts/devflow-ci-watch.sh` nutzen `./scripts/ticket.sh` relativ zum
cwd. Nach Worktree-Remove existiert das cwd-Ziel nicht mehr → `No such file or
directory` → `if !`-Guard um assert-phase-chain → Exit 6 mit falscher Behauptung.

## Fix-Ansatz

| Aspekt | Entscheidung |
|---|---|
| Pfadauflösung | `SCRIPT_DIR` aus `BASH_SOURCE[0]`, `TICKET_SH="${TICKET_SH:-$SCRIPT_DIR/ticket.sh}"` (Muster: ticket.sh Z. 361, MAX_CI_ATTEMPTS) |
| Guard | `! -x "$TICKET_SH"` vor assert-phase-chain → Exit 7 + klare Meldung |
| Gate-Semantik | Exit 6 nur bei nachgewiesener Chain-Verletzung (Spec M1 unverändert) |
| Bestandstests | `devflow-ci-watch-merged-exit.bats` auf `TICKET_SH`-Override umstellen |
| Verworfen | `cd`-Workaround (löst Worktree-Fall nicht), Fail-open (bricht Gate) |

## Betroffene Subsysteme

- `scripts/devflow-ci-watch.sh` (Production-Code)
- `tests/spec/ci-cd/devflow-ci-watch-merged-exit.bats` (bestehende Tests — Override)
- `openspec/specs/ci-cd.md`, `openspec/specs/mishap-t002242.md` (Delta-Specs)

## Edge-Cases

1. Worktree während des Laufs entfernt → Guard → Exit 7.
2. Skript aus beliebigem cwd → Auflösung über Skript-Speicherort.
3. `TICKET_SH` gesetzt, aber tot → Guard → Exit 7.
4. Verwandter Change `fix-devflow-ciwatch-cwd-head` (T003612): anderer Scope (Watch-Teil,
   HEAD-Vergleich) — keine Dateiüberschneidung mit diesem Change.
