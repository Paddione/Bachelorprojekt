---
title: Vision-Agent lädt authentifizierte Brett-Snapshots
ticket_id: T901677
domains: [test]
status: staged
---
# vision-api-state — Implementation Plan

## File Structure

- `tests/e2e/agent/read-state.mjs`: neuer purer Snapshot-Beobachtungshelfer, Ziel unter 150 Zeilen.
- `tests/e2e/agent/runner.mjs`: Helper importieren, lokale Funktion entfernen, Flow und Base am Oracle übergeben.
- `tests/py/spec/e2e-vision-agent/test_api_state.py`: bereits vorhandener RED-Test für Snapshot und Runner-Integration.
- `components/website/src/data/test-inventory.json`: generiertes Test-Inventar aktualisieren.

## Grenzen und Budgets

S1-Limits aus gates.yaml: mjs und py jeweils 800. Kein betroffener Pfad ist gebaselined. Gemessen mit wc -l; Baseline über exakte S1-Keys geprüft.

| Datei | Ist | Budget |
|---|---:|---:|
| `tests/e2e/agent/runner.mjs` | 252 | 548 |
| `tests/py/spec/e2e-vision-agent/test_api_state.py` | 174 | 626 |

Neue Helper-Datei: Ist 0, wirksame Schwelle 800, geplantes Ziel unter 150. JSON-Inventar unterliegt keinem S1-Extension-Limit. Runner wird durch extract/shrink der lokalen Beobachtungsfunktion netto verkleinert. Keine Baseline- oder Ignore-Ausnahmen. Pure Helper ohne Rückimporte verhindert S2-Zyklen; Base aus Konfiguration statt Brand-Domain. Kein neues Skript unter scripts/, kein Manifest.

## Task 1: Fehlerbeleg und Snapshot-Helper

- [x] RED vor Implementierung reproduzieren (expected: FAIL):
  ```bash
  PYTEST_JOBS=0 bash scripts/pytest-run.sh tests/py/spec/e2e-vision-agent/test_api_state.py -q --tb=short
  ```
  Auf HEAD 9864c1816 verifiziert: 14 failed, 1 passed; bestehende readState-Funktion liefert trotz erfolgreichem Snapshot leeren apiState.
- [x] Neuen pure Helper in `tests/e2e/agent/read-state.mjs` mit `readState(page, flow, base)` implementieren gemäß design.md: nur apiEquals triggert API, URL/Text unverändert.
- [x] Aktuelle Origin prüfen, aktuellen Raum priorisieren; bei fehlendem Raum gleichoriginigen Start-Raum nutzen, sonst vor Request verständlichen Fehler werfen.
- [x] URL-encoded Raum am Admin-Snapshot-Endpunkt mit authentifizierter Context-Request-Instanz laden; Timeout höchstens 10000 ms, maxRedirects 0.
- [x] Status, erwartete Response-URL, JSON und Snapshot-Hülle prüfen; bei Fehler werfen, niemals Erfolg aus Ersatzdaten ableiten.
- [x] Gesamte Hülle `{state, recordedAt}` als apiState liefern. Weder Oracle noch kuratierte Erwartungen ändern.

## Task 2: Runner anschließen und Tests grün machen

- [x] Helper importieren und alte lokale readState entfernen (extract/shrink).
- [x] Finalen Oracle-Aufruf auf `readState(page, flow, BASE)` umstellen. assert-Aktionen bleiben Beobachtungen ohne API-Request.
- [x] Bestehendes rec.error-Catch für Snapshotfehler nutzen; fehlende Admin-Authentifizierung bleibt sichtbarer Fehler und kein pass.
- [x] Node-Verfügbarkeits-Guard und direkte RED-Reproducer-Fallback im Test beibehalten; nach Helper-Erstellung werden alle API-Probes über den exportierten Helper ausgeführt.
- [x] Node-Probes einschließlich echter runFlow-Integration grün ausführen:
  ```bash
  PYTEST_JOBS=0 bash scripts/pytest-run.sh tests/py/spec/e2e-vision-agent/test_api_state.py -q
  ```

## Task 3: Finale Verifikation

- [ ] Test-Inventar regenerieren und generiertes JSON aufnehmen:
  ```bash
  task test:inventory
  ```
- [ ] Mandatory Gates in Reihenfolge ausführen:
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  task workspace:validate
  ```
- [ ] Diff auf Scope, S1-Reserve, keine neuen Baseline-Keys und unverändertes Oracle prüfen; Merge-Receipt mit Check-Evidenz im Ticket persistieren, Plan-Lifecycle-Cleanup erst nach verifiziertem Record.
