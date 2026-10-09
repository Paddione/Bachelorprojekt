# p3-tests — Validierungsfälle für validateFlows (T901647)

Rolle: tests · depends_on: p1, p2 · Ticket: T901647
Ziel: `tests/e2e/agent/oracle.test.mjs` (bestehend 110 Zeilen, .mjs-Limit 800, Budget 690) um `validateFlows`-Fälle aus `tests/e2e/agent/oracle.mjs` (p1) erweitern. Alles ohne Browser, im bestehenden `node:test`-Muster der Datei.

## Task 1: validateFlows-Fälle ergänzen

Steps:
1. Import in `tests/e2e/agent/oracle.test.mjs` um `validateFlows` aus `./oracle.mjs` erweitern (Muster: bestehender `evaluateFlow`-Import in Zeile 7).
2. Positivfall: zwei gültige Flows (einer mit `"auth": true` wie `content-hub-editor`, einer ohne Marker wie `smoke-home`) passieren ohne Wurf.
3. Negativfall unbekannter Check-Typ: Flow mit `type: 'cssVisible'` wirft, die Meldung enthält die Flow-ID.
4. Negativfall Marker-Typ: Flow mit `"auth": "yes"` wirft, die Meldung enthält die Flow-ID.
5. Negativfall leere Checks: Flow mit `checks: []` wirft, die Meldung enthält die Flow-ID.
6. Negativfall fehlende Flow-ID: Flow ohne `id`-Feld wirft, die Meldung nennt das fehlende Feld.
7. Rot-grün-Nachweis: einen Negativfall zuerst gegen ungeändertes `tests/e2e/agent/oracle.mjs` laufen lassen — expected: FAIL — danach mit p1-Stand grün bestätigen: `node --test tests/e2e/agent/oracle.test.mjs`

Verify:
- `node --test tests/e2e/agent/oracle.test.mjs` meldet alle Tests grün (11 bestehende plus die neuen validateFlows-Fälle).

## Task 2: Live-Smoke und Abschluss

Steps:
1. Manueller Smoke, kein CI-Gate: einen Auth-Flow aus `tests/e2e/agent/curated.json` mit einer State-Datei aus `.auth/` je einmal mit und ohne `--auth` starten; ohne State bricht der Lauf mit `auth-required` ab, mit State läuft er an.
2. Änderung als `test: validateFlows-Fälle in oracle.test.mjs` committen.

Verify:
- `node --test tests/e2e/agent/oracle.test.mjs` bleibt grün; das Smoke-Ergebnis ist im Ticket T901647 notiert.
