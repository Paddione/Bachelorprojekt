---
title: Health-Goals Messung und Statusintegrität reparieren
ticket_id: T016657
domains: [scripts, website, quality]
status: staged
---
# health-goals-integrity — Implementation Plan

## File Structure

Bestehende Produktionsdateien:
- `scripts/sdlc/health-goals-daemon.sh`: vollständige Messung und Fehlerweitergabe.
- `scripts/sdlc/seed-quality-goals.py`: ehrliche historische Messzeit und idempotentes Seed.
- `scripts/health-goals-scan.sh`: vollständiger Scan falls nötig, explizite IDs bleiben gültig.
- `components/website/src/lib/sdlc/goals-data.ts`: gemeinsame Status-/Prozentbewertung.
- `components/website/src/lib/sdlc/goals-data-db.ts`: DB und Snapshot einheitlich normalisieren.
- `components/website/src/lib/sdlc/health-scan.ts`: Ergebnisvalidierung nur wenn erforderlich.
- `components/website/src/pages/sdlc/api/health-goals/rescan.ts`: dauerhafte Messungen vor Erfolg.

Neue reine Module nach Bedarf: `components/website/src/lib/sdlc/goal-evaluation.ts` und `components/website/src/lib/sdlc/goal-measurements.ts`; maximal 300 Zeilen je Modul, keine Rückimporte in Daten- oder API-Schichten. Ein Python-Helper unter `scripts/lib/` darf das Daemon-SQL und Bewertungslogik extrahieren, statt Inline-Python wachsen zu lassen.

Weitere Messdateien: `scripts/health-goals-check.sh`, `scripts/lib/health-goals-measure.sh`, `scripts/lib/cronjob-check.sh`, `scripts/lib/llm-stack-measure.sh`; vorhandene Tests passend erweitern.

Tests:
- `tests/py/spec/health-goals/test_health_pipeline_integrity.py`: echtes Daemon-Verhalten.
- `tests/py/spec/health-goals/test_quality_db_schema.py`: Seed-Zeitstempel und Idempotenz.
- `components/website/src/lib/sdlc/goals-data.test.ts`: Prozentregressionen.
- `components/website/src/lib/sdlc/goals-data-db.test.ts`: Status und Fallback.
- `components/website/src/lib/sdlc/health-goals-rescan.test.ts`: API-Persistenz.
- `components/website/src/data/test-inventory.json`: generiertes Inventar.

## S1 Budgets

health-goals-check.sh besitzt einen eingefrorenen Baseline-Wert 592; plan-lint rechnet hier dennoch gegen das Shell-Limit 800. Deshalb ausdrücklich netto zeilenneutral beziehungsweise extract planen. Alle anderen folgenden Dateien sind nicht gebaselined; wirksame Schwellen: Shell/Python 800, TypeScript 900. Ermittelt auf Branch-Bestand am 14.10.2026 nach Rotphase.

| Datei | Ist | Budget |
| --- | --- | --- |
| `scripts/health-goals-check.sh` | 549 | 251 |
| `scripts/lib/health-goals-measure.sh` | 331 | 469 |
| `scripts/lib/cronjob-check.sh` | 57 | 743 |
| `scripts/lib/llm-stack-measure.sh` | 290 | 510 |
| `scripts/sdlc/health-goals-daemon.sh` | 75 | 725 |
| `scripts/sdlc/seed-quality-goals.py` | 115 | 685 |
| `scripts/health-goals-scan.sh` | 116 | 684 |
| `components/website/src/lib/sdlc/goals-data.ts` | 61 | 839 |
| `components/website/src/lib/sdlc/goals-data-db.ts` | 89 | 811 |
| `components/website/src/lib/sdlc/health-scan.ts` | 84 | 816 |
| `components/website/src/pages/sdlc/api/health-goals/rescan.ts` | 60 | 840 |
| `components/website/src/lib/sdlc/goals-data.test.ts` | 143 | 757 |
| `components/website/src/lib/sdlc/goals-data-db.test.ts` | 28 | 872 |
| `tests/py/spec/health-goals/test_health_pipeline_integrity.py` | 86 | 714 |

Neue Tests und Helper bleiben weit unter 80 Prozent der Grenze. Keine Baseline- oder Ignore-Erweiterung. CQ02 Ausgangswert: 1 explizite any-Verwendung nach der vorgegebenen Messung; keine Erhöhung. Neue Exporte und Handler bleiben typisiert. Keine neuen Importzyklen oder Brand-Domainliterale; neue Shell-/MJS-Dateien werden über vorhandene Aufrufer erreichbar gemacht.

## Task 1 — Regressionen als Rotphase sichern

- [x] Ausführende Tests auf null target, le/ge/eq, unknown/nonfinite, gespeichertes Falschgrün, Snapshot und Prozessfehler überprüfen.
- [x] Rotphase wiederholen (expected: FAIL):
  ```bash
  python3 -m pytest tests/py/spec/health-goals/test_health_pipeline_integrity.py tests/py/spec/health-goals/test_quality_db_schema.py -q
  pnpm --dir components/website exec vitest run src/lib/sdlc/goals-data.test.ts src/lib/sdlc/goals-data-db.test.ts src/lib/sdlc/health-goals-rescan.test.ts
  ```
- [x] Belege: Daemon 8 failed/3 passed, Seed 1 failed/4 passed; Vitest 12 failed/15 passed. Assertions prüfen tatsächlich ausgeführte Ergebnisse und extern ausgegebenes SQL.
- [x] Breiten Defaultscan anhand vollständiger IDs verifizieren; Seed-Idempotenz durch zweimaliges Ausführen ergänzen. Historische Evidenz darf keine frische Messzeit bekommen. Keine beliebige TTL erfinden.

## Task 2 — Einheitliche Bewertung und ehrliche Datenquelle

- [x] Pure Evaluation extrahieren, endliche Werte validieren, Nullziele und Vergleichsrichtung beachten. Gleichheit aus Scan-Ergebnis explizit behandeln; DB-Definitionen lower/higher nicht still umdeuten.
- [x] Gespeicherter Status überstimmt Zahlen nicht. Baseline=Ziel plus Regression ergibt critical/0. Fehlende Evidenz bleibt unknown/null.
- [x] DB, generierte Ziele und Snapshot denselben Regeln unterwerfen; ursprüngliche Messzeit und Quelle erhalten.
- [x] Zwei bestehende Tests mit ungültiger Annahme „cached achieved ohne Zahlen=100“ gezielt korrigieren; gültige Grenzfälle erhalten.
- [x] Gezielte Vitest-Tests grün; zusätzlich le/ge/eq- und missing-baseline-Fälle am neuen Helper.

## Task 3 — Messung, Persistenz und Seed reparieren

- [x] Daemon misst standardmäßig gesamte Zielmenge; optional begrenzte Modi müssen explizit sein. Nicht messbare Werte erzeugen kein erfundenes Grün.
- [x] Scanner-, Parser- und DB-Fehler propagieren; Erfolg nur nach erfolgreichem Speichern. SQL-Werte sicher binden beziehungsweise kontrolliert escapen.
- [x] API-Rescan speichert Ergebnisse atomar über vorhandenen Pool und parametrisierten SQL-Helper; 500 bei Persistenzfehler, Auth- und Validierungsverhalten erhalten.
- [x] Seed aktualisiert Zieldefinitionen idempotent; historische measured_at bleiben ehrlich, identische Historie verdoppelt sich nicht und überdeckt keine neueren Live-Messungen.
- [x] Pytest und Rescan-Vitest grün; bestehende Scanner-, Auth- und DB-Schema-Regressionen mitprüfen.

## Task 4 — Nachweislich fehlerhafte Zielmessungen korrigieren

- [x] G-AGENTIC10 gegen aktuelle bp-run/bp-ship/bp-build Rollen messen, obsolete bachelorprojekt-Rollen entfernen; dispatchende Skills mit realem Routing abgleichen.
- [x] G-IF02 behandelt catch mit rethrow als sichtbaren Fehler statt stille Degradation; catch ohne Log und ohne throw bleibt Verstoß. Verschachtelte Blöcke sauber parsen statt Regex-Fragmente zählen.
- [x] G-CJ01 ignoriert suspendierte und noch nie geplante CronJobs bei Failed-Lauf-Zählung; tatsächlich fehlgeschlagene geplante Jobs bleiben sichtbar.
- [x] K3-Projektstatus liest tatsächliches CLI-Format robust; ready mit positiver node/edge-Anzahl erfüllt das Ziel. Kaputtes Format oder nicht erreichbarer Index bleibt unknown, keine erfundene Null.
- [x] K3-Freshness prüft den kanonischen Hauptcheckout statt zufälligen Agent-Worktree; alte Receipts bleiben stale, aktuelle Hauptcheckout-Receipts sind gültig.
- [x] G-LLM04 bei fehlendem systemctl-Userbus liefert unknown statt drei vermeintlicher Autostart-Verstöße; erreichbarer Bus mit disabled Unit bleibt Verstoß.
- [x] Regressionen mit isolierten CLI/Dateifixtures in bestehende passende Pytest-Suites aufnehmen und expected: FAIL zunächst mit python3 -m pytest nachweisen. Grenzfälle positiv und negativ erhalten.
- [x] Checker-Logik in echte Helper extract beziehungsweise aufteilen; checker bleibt netto zeilenneutral oder schrumpft, keine Gate-Ausnahmen.

## Task 5 — Gesamtlage prüfen und Verify

- [ ] Unveränderten Vollscan reproduzieren und vor/nach gegenüberstellen: 122 Ziele, keine weggefilterten Verstöße. Restliche SKIP-Gründe und Gate-Verstöße mit Messbefehl und Commitstand dokumentieren; Änderungen an Infrastruktur nur innerhalb vorhandener Autorisierung.
- [ ] Test-Inventar regenerieren:
  ```bash
  task test:inventory
  ```
- [ ] Gezielte Tests und Pflichtgates:
  ```bash
  python3 -m pytest tests/py/spec/health-goals/ -q
  pnpm --dir components/website exec vitest run src/lib/sdlc/goals-data.test.ts src/lib/sdlc/goals-data-db.test.ts src/lib/sdlc/health-goals-rescan.test.ts src/lib/sdlc/health-scan.test.ts
  task test:changed
  task freshness:regenerate
  task freshness:check
  task workspace:validate
  ```
- [ ] Bei Merge Plan-Receipt nach tickets.ticket_plans verifizieren und Plan-Delete ausschließlich über vorhandenen Lifecycle durchführen.
