---
title: "cbm-normalize-kinds — post-index Kind-Normalisierung fuer K1 (repo-graph-label-cleanup)"
domains: [scripts, test]
status: ready
goal: repo-graph-label-cleanup
---

# cbm-normalize-kinds — Implementation Plan

Zweck (Deutsch): K1 des Goals `repo-graph-label-cleanup` erfuellen — nach
jedem `index_repository`-Lauf mappt ein repo-eigener Normalizer die
Wildwuchs-Kinds (`EnvVar`, `Type`, `DiagramElement`, `Process`,
`Diagram`, `Branch`, `Decorator`) auf die Kern-Taxonomie. Rebuildfest per
Konstruktion, weil der Hook bei jedem Lauf erneut greift. Der Generator
selbst (`codebase-memory-mcp`-Binary) bleibt unangetastet.

## File Structure

- Neu: `scripts/mcp/cbm-normalize-kinds.py` (ca. 130 Zeilen, Limit `.py` 800,
  S4-Abdeckung: Aufruf aus `cbm-single-flight.sh`, siehe Task 3).
- Geaendert: `scripts/mcp/cbm-single-flight.sh` (Ist 97 Zeilen, nicht
  baselined, wirksame Schwelle = Extension-Limit 800 → **Budget 703**,
  Ausbau ca. 8 Zeilen nach erfolgreichem `index_repository`).
- Neu (RED bereits committed): `tests/py/spec/cbm/test_cbm_normalize_kinds.py`.
- S2/S3/CQ02/Vitest: nicht betroffen (kein TS-Graph, keine Brand-Domains,
  keine `components/website`-Dateien).

## Task 1 — RED-Beleg (erledigt, expected: FAIL)

Der failing Test existiert:
`tests/py/spec/cbm/test_cbm_normalize_kinds.py` mit 2 Tests
(`test_apply_maps_wild_labels_to_core`,
`test_dry_run_changes_nothing`). Pruefmodus ist Command-Output-Verifikation:
Skript via `run_cmd` starten, Exit-Code plus resultierenden DB-Zustand
asserten; Positiv-Anker `Function` pro Test gegen vakuoses Gruen.

```bash
cd .worktrees/cbm-normalize-kinds
bash scripts/pytest-run.sh tests/py/spec/cbm/test_cbm_normalize_kinds.py
```

Stand 02.11.2026: `2 failed` (Exit 2, Skript fehlt) — expected: FAIL.

## Task 2 — Normalizer implementieren

`scripts/mcp/cbm-normalize-kinds.py` nach CLI-Vertrag aus `design.md`
(`--db` Pflicht, `--project` optional, Default Dry-Run mit JSON-Bericht,
`--apply` schreibt idempotent). Map-Tabelle aus `design.md`, Stdlib-only,
Exit 0 bei Dry-Run und Apply, Exit 2 bei fehlender DB. Keine neuen
Dependencies, keine Touchpoints ausserhalb `scripts/mcp/`.

Verify: `bash scripts/pytest-run.sh tests/py/spec/cbm/test_cbm_normalize_kinds.py`
muss gruene beide Tests zeigen.

## Task 3 — Hook in cbm-single-flight.sh

Nach erfolgreichem `index_repository` (`CLI_EXIT` 0) den Normalizer mit
`--apply` auf die Projekt-DB aufrufen; Fehler des Normalizers duerfen den
Index-Erfolg nicht kippen (Warnung nach stderr, Exit des Wrappers bleibt).
Projektname aus den bestehenden Args ableiten, Pfad
`~/.cache/codebase-memory-mcp/<projekt>.db`.

Verify: `bash -n scripts/mcp/cbm-single-flight.sh` plus Trockenlauf des
neuen Blocks gegen eine Fixture-DB.

## Task 4 — Pilot-Beleg an einer Live-DB

1. Dry-Run gegen `home-patrick-Bachelorprojekt.db`, Counts protokollieren.
2. `--apply`, danach `get_graph_schema`-Vorher/Nachher diffen: keine
   Wild-Labels mehr, Kern-Counts um die gemappten Mengen gewachsen.
3. Idempotenz: Zweitlauf meldet 0 Aenderungen.
4. K5-Receipts um Dry-Run/Apply-Evidenz ergaenzen (`.zst`-Flanke bleibt
   dokumentiert ausser Scope).

## Task 5 — Finaler Verify-Task

```bash
bash scripts/pytest-run.sh tests/py/spec/cbm/
task test:changed
task test:inventory
task freshness:regenerate
task freshness:check
```

`task test:inventory` ist Pflicht, weil Task 1 ein neues Testmodul bringt;
das regenerierte Inventar wird mitcommittet. Baseline-Key-Count von
`docs/code-quality/baseline.json` gegen `origin/main` pruefen (kein Wachstum).
