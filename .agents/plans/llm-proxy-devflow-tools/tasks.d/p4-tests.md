# Partial p4 — Tests (T901630)

Role: tests · depends_on: p1, p2, p3
Targets (beide neu, S1: `.mjs` 800, `.py` 800, je mit Wachstumsreserve):

- `scripts/llm-proxy/devflow-tools.test.mjs`
- `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py`

Referenzen: `scripts/llm-proxy/bge-routes.test.mjs`,
`tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_role_routes.py`,
`tests/CLAUDE.md`.

## Task 1: node-Test für Proxy-Routen

Steps:

1. `scripts/llm-proxy/devflow-tools.test.mjs` nach dem Muster von
   `scripts/llm-proxy/bge-routes.test.mjs` anlegen (`node:test` plus
   `node:assert/strict`, ephemere Ports via `listen(0)`).
2. Routen-Dispatch abdecken: `POST /tools/devflow/turbolint`,
   `/tools/devflow/insta_ci` und `/tools/devflow/sandbox` erreichen
   das Backend; ein unbekanntes Verb liefert 404 mit Error-Envelope.
3. Error-Envelope zusichern: Fehlerantworten haben die Form
   `{error:{code,message}}` mit nicht leerem Code.
4. Backend-Spawning per Stub: ein `PATH`-Stub für `python3 -m devflow`
   legt JSON-Antworten vor; der Test ruft die Route auf und prüft
   Status und Body (Ausführung prüfen, kein Source-Grep).
5. Die neue Testdatei in `taskfiles/Taskfile.test.yml` und
   `.github/workflows/ci.yml` registrieren (der Guard
   `tests/py/spec/native_ported/spec/local-llm-proxy/test_proxy_tests_registered.py`
   verlangt beide Einträge, sonst Orphan-Gate S4).

Verify:

```bash
node --test scripts/llm-proxy/devflow-tools.test.mjs
```

## Task 2: pytest für Python-Backend

Steps:

1. `tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py`
   mit Header-Kommentar zum Prüfmodus (command output verification)
   anlegen; Fixtures `repo_root`, `run_cmd`, `tmp_path` aus
   `tests/py/conftest.py` nutzen.
2. CLI-Verben prüfen: `python3 -m devflow turbolint`, `insta_ci` und
   `sandbox` per `run_cmd` ausführen, Exit-Codes 0/1/2 aus
   `scripts/devflow/cli.py` und JSON auf stdout zusichern.
3. Sandbox-Manifest prüfen: `sandbox create` unter `tmp_path` schreibt
   `.devflow/sandbox.json` mit den Feldern aus
   `scripts/devflow/sandbox.py`; `destroy` entfernt es wieder.
4. Turbolint-Aggregation per Stub-Linter: drei ausführbare Stubs im
   `PATH` (`plan-lint.sh`, `ruff`, `tsc`) liefern grün/rot gemischt;
   der Test sichert das aggregierte Gesamtergebnis plus einen
   Eintrag je Linter. Negativfälle tragen ihren Positiv-Anker im
   selben Test (`tests/CLAUDE.md`).
5. ci-map-Parsing prüfen: `docs/code-quality/ci-map.yaml` laden, jeder
   Eintrag nennt ein ausführbares lokales Kommando.

Verify:

```bash
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py
```

## Task 3: Rot-grün-Nachweis und Verify

Steps:

1. Rot-Lauf zuerst: `scripts/devflow/cli.py` kurz per `git stash push`
   ausblenden, beide Runner laufen lassen, expected: FAIL, danach
   `git stash pop` und grün bestätigen:

```bash
node --test scripts/llm-proxy/devflow-tools.test.mjs
bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/local-llm-proxy/test_devflow_backend.py
```

2. `task test:inventory` ausführen und
   `components/website/src/data/test-inventory.json` mitcommitten.
3. Finale Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Verify: alle drei Gates grün; Commit als
`test(scripts): p4 Rot-gruen-Nachweis fuer devflow-tools [T901630]`.
