# p3 — Tests (Rolle: tests, läuft zuletzt)

## Tasks

- [ ] **`tests/spec/sdlc-cockpit/leitstand-help-overlay.bats` anlegen (RED zuerst).**
      Positiv-Anker-Pflicht (T002356-M1), Semantik statt Darstellung (T002716):
      1. Positiv-Anker — Registry ist nicht leer (Node lädt sie und zählt Einträge > 0).
      2. `HelpOverlay.svelte` existiert und referenziert `data-purpose-id`.
      3. Statusband verdrahtet den Toggle (Import-/Store-Beziehung, grep `-e`).
      Header-Kommentar dokumentiert den Prüfmodus.
- [ ] **`tests/spec/sdlc-cockpit/leitstand-absorption.bats` anlegen (RED zuerst).**
      1. Positiv-Anker — `redirect-map.ts` enthält die drei `/sdlc/`-Absorptionsziele.
      2. Negativ — die drei `.astro`-Dateien existieren nicht mehr (je Datei geprüft, damit
         die Kandidatenliste nie leer-trivial besteht).
      3. Kein Cockpit-Ziel in der Map trägt `tab=` (Assertion auf die Ziel-Werte eingrenzen,
         nicht auf die ganze Datei).
- [ ] **`lib/sdlc/__tests__/help-overlay-anchors.test.ts` (vitest).** Lädt die Registry und
      grept die Komponentenquellen der Shell: jeder Registry-Schlüssel hat einen
      `data-purpose-id`-Anker und umgekehrt (beide Richtungen; leere Mengen failen).
- [ ] **`middleware/redirect-map.test.ts` anpassen.** Zeichengenaue Spiegel-Einträge der drei
      neuen Redirects + der normalisierten Alt-Ziele.
- [ ] **`scripts/sdlc-cockpit-smoke.mjs` erweitern.** Checks: `?report=1` setzt die
      `.report`-Klasse; Help-Toggle-testid vorhanden; die drei Redirect-Pfade antworten 301
      auf das jeweilige Deck-Ziel (Semantik: Location-Header-Wert, kein Formatanker).
- [ ] **`components/website/src/data/test-inventory.json` regenerieren**
      (`task test:inventory`) und committen.

## Verifikation

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit*
# expected: FAIL solange p1/p2 nicht umgesetzt sind (RED-Nachweis dieses Partials)
```
