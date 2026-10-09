---
partial: p2
ticket_id: T901630
depends_on: [p1]
status: propose
---

# p2 — Turbolint + Insta-CI (Partial)

Turbolint-Aggregator plus lokale Required-Check-Ausführung für das
Python-Backend `scripts/devflow/`. Alle drei Zieldateien sind neu und
Stdlib-only. Der p1-Dispatch in `scripts/devflow/cli.py` ruft
`turbolint.main(argv)` und `instaci.main(argv)` auf.

## S1-Budgets (Quelle: `docs/code-quality/gates.yaml`, s1.limits)

| path | status | Ist | wirksame Schwelle | Budget |
|------|--------|-----|-------------------|--------|
| `scripts/devflow/turbolint.py` | neu, nicht-baselined | 0 | `.py`-Limit 800 | 800, Ziel ≤ 300 mit Reserve |
| `scripts/devflow/instaci.py` | neu, nicht-baselined | 0 | `.py`-Limit 800 | 800, Ziel ≤ 250 mit Reserve |
| `docs/code-quality/ci-map.yaml` | neu | 0 | `.yaml` steht nicht in s1.limits, daher nicht S1-gated | ohne Limit |

## Task 1: ci-map.yaml als SSOT anlegen

Steps:

1. `docs/code-quality/ci-map.yaml` neu anlegen. Schema: `version: 1`,
   Mapping `checks:` mit je `command:` (Pflicht), `timeout:` in Sekunden
   (Pflicht) und `workdir:` (optional, Default Repo-Root).
2. Genau vier Einträge aufnehmen. Job-IDs wortgleich aus
   `.github/workflows/ci.yml`, Kommandos wortgleich aus den dortigen
   `run:`-Zeilen: `test-bats` mit
   `bash scripts/pytest-run.sh --maxfail=1 tests/py --ignore=tests/py/spec`,
   `test-manifests` mit dem Manifest-pytest-Kommando aus derselben Datei,
   `brett-typescript` mit `npm run typecheck --prefix components/brett`,
   `vitest-website` mit `cd components/website && pnpm lint`.
3. Das Schema auf flache Skalare beschränken (keine Anchors, keine
   Multiline-Strings), damit der Stdlib-Parser aus Task 3 es lesen kann,
   und das Format in einem Kopfkommentar dokumentieren.

Verify:

- `grep -E '^  (test-bats|test-manifests|brett-typescript|vitest-website):' .github/workflows/ci.yml`
  listet alle vier Job-IDs.
- Jede `command:`-Zeile der Map kommt als `run:`-Zeile in
  `.github/workflows/ci.yml` vor (per grep gegengeprüft).

## Task 2: turbolint.py V1 implementieren

Steps:

1. `scripts/devflow/turbolint.py` neu anlegen, Stdlib-only (`argparse`,
   `concurrent.futures`, `hashlib`, `json`, `subprocess`, `sys`), Ziel
   ≤ 300 Zeilen.
2. Genau drei Linter parallel über einen ThreadPoolExecutor ausführen,
   je mit eigenem Timeout: `scripts/plan-lint.sh --json <plan-datei>`
   (positional, Default `.agents/plans/llm-proxy-devflow-tools/tasks.md`),
   `ruff check scripts/devflow/` und `npx tsc --noEmit` mit cwd
   `components/brett` (dort liegt `tsconfig.json`). Fehlt ein
   Linter-Binary (z. B. ruff ist im Repo nicht installiert), wird genau
   dieser Linter als `skipped` mit Warnung markiert statt den Lauf zu
   failen — sichtbar, nie still.
3. File-Hash-Cache führen: sha256 über die Eingabedateien je Linter,
   Ablage `.devflow/cache/turbolint.json`; unveränderte Linter werden
   übersprungen und als `cached` markiert.
4. Ausgabeformate: `--format condensed` (Default, eine Zeile pro Befund
   für Agenten), `--format json` (Top-Level-Keys `results` und
   `summary`); Exit-Codes wie `scripts/plan-lint.sh`: 0 grün, 1
   Hard-Fail, 2 Umgebung (Plan-Datei fehlt oder KEIN Linter lauffähig).
   Einzelne fehlende Linter ergeben `skipped`, nicht Exit 2.
5. API für den p1-Dispatch bereitstellen: `run(plan, format) -> dict`
   und `main(argv) -> int` unter `if __name__ == "__main__"`.

Verify:

- `python3 -m py_compile scripts/devflow/turbolint.py` ist grün.
- `python3 scripts/devflow/turbolint.py --format condensed --plan .agents/plans/llm-proxy-devflow-tools/tasks.md` meldet Exit 0/1 aus den lauffähigen Lintern; fehlendes ruff/tsc erscheint als `skipped`-Eintrag mit Warnung.
- `wc -l scripts/devflow/turbolint.py` bleibt deutlich unter 800.

## Task 3: instaci.py implementieren

Steps:

1. `scripts/devflow/instaci.py` neu anlegen, Stdlib-only, Ziel ≤ 250
   Zeilen; `docs/code-quality/ci-map.yaml` mit einem minimalen
   Zeilen-Parser für das in Task 1 fixierte Flach-Schema lesen
   (kein PyYAML, das kein Stdlib ist).
2. CLI: `instaci.py [job ...]` (Default: alle gemappten Jobs), `--list`
   listet nur die gemappten Job-IDs; je Job gilt das Timeout aus der
   Map, Ausführung sequentiell mit Fortschrittszeile.
3. Ausgabe im GitHub-Annotation-Format (`::error::`, `::warning::`,
   `::notice::`); Exit-Codes wie `scripts/plan-lint.sh`: 0 alle grün,
   1 mindestens ein Job rot, 2 Map fehlt oder ist ungültig oder ein
   Job ist unbekannt.
4. API für den p1-Dispatch bereitstellen: `run(jobs) -> dict` und
   `main(argv) -> int`.

Verify:

- `python3 -m py_compile scripts/devflow/instaci.py` ist grün.
- `python3 scripts/devflow/instaci.py --list` listet die vier Job-IDs
  aus Task 1.
- `python3 scripts/devflow/instaci.py kein-job` meldet Exit 2.

## Task 4: Integration und Abnahme

Steps:

1. Beide Module gegen den p1-Dispatch prüfen: `python3 -m devflow turbolint --help`
   und `python3 -m devflow insta_ci --list` laufen (setzt p1-Stand voraus; bei
   abweichendem Dispatch-Namen nur eigene Funktionsnamen anpassen, kein Eingriff in `scripts/devflow/cli.py`).
2. S1-Reserve prüfen: `wc -l scripts/devflow/turbolint.py scripts/devflow/instaci.py`
   zeigt beide Dateien deutlich unter 800.
3. S4-Erreichbarkeit festhalten: beide Module sind über
   `scripts/devflow/cli.py` (p1) und später `taskfiles/Taskfile.llm.yml`
   (p3) erreichbar, kein Orphan.

Verify:

- `python3 scripts/devflow/turbolint.py --format json --plan .agents/plans/llm-proxy-devflow-tools/tasks.md`
  liefert valides JSON mit den Keys `results` und `summary`.
- `python3 scripts/devflow/instaci.py --list` und der p1-Dispatch aus
  Schritt 1 sind beide grün.
