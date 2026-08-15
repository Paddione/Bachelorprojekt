# p3 — Tests (Rolle: tests, läuft zuletzt)

## Tasks

- [x] **`tests/spec/sdlc-cockpit/leitstand-livedaten.bats` anlegen (RED zuerst).**
      Output-/Semantik-Verifikation (T002448-M4, T002716), Positiv-Anker-Pflicht (T002356-M1):
      1. *Redirect statt Platzhalter:* Positiv-Anker — `redirect-map.ts` enthält den
         Schlüssel `/sdlc/observability` (grep `-e`, nicht `-F '--…'`-Falle); Negativ —
         `components/website/src/pages/sdlc/observability.astro` existiert nicht mehr.
      2. *LISTEN statt Poll:* Positiv-Anker — `stream.ts` importiert
         `cockpit-listen-hub`; Negativ — kein Daten-`setInterval(poll` mehr (Heartbeat-Timer
         bleibt erlaubt; Assertion auf die Poll-Zeile eingrenzen, nicht auf die ganze Datei).
      3. *Katalog-Konsum:* Positiv-Anker — genau ein Import von `api-inventory.json` unter
         `components/leitstand/`; Registry-Eintrag für `ApiKatalog` vorhanden.
      Header-Kommentar dokumentiert den Prüfmodus (Source-Grep als Querschnittstest, wo sich
      das Ergebnis nur im Quelltext manifestiert; Laufzeit-Checks via vitest/smoke darunter).
- [x] **`lib/sdlc/__tests__/leitstand-kpi.test.ts` (vitest).** Feste Fixture-Zeilen →
      deterministische DORA-Werte; Leere-Eingabe- und Fehlerfeld-Fälle.
- [x] **`middleware/redirect-map.test.ts` anpassen.** Zeichengenauer Spiegel-Eintrag für
      `/sdlc/observability` (Konvention der Datei: Map und Test sind synchron).
- [x] **`scripts/sdlc-cockpit-smoke.mjs` erweitern.** Checks: Kontextzone-Leerlauf enthält
      KPI-Raster-testid, Wissen-Deck enthält Katalog-testid, `/sdlc/api/mcp-health` antwortet
      mit `fetchedAt`-Feld (Semantik, kein Formatanker).
- [x] **`components/website/src/data/test-inventory.json` regenerieren** (`task test:inventory`)
      und committen.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL solange p1/p2 nicht umgesetzt sind (RED-Nachweis dieses Partials)
```
