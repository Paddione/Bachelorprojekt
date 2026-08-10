# p2 — Port-15432-Kollision explizit behandeln (T003384)

## Ziel

Der post-commit-Hook openspec-embed.mjs scheitert bei belegtem Port 15432
(k3d-Portforward) nach 3 Retries still non-fatal — Embeddings fehlen unerkannt.

## Steps

1. **RED.** Test in `tests/spec/batch-openspec-embed-fixes.bats`: simulierte Port-Kollision
   auf 15432 → Embed-Fehler wird mit Portkonflikt-Ursache gemeldet. `expected: FAIL`.

2. **GREEN.** In `scripts/openspec-embed.mjs` (pg.Pool auf localhost:15432):
   - Verbindungsfehler auf Port-15432-Kollision prüfen (ECONNREFUSED/Port belegt).
   - Bei Kollision: freien Port wählen oder eindeutige Fehlermeldung mit Ursache.
   - Die WARN-Meldung nennt den konkreten Fehler statt nur "embed failed".

3. **Verifikation.** Repo aus T003384 (Commits d041220e6, 64f07d0fc): Embedding gelingt
   oder der Fehlschlag ist klar als Portkonflikt attribuiert.

## Acceptance

- Portkonflikt wird als Ursache genannt, nicht verschluckt.
- Embedding läuft nach Portwahl gegen den freien Port.
- Kein stilles non-fatal ohne Diagnose.
