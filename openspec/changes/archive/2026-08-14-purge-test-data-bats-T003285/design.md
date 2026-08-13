---
ticket_id: T003285
plan_ref: openspec/changes/purge-test-data-bats-T003285/tasks.md
---

# Design: purge-test-data-bats-T003285 — roter Test, dessen Fix nicht deployed ist

## Goals

- `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` ist auf `main` wieder grün.
- Der Zustand „Test grün nur solange die DB manuell den neuesten Stand hat" ist beendet: der
  Teardown-Pfad ist selbstheilend gegen die One-Shot-Deployment-Lücke.
- Ein erneuter Deployment-Drift der Purge-Funktion wird automatisch sichtbar (lokal und in CI
  prüfbar), statt still zu verrotten.

## Non-Goals

- **Keine** neue Migration unter `migrations/` für die `questionnaire_test_*`-Tabellen — das ist
  das bereits dokumentierte Folge-Ticket aus T002894 (nach T002647-Runner-Stabilisierung), hier
  bewusst ausgeklammert.
- **Keine** Änderung an `tickets.fn_purge_test_data()` selbst — der Code-Fix (v8) ist gemergt und
  korrekt; das Problem ist die Deployment-/Erkennbarkeits-Lücke, nicht die Funktion.
- **Kein** k3d-Bootstrap-Umbau (Init-Skripte in `k3d/shared-db.yaml`), der die Funktion
  reproduzierbar anlegt — größerer infra-Scope, für dieses minor-Ticket nicht gerechtfertigt; die
  Selbstheilung der Fixture deckt den praktischen Pfad ab.
- **Kein** Versuch, den Cluster-Test in CI ausführbar zu machen (kein k3d-Setup in CI): das
  widerspricht der etablierten Skip-by-Design-Konvention (T002182) und ist für einen Testdaten-
  Teardown-Pfad nicht verhältnismäßig.

## Verifizierte Root-Cause (Belege, 2026-08-13)

| # | Befund | Beleg |
|---|--------|-------|
| 1 | Test 2 rot auf main, Test 1 grün | `bats tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` → `not ok 2` (line 88) |
| 2 | Lokale k3d-Dev-DB läuft v6 (kein `to_regclass`-Guard) | `obj_description('tickets.fn_purge_test_data'::regproc)` = „v6 (2026-07-08, T001638)"; `pg_get_functiondef` zeigt unguarded `UPDATE questionnaire_test_status` als ersten Schritt |
| 3 | v8-Fix gemergt, aber nirgends deployed | `scripts/runtime-drift-check.sh` (alle drei Kontexte) → `DRIFT: DB-Funktion tickets.fn_purge_test_data traegt Marker 'to_regclass' nicht` (lokal k3d + fleet/workspace) |
| 4 | Drift-Guard nirgends angebunden | `grep -rn runtime-drift Taskfile.yml .github/workflows/ci.yml` → 0 Treffer |
| 5 | CI kann den Test nie ausführen | Spec-Shard-Job ohne Cluster; `_skip_if_no_db` → `ok`-Skip (T002922 bestätigt) |
| 6 | Installationspfad rein manuell | Kein `purge-fn`-Bezug in Bootstrap/Init/Seed (grep über `k3d/`, `scripts/setup*`, Taskfile); One-Shot-Dateien sind der einzige Träger |

## Decisions

### D1 — Sofort-Fix: v8 auf lokale k3d-Dev-DB und Fleet `workspace` anwenden

`kubectl exec … psql -U postgres -d website < scripts/one-shot/purge-fn-v8.sql` gegen die
`shared-db`-Pods von `k3d-mentolder-dev` und `fleet`/`workspace`. Idempotent
(`CREATE OR REPLACE FUNCTION`), entspricht dem Header-Konvention aller `purge-fn-v*.sql`.
Fleet korczewski braucht **keinen** separaten Apply: beide Brands teilen die `workspace`-DB
(T002689 — „Die Brand wählt ZEILEN, nicht den Ort").
Damit wird der RED→GREEN-Beleg erzeugt und Prod an den gemergten Fix angeglichen.

### D2 — Dauerhaft: Selbstheilung in `purge_factory_test_data()` (Fixture)

Die Fixture `tests/lib/factory-test-fixtures.sh` löst den Pod bereits über
`app in (shared-db, shared-db-dev)` auf. Vor dem `SELECT tickets.fn_purge_test_data()`:

1. Aus der neuesten `scripts/one-shot/purge-fn-v*.sql` die `RUNTIME-CHECK:`-Zeile parsen
   (Regex identisch zu `runtime-drift-check.sh`: `function=<schema>.<fn> marker=<substring>`).
2. Per `pg_proc.prosrc LIKE '%<marker>%'` prüfen, ob die Funktion den Marker trägt.
3. Fehlt er: die Datei via `kubectl exec … psql -d website < datei` einspielen (idempotent).

Begründung: Der Teardown-Pfad ist Test-Infrastruktur — er soll mit dem Stand des Repos arbeiten,
nicht mit dem zufälligen Deploy-Zustand einer manuell gepflegten DB. Das Fixture lehnt Prod-Seeds
ohnehin ab (FACTORY_ALLOW_PROD_SEED), läuft also ausschließlich gegen die lokale Dev-DB — die
Selbstheilung kann Prod nicht antasten. Der Drift-Guard behält seine Funktion für alle anderen
One-Shots und MCP-Binaries; für die Purge-Funktion ist der Testlauf fortan der Heiler, nicht der
Anzeiger. Die Regressions-Simulation (v6 erneut einspielen → Test grün via Selbstheilung) wird
als Verifikationsschritt in den Plan aufgenommen.

### D3 — Drift sichtbar machen: `runtime-drift-check.sh` in `task test:changed` + Selektor-Korrektur

- `task test:changed` bekommt einen Aufruf von `bash scripts/runtime-drift-check.sh` (non-fatal
  bei fehlendem kubectl/Cluster — das Skript skippt selbst). Lokal exit 1 bei Drift → der
  nächste lokale Testlauf meldet eine stale DB-Funktion hart statt still zu heilen (Reihenfolge
  im `test:changed`-Skriptblock: Drift-Check vor den Spec-Tests, damit der Befund vor der
  Selbstheilung sichtbar wird).
- Selektor-Korrektur im Skript: `-l app=shared-db` → `-l 'app in (shared-db,shared-db-dev)'`
  (identisch zur Fixture-Auflösung; verfehlt derzeit Label-Varianten, z. B. `shared-db-dev`).
- In CI läuft `test:changed`-Äquivalente nicht als ganzes; der Drift-Check skippt dort ohnehin
  (kein Cluster) — CI-relevant ist D4.

### D4 — CI-Registrierung des Drift-Kontrakts (offline prüfbar)

`tests/unit/purge-fn-gaps.bats` (existiert, prüft bereits die neueste `purge-fn-v*.sql` statisch)
bekommt einen zusätzlichen Test: die neueste `purge-fn-v*.sql` MUSS eine
`-- RUNTIME-CHECK: function=… marker=…`-Zeile tragen. Damit schützt CI den Marker-Mechanismus
aus T003825 vor stillem Verlust bei künftigen Funktions-Bumps. Die T002922-Frage ist damit
beantwortet: Der Cluster-Test selbst kann in CI nicht laufen (Skip by Design), aber der Kontrakt,
der seine Erkennbarkeit trägt, wird CI-registriert.

## Betroffene Subsysteme

- `tests/lib/factory-test-fixtures.sh` — Selbstheilung im Purge-Pfad (67 → ~90 Zeilen, Budget 733).
- `scripts/runtime-drift-check.sh` — Selektor-Korrektur + kein Funktions-Umbau (159 → ~161 Zeilen, Budget 641).
- `Taskfile.yml` — ein Aufruf im `test:changed`-Block (kein S1-Gate für `.yml`).
- `tests/unit/purge-fn-gaps.bats` — eine neue @test-Assertion (kein S1-Gate für `.bats`).
- `tests/spec/e2e-test-infrastructure/purge-test-data-missing-table.bats` — **unverändert** (der rote Test ist der Vertrag).
- `website/src/data/test-inventory.json` — regeneriert (`task test:inventory`).
- DB-Funktion `tickets.fn_purge_test_data` auf k3d-dev und fleet/workspace — v8 einspielen (operativer Schritt).

## Edge Cases

- **DB ohne jegliche Funktion** (frischer Cluster): Marker-Probe liefert keine Zeile → Einspielen
  legt die Funktion neu an; Teardown und Test laufen.
- **DB mit neuerer Funktion** (v9 irgendwann): Marker-Probe auf v9-Marker → kein Einspielen;
  Selbstheilung greift nur bei fehlendem Marker, nie „abwärts".
- **Korczewski-Brand-Fixtures**: gleiche `workspace`-DB (T002689) — Selbstheilung wirkt dort
  genauso; kein Sonderfall.
- **Nicht erreichbarer Pod**: bestehendes Verhalten (Fehler/Skip der Fixture) bleibt; die
  Selbstheilung schlägt mit demselben Pfad fehl wie der Purge selbst.
