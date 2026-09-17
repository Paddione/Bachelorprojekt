---
title: "llm-routing-freetoken-finish — Implementation Plan"
ticket_id: T900213
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llm-routing-freetoken-finish — Implementation Plan

_Ticket: T900213_

## File Structure

```
scripts/llm/routing-check.sh                              (edit)  P1
tests/spec/routing-check-freetoken.bats                    (edit)  P1
tests/spec/local-llm-proxy/factory-default-not-freetoken.bats  (edit)  P1
scripts/llm-proxy/retire-service.sh                       (new)   P2
tests/spec/local-llm-proxy/retire-service-guard.bats      (new)   P2
openspec/changes/llm-routing-freetoken-finish/specs/routing-check-freetoken-t014552.md  (new) P3
openspec/changes/llm-routing-freetoken-finish/specs/software-factory.md                 (new) P3
```

Disjunkt pro Partial; kein Partial beruehrt mehr als ~60 LOC pro Datei.
Reihenfolge ist load-bearing: **P2 erst nach P1 gruen** (nach dem
Service-Stopp wuerde der alte routing-check `Qwen3.6` als FEHLT melden —
Fail-closed mit erreichbarem Backend — und hart rot werden).

## Kontext fuer den Implementierer

- `routing-check.sh` vollstaendig bekannt (Stand origin/main): Probe-Loop
  `for url in http://127.0.0.1:18235 http://127.0.0.1:1234`, dann
  `provider_config`-Loop (fail-closed), dann `autopilot.env`-Block
  (`^ANTHROPIC_(DEFAULT_[A-Z]+_)?MODEL=`). Fail-soft (`exit 0`) wenn
  AVAILABLE leer. Dritte Quelle ans Ende, gleiche Bausteine
  (`grep -qiF`, `FAILED=1`). `opencode.jsonc` ist JSONC (Kommentare!) —
  nicht mit `jq` pur parsen, sondern Kommentar-robusten Abzug
  (`python3` oder `grep -oP '"model"\s*:\s*"\K[^"]+' auf der Top-Level-Zeile;
  Vorsicht: `agent-models.jsonc` hat viele `model`-Felder — Datei ist
  `.opencode/opencode.jsonc`). Provider-Praefix (`llamacpp-local/`)
  abstreifen (Suffix-Match), Cloud-Werte (`zen`, `deepseek`, `https`)
  ueberspringen wie Cloud-`base_url`s.
- T900164-Tests zum Flippen in `factory-default-not-freetoken.bats`:
  `@test "T900164: routing-check.sh probt Port 1919 nicht mehr"` wird zu
  `[T900213] probt :1919, nicht :18235` (Muster wie der T900208-Test in
  derselben Datei: Kommentarzeilen ausnehmen,
  `grep -vE '^[[:space:]]*#'`). Die beiden `!= "freetoken-local"`-Tests
  (Projekt-Default, factory.model) bleiben unangetastet — sie sichern
  Requirement `factory.model vestigial` ab.
- `factory.model` wird NICHT angefasst (weder Wert noch Key): `loadouts.mjs`
  validiert Slug-Existenz, `factory-pin.test.mjs` laeuft in der node-Suite.
- P2-Script: `systemctl --user stop/disable llm-proxy.service` nur mit
  `--confirm`; ohne Flag Usage + Exit 2; bei `CI=true` Verweigerung + Exit 1;
  idempotent (`is-active`-Check: bereits gestoppt = Erfolg). BATS via
  PATH-Stub fuer `systemctl` (Aufrufsequenz stop→disable asserten;
  Verweigerungs-Pfade duerfen den Stub nie aufrufen). Reversibel:
  `systemctl --user enable --now llm-proxy.service` (Unit-Datei
  `scripts/llm-proxy/llm-proxy.service` bleibt). Echte Ausfuehrung auf dem
  WSL-Host erst in dev-flow-execute (Verify), nie in CI.
- P3-Precondition: `openspec/changes/local-llm-freetoken-direct` (T900208)
  muss archiviert sein (merged, aber Change-Dir lag auf origin/main noch
  offen); sonst Delta-Rebase auf `software-factory.md`.
- Mess-Falle: `ss -ltn` im WSL zeigt Windows-seitige Listener (`:1919`,
  `:1234`) nicht — Port-Aussagen nur per `curl` treffen.
- Bekannt defekt, ausserhalb Scope: `task test:changed` meldet
  DB-Drift `tickets.fn_purge_test_data` ohne `to_regclass`-Marker
  (pre-existing, Datei unberuehrt) — im Verify als bekannt vermerken, nicht
  fixen.

## Partials (Ausführungsreihenfolge)

### P1 — routing-check auf die T900208-Welt [T900213]

- RED zuerst: die neuen/geflippten Tests per `bats` laufen lassen, expected fail
  gegen den ungefixten Stand (kein `:1919` in der Probe-Liste, keine
  Promise-Quelle) — erst danach fixen, dann GREEN.
- `scripts/llm/routing-check.sh`: Probe `:18235` → `:1919` (T900164-Kommentar
  aktualisieren: FreeToken seit T900208 einziges lokales
  Generierungs-Backend); dritte Quelle Top-Level-`model` aus
  `.opencode/opencode.jsonc` (Kommentar-robust, Provider-Praefix strippen,
  Cloud-Werte skippen, FEHLT + `FAILED=1` bei erreichbarem Backend).
- `tests/spec/routing-check-freetoken.bats`: Positiv-Test (bestehenden
  gemma12-Test behalten) + Querschnitt-Test Probe-Liste (`:1919` drin,
  `:18235` nicht drin, Kommentarzeilen ausgenommen) + Promise-Quellen-Test
  (Mock-`opencode.jsonc`? Datei ist repo-fix — Test liest echte Datei und
  assertet, dass ihr Default im Live-`:1919`-Katalog steht; Skip wenn `:1919`
  nicht erreichbar).
- `factory-default-not-freetoken.bats`: T900164-1919-Test flippen (s. Kontext).
- Akzeptanz: `bash scripts/llm/routing-check.sh` gruen gegen live `:1919`;
  `test:spec:changed`-Ausschnitt fuer beide BATS-Dateien gruen.

### P2 — Service stilllegen (nach P1 gruen) [T900213]

- `scripts/llm-proxy/retire-service.sh` (neu, s. Kontext) + ausfuehrbar.
- `tests/spec/local-llm-proxy/retire-service-guard.bats` (neu): Verweigerung
  ohne `--confirm`, Verweigerung bei `CI=true`, Happy-Path mit
  systemctl-Stub (Sequenz `stop` → `disable`), Idempotenz-Pfad.
- Akzeptanz: BATS gruen; Script auf Host NICHT ausfuehren (execute-Phase).

### P3 — SSOT-Deltas einbetten [T900213]

- Precondition pruefen: `local-llm-freetoken-direct` archiviert?
  (`git ls-tree origin/main openspec/changes/ --name-only`).
- Deltas (liegen im Change-Dir) gegen Parent-Specs plausibilisieren
  (`routing-check-freetoken-t014552.md`, `software-factory.md`); bei
  T900208-Ueberschneidung Rebase-Vermerk in die Commit-Message.
- `task freshness:regenerate` laufen lassen, damit test-inventory,
  spec-atlas und repo-index die neuen Dateien enthalten.
- Akzeptanz: `freshness:check` gruen.

### P4 — Verify [T900213]

- `tests/spec/routing-check-freetoken.bats`,
  `tests/spec/local-llm-proxy/factory-default-not-freetoken.bats`,
  `tests/spec/local-llm-proxy/retire-service-guard.bats` je einzeln gruen.
- Node-Suite `scripts/llm-proxy/*.test.mjs` (factory-pin!) gruen.
- `bash scripts/llm/routing-check.sh` live gruen (`:1919` antwortet Qwen3.6).
- `task freshness:check` + `task workspace:validate` gruen.
- `task test:changed`: einziger tolerierter Rot-Punkt ist der bekannte
  `fn_purge_test_data`-Drift (vermerken, nicht fixen).
