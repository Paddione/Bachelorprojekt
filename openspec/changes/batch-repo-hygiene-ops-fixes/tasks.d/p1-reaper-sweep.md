# p1 — branch-reaper ticketloser Sweep-Modus (T003074)

<!-- S1-Budget: scripts/branch-reaper.sh — Ist 255 - Baseline 0 -> Budget 545 frei (Limit 800) -->

## Ziel

Der §2-Sweep aus repo-hygiene-ops.md war mit dem alten branch-reaper nicht leistbar:
Das Skript filterte hart auf EINE Ticket-ID (`git ls-remote | grep -i -- "$TICKET_ID"`)
und brach ohne --ticket mit Exit 2 ab. **Seit T003180 (PR #4188, auf main) existiert
der `--sweep`-Modus bereits** — dieser Partial sichert ihn gegen die Restlücke ab:
das unterscheidbare Leer-Signal (T003074-Acceptance) und den Runbook-§2-Aufruf.

## Ist-Stand (nach Rebase auf origin/main)

- `scripts/branch-reaper.sh --sweep [--dry-run]` läuft über ALLE Remote-Heads
  (SWEEP-Flag, gegenseitiger Ausschluss mit `--ticket`, ticketloser `--dry-run`).
- Leer-Signal: `if [ "$SWEEP" -eq 1 ]; then echo "keine verwaisten Branches gefunden"` —
  unterscheidbar vom Einzel-Ticket-Pfad ("Nichts zu loeschen.").

## Steps

1. **RED.** Test in `tests/spec/batch-repo-hygiene-ops-fixes.bats`: `branch-reaper.sh --sweep --dry-run`
   ohne --ticket listet ALLE Remote-Heads mit REAP/KEEP; leerer Bestand meldet explizit
   "keine verwaisten Branches gefunden". Diese Tests sind im Ist-Stand bereits GRÜN —
   RED gilt nur für den in p4 dokumentierten Cron-Abbruch (siehe dort).

2. **GREEN — Verifikation.** `scripts/branch-reaper.sh --sweep --dry-run` liefert Zeilen;
   REAP/KEEP je Branch mit Begründung. `--ticket`-Modus bleibt unverändert
   (Post-Merge-Aufräumer für ein Ticket).

3. **GREEN — Runbook-Abruf.** repo-hygiene-ops.md §2 verweist auf den Sweep-Modus
   (`--sweep` statt nur `--ticket T00XXXX`), falls dort noch der alte Einzel-Ticket-Aufruf
   als alleiniger Weg dokumentiert ist (Abgleich in p2).

## Acceptance

- Sweep ohne --ticket möglich (Exit 0 mit Ergebnissen).
- REAP/KEEP je Branch mit Begründung.
- Leerer Bestand unterscheidbar von Fehlschlag (explizite Meldung, kein vakuoses Exit 0).
