# p3 — backup-tickets restore-check: kubectl-Attach-Download beschädigt (T002727)

## Ziel

`scripts/sdlc/backup-tickets.sh` restore-check lädt Tickets über kubectl-Attach
herunter — die Datei kommt beschädigt an (Restore-Check schlägt fehl, obwohl
das Backup intakt ist).

## Steps

1. **RED.** Test in `tests/spec/quickwins-script-fixes.bats`: Restore-Check mit
   intaktem Backup (Fixture) schlägt fehl wegen beschädigtem Download.
   `expected: FAIL`.

2. **GREEN.** In `scripts/sdlc/backup-tickets.sh` (und betroffenem Restore-Pfad):
   Download über kubectl-Attach auf Integrität prüfen (z.B. Größe, Checksumme,
   gültiges JSON/Format) und bei Beschädigung explizit fehlschlagen statt still
   beschädigte Datei zu verwenden. Falls möglich: stabileren Übertragungsweg nutzen.

3. **Verifikation.** `tests/spec/sdlc-isolation/e3-backup.bats` grün; Fall aus
   T002727 liefert kein falsch-negatives Restore-Ergebnis mehr.

## Acceptance

- Restore-Check erkennt beschädigte Downloads (kein falsches "Restore ok").
- Intaktes Backup besteht den Check (kein falsch-negativ durch Übertragungsfehler).
- Integritätsprüfung (Größe/Checksumme/Format) implementiert.
