# p3 — Falsche "Backend nicht erreichbar"-Ursache (T003177)

## Ziel

Der post-commit-Hook meldet "Backend nicht erreichbar" auf :8081, obwohl das
Backend HTTP 200 liefert. Gleiche Fehlbilder in T002909 (plan-qa-check) und
T002912 (Postgres). Gemeinsame Ursache prüfen.

## Steps

1. **RED.** Test in `tests/spec/batch-openspec-embed-fixes.bats`: Erreichbarkeits-Check
   schlägt fehl, Backend antwortet 200 → Meldung nennt konkreten Fehler.
   `expected: FAIL` (meldet noch pauschal "nicht erreichbar").

2. **Bestandsaufnahme.** Prüfen, ob `.githooks/post-commit`, `scripts/post-commit-embed.mjs`
   und `scripts/plan-qa-check.sh` denselben Erreichbarkeits-Probe-Code teilen (grep auf
   `curl`, `nc`, `/health`). Falls ja: gemeinsame Ursache beheben statt dreimal einzeln.

3. **GREEN.** Erreichbarkeitsfehler geben den tatsächlichen Fehler aus
   (Timeout? HTTP-Status? DNS?) statt "nicht erreichbar" zu verallgemeinern.

4. **Verifikation.** Nacherhebung aus T003177 (curl 200 + ss -ltnp zeigt Lauscher)
   liefert keine false-unreachable-Meldung mehr.

## Acceptance

- Fehlermeldung nennt konkreten Fehlerzustand.
- Geteilter Probe-Code (falls vorhanden) an einer Stelle behoben.
- Keine pauschale "nicht erreichbar"-Ursache bei erreichbarem Backend.
