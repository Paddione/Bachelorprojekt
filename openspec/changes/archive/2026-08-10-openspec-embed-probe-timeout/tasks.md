---
title: "openspec-embed-probe-timeout — Implementation Plan"
ticket_id: T002659
domains: [ops, scripts, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-embed-probe-timeout — Implementation Plan

_Ticket: T002659_

## File Structure

```
scripts/openspec-embed-local.sh                              (geändert — probe_embed() Timeout konfigurierbar, Default 20s statt 3s)
tests/spec/local-llm-proxy/embed-probe-timeout.bats           (neu — bereits geschrieben, rot gegen unreparierte Fassung)
```

**S1-Budget** (Limit `.sh` = 800; `scripts/openspec-embed-local.sh` ist nicht in
`docs/code-quality/baseline.json` erfasst, also ist das statische Limit die wirksame Schwelle):

| Datei | aktuell | Restbudget |
|---|---|---|
| `scripts/openspec-embed-local.sh` | 97 | 703 |

Die Änderung fügt eine Zeile hinzu (Variablenauflösung in `probe_embed()`), kein Split nötig.
`tests/spec/local-llm-proxy/embed-probe-timeout.bats` ist eine neue Testdatei (111 Zeilen,
`.bats`-Limit siehe `gates.yaml` — deutlich unter jedem Extension-Limit).

## Task 1: Failing-Test bereits geschrieben (RED, verifiziert)

`tests/spec/local-llm-proxy/embed-probe-timeout.bats` existiert bereits (Teil dieses
Plan-Commits) und wurde während der Planung gegen den unreparierten
`scripts/openspec-embed-local.sh` verifiziert: der Test startet einen echten, lokalen
HTTP-Server, der `POST /v1/embeddings` erst nach 5 Sekunden mit HTTP 200 beantwortet — über dem
alten hartcodierten `--max-time 3`, aber weit unter jedem sinnvollen neuen Timeout. Der Test
prüft **command output** (kein Source-Grep, T002448-M4): der Wrapper wird tatsächlich
ausgeführt, und `$output` wird auf das Vorhandensein/Fehlen der konkreten Fehlermeldungen
geprüft. Positiv-Anker vor Negativ-Aussage (T002356-M1): zuerst wird geprüft, dass der Wrapper
tatsächlich bis zur nächsten Stufe (Embed-Skript-Aufruf / DB-Fehlerpfad,
`FEHLER: Embedding wurde NICHT indiziert`) vorgedrungen ist, danach erst, dass die
probe-spezifische Meldung `kein Embedding-Backend erreichbar` NICHT mehr auftritt. Ein zweiter
Testfall (Sanity, sofort antwortender Server) dient als Kontrollgruppe und beweist, dass der
Testaufbau selbst funktioniert.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/embed-probe-timeout.bats
# expected: FAIL (rot — gemessen: Test 1 "Wrapper kommt bei einem langsamen ... Backend ueber
#           die Probe hinaus" schlägt fehl, weil der alte 3s-Timeout die Probe bei einem
#           Server mit 5s-Antwortzeit abbrechen lässt und der Wrapper mit
#           "kein Embedding-Backend erreichbar" statt "FEHLER: Embedding wurde NICHT indiziert"
#           abbricht. Test 2 (Sanity, kein Delay) ist bereits grün.)
```

## Task 2: Probe-Timeout konfigurierbar an gemessene Latenz anpassen (GREEN)

In `scripts/openspec-embed-local.sh` Zeile 39-42 (`probe_embed()`): den hartcodierten
`--max-time 3` durch `--max-time "${OPENSPEC_EMBED_PROBE_TIMEOUT:-20}"` ersetzen.

Begründung für den Default-Wert 20: die real gemessene Backend-Latenz liegt stabil bei
10,72s / 10,87s / 10,75s (siehe `openspec/changes/openspec-embed-probe-timeout/proposal.md` §Why,
Quelle: Ticket-Beschreibung T002659). 20s ist etwa das 2-fache der höchsten gemessenen Latenz —
genug Reserve, um normale Schwankungen zu absorbieren, ohne den Fehlerfall (Backend wirklich
down) unzumutbar lange zu verschleppen. `OPENSPEC_EMBED_PROBE_TIMEOUT` bleibt override-fähig für
Umgebungen mit abweichender Latenz (z.B. CI-Sandboxes ohne echtes Backend, die den Wert bewusst
niedrig setzen wollen), ohne den Skript-Code anfassen zu müssen.

Kein weiterer Codepfad ändert sich: der zweite Timeout im Skript (DB-Port-Forward-Wartezeit,
`for _ in $(seq 1 10); ... sleep 1`) ist nicht Teil des gemeldeten Symptoms und bleibt
unverändert (siehe Non-Goals in `proposal.md`).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/embed-probe-timeout.bats
# beide Tests grün
```

## Task 3: Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
