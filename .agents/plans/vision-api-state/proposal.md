---
title: Brett-Snapshots für Vision-Orakel
ticket_id: T901677
---
# Vorschlag

Beobachtet: apiEquals liest immer aus einem leeren Objekt, selbst wenn der authentifizierte Snapshot Figuren liefert. Ursache verifiziert: `readState(page)` im Runner gibt bedingungslos `apiState: {}` zurück. Der pytest-Reproducer führt genau diese bestehende Funktion aus und stellt sie einem erfolgreichen Snapshot und dem echten Oracle gegenüber.

Rotbeleg auf HEAD `9864c1816`:
```bash
PYTEST_JOBS=0 bash scripts/pytest-run.sh tests/py/spec/e2e-vision-agent/test_api_state.py -q --tb=short
```
Ergebnis: 14 failed, 1 passed. Positive Snapshot-Probe: `false !== true`; Fehlerproben: `Missing expected rejection`; Runner-Integration: Flow-Argument ist undefined. Text-only-Verhalten bleibt grün. Direkter Python-Aufruf konnte pytest nicht importieren; der autoritative Repo-Runner via uv funktioniert.

Minimaler Fix: pure Beobachtungshelfer extrahieren und nur für apiEquals den Admin-Snapshot aus demselben authentifizierten Playwright-Kontext lesen. Der Benutzer hat die Runner-Nachfolge ausdrücklich beauftragt. Das Edit-Verbot in den Brett-Trainingsdaten gehört zu T901676, nicht zum Folgefix T901677; Orakel und kuratierte Erwartungen bleiben unverändert. Infrastruktur/OIDC-Provisionierung aus T901678 ist kein Teil dieses Fixes.
