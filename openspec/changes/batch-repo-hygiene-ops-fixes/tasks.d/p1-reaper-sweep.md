# p1 — branch-reaper ticketloser Sweep-Modus (T003074)

## Ziel

branch-reaper.sh filtert hart auf EINE Ticket-ID (`git ls-remote | grep -i -- "$TICKET_ID"`,
Z.120-123) und bricht ohne --ticket mit Exit 2 ab (Z.77) — den §2-Sweep leistet es nicht.

## Steps

1. **RED.** Test in `tests/spec/batch-repo-hygiene-ops-fixes.bats`: `branch-reaper.sh --sweep --dry-run`
   ohne --ticket listet ALLE Remote-Heads mit REAP/KEEP. `expected: FAIL` (Exit 2).

2. **GREEN.** In `scripts/branch-reaper.sh`: `--all`/`--sweep`-Modus ergänzen, der über alle
   Remote-Heads läuft und je Branch REAP/KEEP mit Begründung ausgibt. `--ticket`-Modus bleibt
   (Post-Merge-Aufräumer für ein Ticket).

3. **GREEN — leeres Signal.** Sweep über Bestand ohne verwaiste Branches meldet explizit
   "keine verwaisten Branches gefunden" — unterscheidbar von Fehlschlag (kein vakuoses Exit 0).

4. **Verifikation.** `scripts/branch-reaper.sh --sweep --dry-run` liefert Zeilen; der
   Runbook-Aufruf aus §2 funktioniert.

## Acceptance

- Sweep ohne --ticket möglich (Exit 0 mit Ergebnissen).
- REAP/KEEP je Branch mit Begründung.
- Leerer Bestand unterscheidbar von Fehlschlag.
