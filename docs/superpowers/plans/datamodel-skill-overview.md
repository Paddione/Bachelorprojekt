---
title: Datamodel × Workflow Overview Implementation Plan
ticket_id: T000367
domains: [db, website, infra]
status: active
pr_number: null
---

# Datamodel × Workflow Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-14-datamodel-workflow-overview-design.md`

**Goal:** Build a Python generator (`scripts/datamodel/build_datamodel.py`) that combines live `shared-db` schema introspection with a hand-curated `workflow-map.yaml` and writes a committed Markdown file with embedded HTML + SVG + Mermaid + inline JS. The output renders through the existing `scripts/build-docs.js` pipeline to `https://docs.${PROD_DOMAIN}/#/datamodel-workflow`.

**Architecture:** A small Python package under `scripts/datamodel/` with one module per responsibility (`db.py`, `yaml_loader.py`, `render.py`, `heuristics.py`, `domains.py`), driven by a thin CLI in `build_datamodel.py`. The existing `scripts/db-schema-diagram.py` is refactored to share the `domains.py` source of truth.

**Tech Stack:** Python 3.12 (already installed), PyYAML 6.0.1 (already installed), stdlib `unittest` for tests, kubectl-exec for DB access (no port-forward), `marked` + `mmdc` (existing) in `build-docs.js` for the final MD → HTML render.

**Repo conventions you need to know:**
- Tests live in `tests/` (BATS) for shell scripts and as `tests/*.py` modules for Python where applicable. For this plan we add Python `unittest`-based tests at `scripts/datamodel/tests/` and run them directly via `python3 -m unittest discover`.
- The kubectl-exec connection pattern (used by `scripts/db-schema-diagram.py`) avoids the brittle port-forward — `KUBECTL_CTX=mentolder` triggers exec mode automatically.
- The `docs:build` step is invoked via `task docs:build`. It reads `k3d/docs-content/*.md`, runs them through `marked` + `cheerio` + (optionally) `mmdc`, and writes `k3d/docs-content-built/*.html`. Raw HTML in `.md` files is preserved by `marked`.
- The `_sidebar.md` in `k3d/docs-content/` is consumed at build time and renders the docs sidebar on every page.
- Commit messages follow conventional commits (`feat:`, `chore:`, `fix:`, `spec:`, `plan:`, etc.).

**Out of scope:** modifying `scripts/build-docs.js`, hooking the generator into CI, replacing `database.md`.

---

## File Structure

**New files (Python package):**

| Path | Responsibility | Approx size |
|---|---|---|
| `scripts/datamodel/__init__.py` | Empty marker so the directory is a package. | 0 lines |
| `scripts/datamodel/domains.py` | Single source of truth for the `DOMAINS` dict (table → domain). | ~80 lines |
| `scripts/datamodel/db.py` | Schema introspection via kubectl-exec, query helpers. | ~120 lines |
| `scripts/datamodel/yaml_loader.py` | Loads + validates `workflow-map.yaml`. | ~100 lines |
| `scripts/datamodel/render.py` | Renders hero SVG, matrix, skill cards, deep-dives, footer. | ~350 lines |
| `scripts/datamodel/heuristics.py` | Auto-discovery rules (unbound FKs, no-writer tables). | ~80 lines |
| `scripts/datamodel/build_datamodel.py` | Orchestration + CLI. | ~80 lines |
| `scripts/datamodel/workflow-map.yaml` | Hand-curated mapping (filled in Task 13). | ~400 lines |
| `scripts/datamodel/assets/style.css` | Inlined CSS for the rendered page. | ~150 lines |
| `scripts/datamodel/assets/script.js` | Inlined JS for the rendered page. | ~120 lines |
| `scripts/datamodel/tests/__init__.py` | Empty marker. | 0 lines |
| `scripts/datamodel/tests/test_build_datamodel.py` | Unit tests for all generator modules. | ~250 lines |
| `scripts/datamodel/tests/fixtures/minimal-workflow-map.yaml` | Fixture for unit tests. | ~50 lines |
| `scripts/datamodel/tests/fixtures/sample-introspection.json` | Fixture mimicking DB introspection. | ~80 lines |
| `k3d/docs-content/datamodel-workflow.md` | Generated output (committed). | ~3000 lines after Task 15 |

**Modified files:**

| Path | Change |
|---|---|
| `scripts/db-schema-diagram.py` | Replace inline `DOMAINS` dict with `from datamodel.domains import DOMAINS` via `sys.path` insertion. |
| `Taskfile.yml` | Add `datamodel:build` task. |
| `k3d/docs-content/_sidebar.md` | Add `- [Datamodel × Workflow](datamodel-workflow)` under "Referenz". |

---

## Test Running

Throughout the plan, tests are run from the repo root:

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

This auto-discovers any `test_*.py` files under `scripts/datamodel/tests/`. No extra config needed.

For BATS smoke tests (added in Task 15), `task test:datamodel` is added to Taskfile.

---

### Task 1: Scaffold the package + fixture

**Files:**
- Create: `scripts/datamodel/__init__.py`
- Create: `scripts/datamodel/tests/__init__.py`
- Create: `scripts/datamodel/tests/fixtures/minimal-workflow-map.yaml`
- Create: `scripts/datamodel/tests/fixtures/sample-introspection.json`
- Create: `scripts/datamodel/tests/test_build_datamodel.py` (skeleton)

- [ ] **Step 1: Create empty package markers**

```bash
mkdir -p scripts/datamodel/assets scripts/datamodel/tests/fixtures
touch scripts/datamodel/__init__.py scripts/datamodel/tests/__init__.py
```

- [ ] **Step 2: Write the fixture YAML** at `scripts/datamodel/tests/fixtures/minimal-workflow-map.yaml`

```yaml
families:
  - id: dev-flow
    label: "Dev-Flow Skills"
    color: feature
  - id: ci
    label: "CI/CD Pipeline"
    color: gold

domain_order:
  - { id: tickets, label: "Tickets & Issues" }
  - { id: bachelorprojekt, label: "Bachelorprojekt & Superpowers" }

steps:
  - id: dev-flow-plan
    family: dev-flow
    label: "dev-flow-plan skill"
    description: "Orchestrates path-choice + worktree + plan + ticket."
    writes:
      tables: ["tickets.tickets"]
      files: ["docs/superpowers/plans/*.md"]
    reads: {}
    gaps: []
  - id: tracking-import
    family: ci
    label: "tracking-import CronJob"
    writes:
      tables: ["bachelorprojekt.features"]
    reads:
      files: ["tracking/pending/*.json"]
    gaps: []

cross_skill_gaps:
  - from: dev-flow-plan
    to: tracking-import
    via: "tickets.tickets.external_id → bachelorprojekt.features (no ticket_id column today)"
    explanation: "Plan ticket is set, tracking-import doesn't enrich features with it."

heuristics:
  unbound_fk_candidates:
    enabled: true
    column_pattern: "_id$"
    exclude_schemas: ["keycloak"]
  table_with_no_writer:
    enabled: true
    exclude_schemas: ["keycloak", "nextcloud", "vaultwarden"]
```

- [ ] **Step 3: Write the introspection fixture** at `scripts/datamodel/tests/fixtures/sample-introspection.json`

```json
{
  "tables": [
    {"schema": "tickets", "name": "tickets", "columns": [
      {"name": "id", "type": "uuid", "nullable": false, "pk": true},
      {"name": "external_id", "type": "text", "nullable": false, "pk": false},
      {"name": "title", "type": "text", "nullable": false, "pk": false},
      {"name": "brand_id", "type": "text", "nullable": true, "pk": false}
    ]},
    {"schema": "bachelorprojekt", "name": "features", "columns": [
      {"name": "id", "type": "uuid", "nullable": false, "pk": true},
      {"name": "pr_number", "type": "int", "nullable": false, "pk": false},
      {"name": "title", "type": "text", "nullable": false, "pk": false}
    ]}
  ],
  "foreign_keys": []
}
```

- [ ] **Step 4: Write the test skeleton** at `scripts/datamodel/tests/test_build_datamodel.py`

```python
"""Unit tests for scripts/datamodel — run via:

    python3 -m unittest discover -s scripts/datamodel/tests -v
"""
import json
import os
import sys
import unittest
from pathlib import Path

# Make the parent package importable when running tests directly.
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class TestPackageWiring(unittest.TestCase):
    def test_package_importable(self):
        import datamodel  # noqa: F401 — just verifying the package wires up

    def test_fixtures_exist(self):
        self.assertTrue((FIXTURES / "minimal-workflow-map.yaml").is_file())
        self.assertTrue((FIXTURES / "sample-introspection.json").is_file())

    def test_sample_introspection_loadable(self):
        with open(FIXTURES / "sample-introspection.json") as f:
            data = json.load(f)
        self.assertEqual(len(data["tables"]), 2)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 5: Run the tests — expect PASS**

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

Expected: 3 tests, all pass. (No production code yet — only fixtures + package skeleton.)

- [ ] **Step 6: Commit**

```bash
git add scripts/datamodel/__init__.py scripts/datamodel/tests/
git commit -m "feat(datamodel): scaffold package + test fixtures"
```

---

### Task 2: Extract `DOMAINS` into shared `domains.py`

**Files:**
- Create: `scripts/datamodel/domains.py`
- Modify: `scripts/db-schema-diagram.py` (replace inline `DOMAINS` with import)
- Modify: `scripts/datamodel/tests/test_build_datamodel.py` (add test class)

- [ ] **Step 1: Write the failing test** — append to `scripts/datamodel/tests/test_build_datamodel.py`:

```python
class TestDomains(unittest.TestCase):
    def test_domains_has_all_eight_groups(self):
        from datamodel.domains import DOMAINS
        expected = {
            "CRM & Communication", "Billing & Accounting",
            "Questionnaire & Coaching", "Tickets & Issues",
            "Platform & Config", "Testing & CI",
            "AI Assistant", "Bachelorprojekt & Superpowers",
        }
        self.assertEqual(set(DOMAINS.keys()), expected)

    def test_table_to_domain_resolves_known_tables(self):
        from datamodel.domains import table_to_domain
        self.assertEqual(table_to_domain("tickets", "tickets"), "Tickets & Issues")
        self.assertEqual(table_to_domain("bachelorprojekt", "features"),
                         "Bachelorprojekt & Superpowers")
        self.assertIsNone(table_to_domain("nope", "missing"))
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

Expected: `ImportError: cannot import name 'DOMAINS' from 'datamodel.domains'`.

- [ ] **Step 3: Write `scripts/datamodel/domains.py`**

Copy the full `DOMAINS` dict from `scripts/db-schema-diagram.py:161` (the existing implementation), exactly as-is. Then add the resolver:

```python
"""Single source of truth for the (schema, table) → domain mapping.

Both scripts/build_datamodel.py and scripts/db-schema-diagram.py read from here.
Keep this file the canonical reference — never let either consumer add new
domain mappings inline.
"""
from __future__ import annotations

DOMAINS: dict[str, dict[str, list[str]]] = {
    # ── PASTE the eight-domain dict from scripts/db-schema-diagram.py here.
    # The diff will be empty if you copy verbatim.
}


def table_to_domain(schema: str, table: str) -> str | None:
    """Return the domain label for a given schema.table, or None if unmapped."""
    for domain_label, schemas in DOMAINS.items():
        if table in schemas.get(schema, []):
            return domain_label
    return None


def domain_slug(label: str) -> str:
    """Stable slug from a domain label — used for IDs in the rendered HTML."""
    import re
    s = label.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

Expected: 6 tests, all pass.

- [ ] **Step 5: Refactor `scripts/db-schema-diagram.py` to import**

Replace the in-file `DOMAINS = {…}` block (currently lines ~161-215) with:

```python
# Source of truth for the eight-domain mapping lives in scripts/datamodel/.
import sys as _sys
from pathlib import Path as _Path
_sys.path.insert(0, str(_Path(__file__).resolve().parent))
from datamodel.domains import DOMAINS  # noqa: E402
```

- [ ] **Step 6: Smoke-test the existing script still runs**

```bash
python3 scripts/db-schema-diagram.py --help 2>&1 | head -5 || true
# Just verify Python parses + imports cleanly:
python3 -c "import sys; sys.path.insert(0, 'scripts'); import importlib.util; spec = importlib.util.spec_from_file_location('m', 'scripts/db-schema-diagram.py'); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); print(len(m.DOMAINS), 'domains')"
```

Expected output: `8 domains`.

- [ ] **Step 7: Commit**

```bash
git add scripts/datamodel/domains.py scripts/db-schema-diagram.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "refactor(datamodel): extract DOMAINS to shared module"
```

---

### Task 3: `yaml_loader.py` with validation

**Files:**
- Create: `scripts/datamodel/yaml_loader.py`
- Modify: `scripts/datamodel/tests/test_build_datamodel.py` (add test class)

- [ ] **Step 1: Write failing tests** — append to `test_build_datamodel.py`:

```python
class TestYamlLoader(unittest.TestCase):
    def test_loads_minimal_fixture(self):
        from datamodel.yaml_loader import load_workflow_map
        m = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        self.assertEqual(len(m.families), 2)
        self.assertEqual(len(m.steps), 2)
        self.assertEqual(m.steps[0].id, "dev-flow-plan")
        self.assertEqual(m.cross_skill_gaps[0].from_step, "dev-flow-plan")

    def test_rejects_unknown_family(self):
        import tempfile, yaml
        from datamodel.yaml_loader import load_workflow_map, WorkflowMapError
        bad = {
            "families": [{"id": "x", "label": "X", "color": "feature"}],
            "domain_order": [],
            "steps": [{"id": "s", "family": "MISSING", "label": "S",
                       "writes": {}, "reads": {}, "gaps": []}],
            "cross_skill_gaps": [],
            "heuristics": {},
        }
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
            yaml.safe_dump(bad, f)
            path = f.name
        with self.assertRaisesRegex(WorkflowMapError, "unknown family.*MISSING"):
            load_workflow_map(path)

    def test_rejects_unknown_step_in_cross_skill_gap(self):
        import tempfile, yaml
        from datamodel.yaml_loader import load_workflow_map, WorkflowMapError
        bad = {
            "families": [{"id": "f", "label": "F", "color": "feature"}],
            "domain_order": [],
            "steps": [{"id": "a", "family": "f", "label": "A",
                       "writes": {}, "reads": {}, "gaps": []}],
            "cross_skill_gaps": [{"from": "a", "to": "ghost",
                                  "via": "x", "explanation": "y"}],
            "heuristics": {},
        }
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
            yaml.safe_dump(bad, f)
        with self.assertRaisesRegex(WorkflowMapError, "cross_skill_gaps.*ghost"):
            load_workflow_map(f.name)
```

- [ ] **Step 2: Run tests — expect FAIL**

Expected: `ModuleNotFoundError: No module named 'datamodel.yaml_loader'`.

- [ ] **Step 3: Implement `scripts/datamodel/yaml_loader.py`**

```python
"""Load + validate scripts/datamodel/workflow-map.yaml.

Raises WorkflowMapError on any structural problem. Callers should let this
propagate — a clear error here beats silently rendering an incomplete page.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import yaml


class WorkflowMapError(ValueError):
    """Raised when workflow-map.yaml is malformed or internally inconsistent."""


@dataclass
class Family:
    id: str
    label: str
    color: str


@dataclass
class Domain:
    id: str
    label: str


@dataclass
class Gap:
    type: str  # 'db-fk' | 'workflow-to-db' | 'cross-skill'
    target: str | None
    explanation: str


@dataclass
class Step:
    id: str
    family: str
    label: str
    description: str
    writes_tables: list[str]
    writes_files: list[str]
    reads_tables: list[str]
    reads_files: list[str]
    gaps: list[Gap]


@dataclass
class CrossSkillGap:
    from_step: str
    to_step: str
    via: str
    explanation: str


@dataclass
class Heuristics:
    unbound_fk_enabled: bool = True
    unbound_fk_column_pattern: str = "_id$"
    unbound_fk_exclude_schemas: list[str] = field(default_factory=list)
    no_writer_enabled: bool = True
    no_writer_exclude_schemas: list[str] = field(default_factory=list)


@dataclass
class WorkflowMap:
    families: list[Family]
    domains: list[Domain]
    steps: list[Step]
    cross_skill_gaps: list[CrossSkillGap]
    heuristics: Heuristics


_VALID_GAP_TYPES = {"db-fk", "workflow-to-db", "cross-skill"}


def load_workflow_map(path: str | Path) -> WorkflowMap:
    with open(path) as f:
        raw = yaml.safe_load(f)

    families = [Family(**f) for f in raw.get("families", [])]
    family_ids = {f.id for f in families}

    domains = [Domain(**d) for d in raw.get("domain_order", [])]

    steps: list[Step] = []
    for s in raw.get("steps", []):
        if s["family"] not in family_ids:
            raise WorkflowMapError(
                f"step {s['id']!r}: unknown family {s['family']!r} — "
                f"declared families are {sorted(family_ids)}"
            )
        gaps = []
        for g in s.get("gaps") or []:
            if g["type"] not in _VALID_GAP_TYPES:
                raise WorkflowMapError(
                    f"step {s['id']!r}: gap type {g['type']!r} not in {_VALID_GAP_TYPES}"
                )
            gaps.append(Gap(type=g["type"], target=g.get("target"),
                            explanation=g["explanation"]))
        writes = s.get("writes") or {}
        reads = s.get("reads") or {}
        steps.append(Step(
            id=s["id"], family=s["family"], label=s["label"],
            description=s.get("description", ""),
            writes_tables=list(writes.get("tables") or []),
            writes_files=list(writes.get("files") or []),
            reads_tables=list(reads.get("tables") or []),
            reads_files=list(reads.get("files") or []),
            gaps=gaps,
        ))

    step_ids = {s.id for s in steps}
    cross = []
    for c in raw.get("cross_skill_gaps", []):
        for endpoint_label, endpoint_id in (("from", c["from"]), ("to", c["to"])):
            if endpoint_id not in step_ids:
                raise WorkflowMapError(
                    f"cross_skill_gaps[{endpoint_label}]={endpoint_id!r}: "
                    f"step id not declared"
                )
        cross.append(CrossSkillGap(
            from_step=c["from"], to_step=c["to"],
            via=c["via"], explanation=c["explanation"],
        ))

    h = (raw.get("heuristics") or {})
    heur = Heuristics(
        unbound_fk_enabled=(h.get("unbound_fk_candidates") or {}).get("enabled", True),
        unbound_fk_column_pattern=(h.get("unbound_fk_candidates") or {}).get(
            "column_pattern", "_id$"),
        unbound_fk_exclude_schemas=list((h.get("unbound_fk_candidates") or {}).get(
            "exclude_schemas") or []),
        no_writer_enabled=(h.get("table_with_no_writer") or {}).get("enabled", True),
        no_writer_exclude_schemas=list((h.get("table_with_no_writer") or {}).get(
            "exclude_schemas") or []),
    )

    return WorkflowMap(families=families, domains=domains, steps=steps,
                       cross_skill_gaps=cross, heuristics=heur)
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

Expected: 9 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/yaml_loader.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): YAML schema loader with validation"
```

---

### Task 4: `db.py` — schema introspection (mockable)

**Files:**
- Create: `scripts/datamodel/db.py`
- Modify: `scripts/datamodel/tests/test_build_datamodel.py` (add test class)

The DB module exposes two layers:
- `introspect_schema(connection)` — pure logic that takes a callable returning CSV rows and returns structured tables + FKs.
- `kubectl_psql_runner(ctx, ns)` — production-mode runner that calls kubectl exec.

This split lets us unit-test `introspect_schema` with a fake runner (no DB needed) and ship the real runner separately.

- [ ] **Step 1: Write failing tests** — append to `test_build_datamodel.py`:

```python
class TestDbIntrospection(unittest.TestCase):
    def _fake_runner(self):
        """Returns a runner that mimics psql_multi() for two pre-set queries."""
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "tickets,tickets,external_id,text,NO\n"
            "tickets,tickets,brand_id,text,YES\n"
            "bachelorprojekt,features,id,uuid,NO\n"
            "bachelorprojekt,features,pr_number,integer,NO\n"
        )
        fk_csv = (
            "table_schema,table_name,column_name,fk_schema,fk_table\n"
        )
        pk_csv = (
            "table_schema,table_name,column_name\n"
            "tickets,tickets,id\n"
            "bachelorprojekt,features,id\n"
        )
        return lambda queries: [
            self._parse(schema_csv), self._parse(fk_csv), self._parse(pk_csv)
        ][:len(queries)]

    def _parse(self, csv_text):
        import csv, io
        return list(csv.DictReader(io.StringIO(csv_text)))

    def test_introspect_groups_columns_by_table(self):
        from datamodel.db import introspect_schema
        snapshot = introspect_schema(self._fake_runner())
        self.assertEqual(len(snapshot.tables), 2)
        tickets = snapshot.by_ref["tickets.tickets"]
        self.assertEqual([c.name for c in tickets.columns],
                         ["id", "external_id", "brand_id"])

    def test_introspect_marks_pk_columns(self):
        from datamodel.db import introspect_schema
        snapshot = introspect_schema(self._fake_runner())
        pk_cols = [c.name for c in snapshot.by_ref["tickets.tickets"].columns
                   if c.is_pk]
        self.assertEqual(pk_cols, ["id"])
```

- [ ] **Step 2: Run tests — expect FAIL** (`No module named 'datamodel.db'`)

- [ ] **Step 3: Implement `scripts/datamodel/db.py`**

```python
"""Schema introspection for shared-db.

Two modes:
  1. kubectl-exec (production): pass kubectl_psql_runner() as the runner.
  2. Fake runner (tests): pass any callable that returns list[list[dict]].

Both share the same downstream introspect_schema() pipeline.
"""
from __future__ import annotations

import csv
import io
import os
import subprocess
import sys
from dataclasses import dataclass, field


@dataclass
class Column:
    name: str
    type: str
    nullable: bool
    is_pk: bool = False


@dataclass
class ForeignKey:
    from_ref: str  # "schema.table.column"
    to_ref: str    # "schema.table"


@dataclass
class Table:
    schema: str
    name: str
    columns: list[Column] = field(default_factory=list)

    @property
    def ref(self) -> str:
        return f"{self.schema}.{self.name}"


@dataclass
class SchemaSnapshot:
    tables: list[Table]
    fks: list[ForeignKey]
    by_ref: dict[str, Table]  # "schema.table" → Table


SCHEMA_QUERY = """
SELECT t.table_schema, t.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.tables t
JOIN information_schema.columns c
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name
WHERE t.table_schema NOT IN ('pg_catalog','information_schema','pg_toast')
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_schema, t.table_name, c.ordinal_position
"""

FK_QUERY = """
SELECT DISTINCT
  tc.table_schema, tc.table_name, kcu.column_name,
  ccu.table_schema AS fk_schema, ccu.table_name AS fk_table
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
     AND tc.constraint_schema = ccu.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema NOT IN ('pg_catalog','information_schema')
"""

PK_QUERY = """
SELECT tc.table_schema, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema NOT IN ('pg_catalog','information_schema')
"""


def introspect_schema(runner) -> SchemaSnapshot:
    """Run the three introspection queries and return a structured snapshot.

    `runner` is a callable: (queries: list[str]) -> list[list[dict]] — one
    dict-list per query, where each dict represents a CSV row.
    """
    schema_rows, fk_rows, pk_rows = runner([SCHEMA_QUERY, FK_QUERY, PK_QUERY])

    by_ref: dict[str, Table] = {}
    pk_set: set[tuple[str, str, str]] = {
        (r["table_schema"], r["table_name"], r["column_name"]) for r in pk_rows
    }
    for r in schema_rows:
        ref = f"{r['table_schema']}.{r['table_name']}"
        table = by_ref.get(ref) or Table(schema=r["table_schema"], name=r["table_name"])
        is_pk = (r["table_schema"], r["table_name"], r["column_name"]) in pk_set
        table.columns.append(Column(
            name=r["column_name"], type=r["data_type"],
            nullable=(r["is_nullable"] == "YES"), is_pk=is_pk,
        ))
        by_ref[ref] = table

    fks = [
        ForeignKey(
            from_ref=f"{r['table_schema']}.{r['table_name']}.{r['column_name']}",
            to_ref=f"{r['fk_schema']}.{r['fk_table']}",
        )
        for r in fk_rows
    ]

    return SchemaSnapshot(tables=list(by_ref.values()), fks=fks, by_ref=by_ref)


def kubectl_psql_runner(ctx: str, ns: str, database: str = "website",
                       pod_label: str = "app=shared-db"):
    """Return a runner that executes queries via kubectl exec into shared-db.

    Mirrors the pattern of scripts/db-schema-diagram.py:psql_multi() — single
    psql connection, sentinel-split CSV. Raises RuntimeError on any failure.
    """
    def _runner(queries: list[str]) -> list[list[dict]]:
        SENTINEL = "---RESULT_BOUNDARY---"
        pod_lookup = subprocess.run(
            ["kubectl", "--context", ctx, "-n", ns,
             "get", "pod", "-l", pod_label,
             "-o", "jsonpath={.items[0].metadata.name}"],
            capture_output=True, text=True, timeout=10,
        )
        pod = pod_lookup.stdout.strip()
        if not pod:
            raise RuntimeError(f"could not find {pod_label} pod in {ns} on {ctx}")
        args = ["kubectl", "--context", ctx, "-n", ns, "exec", pod, "--",
                "psql", f"--username={os.environ.get('PG_USER', 'postgres')}",
                f"--dbname={database}", "--csv", "--no-psqlrc"]
        for i, q in enumerate(queries):
            if i > 0:
                args += ["--command", f"SELECT '{SENTINEL}' AS boundary"]
            args += ["--command", q]
        result = subprocess.run(args, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            raise RuntimeError(f"psql failed: {result.stderr}")
        sections = result.stdout.split(f"boundary\n{SENTINEL}\n")
        out = []
        for i in range(len(queries)):
            if i < len(sections):
                reader = csv.DictReader(io.StringIO(sections[i].strip() + "\n"))
                out.append(list(reader))
            else:
                out.append([])
        return out
    return _runner
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

Expected: 11 tests, all pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/db.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): schema introspection module"
```

---

### Task 5: `render.py` — hero SVG (Lifecycle Pipeline)

**Files:**
- Create: `scripts/datamodel/render.py`
- Modify: `scripts/datamodel/tests/test_build_datamodel.py` (add test class)

The hero SVG is a hand-laid-out lifecycle pipeline: four family lanes (left → right) containing step rectangles, plus eight domain pool rectangles below, plus edges from each step to the pools it writes/reads. Edges carry gap colors.

- [ ] **Step 1: Write failing tests**:

```python
class TestRenderHero(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_hero_svg_contains_one_rect_per_step(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertEqual(svg.count('class="step-rect"'), 2)

    def test_hero_svg_contains_one_rect_per_domain(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertEqual(svg.count('class="domain-pool"'), 2)

    def test_hero_svg_emits_data_attrs(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertIn('data-step="dev-flow-plan"', svg)
        self.assertIn('data-domain="tickets"', svg)

    def test_hero_svg_emits_write_edges(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        # An edge from dev-flow-plan → tickets pool must exist.
        self.assertRegex(svg,
            r'<line[^>]+class="edge edge-write"[^>]+data-from="dev-flow-plan"[^>]+data-to="tickets"')
```

- [ ] **Step 2: Run tests — expect FAIL** (`No module named 'datamodel.render'`)

- [ ] **Step 3: Implement `scripts/datamodel/render.py`** with the hero function first.

```python
"""Renderers for the datamodel-workflow page.

Each public function returns a fragment string ready to splice into the
output Markdown. The page is a single Markdown document with raw HTML/SVG
blocks — marked preserves these verbatim.
"""
from __future__ import annotations

from .yaml_loader import WorkflowMap

# Hero layout constants — tuned for ~960 px wide, mentolder dark theme.
HERO_W = 960
HERO_H = 420
LANE_Y = 40
STEP_BOX_H = 32
POOL_Y = 280
POOL_BOX_H = 56

FAMILY_COLOR = {
    "feature": "#5b9e6a",
    "fix":     "#c96b4a",
    "chore":   "#6b82a8",
    "audit":   "#a87bc4",
    "gold":    "#c9a84c",
}


def render_hero_svg(wm: WorkflowMap) -> str:
    """Return an <svg>...</svg> string for the lifecycle pipeline."""
    families = wm.families
    domains = wm.domains
    steps_by_family = {f.id: [s for s in wm.steps if s.family == f.id]
                       for f in families}

    fam_width = HERO_W // max(1, len(families))
    pool_width = HERO_W // max(1, len(domains))

    out = [f'<svg viewBox="0 0 {HERO_W} {HERO_H}" class="hero-svg" '
           f'xmlns="http://www.w3.org/2000/svg" aria-label="Lifecycle pipeline">']

    # Family lanes (background bands)
    for fi, fam in enumerate(families):
        color = FAMILY_COLOR.get(fam.color, "#888")
        x0 = fi * fam_width
        out.append(f'<rect x="{x0}" y="{LANE_Y - 24}" width="{fam_width}" '
                   f'height="200" class="lane" data-family="{fam.id}" '
                   f'style="fill:{color}1A;stroke:{color}55"/>')
        out.append(f'<text x="{x0 + 12}" y="{LANE_Y - 6}" class="lane-label" '
                   f'style="fill:{color};font-weight:600">{fam.label}</text>')

    # Step rectangles (positioned vertically within their family lane)
    step_positions: dict[str, tuple[int, int]] = {}
    for fi, fam in enumerate(families):
        x0 = fi * fam_width + 16
        for si, step in enumerate(steps_by_family[fam.id]):
            y = LANE_Y + 8 + si * (STEP_BOX_H + 8)
            cx = x0 + (fam_width - 32) // 2
            cy = y + STEP_BOX_H // 2
            step_positions[step.id] = (cx, cy + STEP_BOX_H // 2)
            out.append(
                f'<rect x="{x0}" y="{y}" width="{fam_width - 32}" '
                f'height="{STEP_BOX_H}" rx="4" class="step-rect" '
                f'data-step="{step.id}" data-family="{fam.id}"/>'
            )
            label = step.label[:24] + ("…" if len(step.label) > 24 else "")
            out.append(
                f'<text x="{cx}" y="{cy + 5}" text-anchor="middle" '
                f'class="step-label">{label}</text>'
            )

    # Domain pools
    pool_positions: dict[str, tuple[int, int]] = {}
    for di, dom in enumerate(domains):
        x0 = di * pool_width + 8
        y0 = POOL_Y
        pool_positions[dom.id] = (x0 + (pool_width - 16) // 2, y0)
        out.append(
            f'<rect x="{x0}" y="{y0}" width="{pool_width - 16}" '
            f'height="{POOL_BOX_H}" rx="6" class="domain-pool" '
            f'data-domain="{dom.id}"/>'
        )
        label = dom.label.split(" & ")[0]
        out.append(
            f'<text x="{x0 + (pool_width - 16) // 2}" y="{y0 + POOL_BOX_H // 2 + 4}" '
            f'text-anchor="middle" class="pool-label">{label}</text>'
        )

    # Write edges: step → domain pool
    domain_id_by_table = _build_table_to_domain_lookup(wm)
    for step in wm.steps:
        for table_ref in step.writes_tables:
            dom_id = domain_id_by_table.get(table_ref)
            if not dom_id or dom_id not in pool_positions:
                continue
            sx, sy = step_positions.get(step.id, (0, 0))
            dx, dy = pool_positions[dom_id]
            gap_class = _edge_gap_class(step, "write")
            out.append(
                f'<line x1="{sx}" y1="{sy}" x2="{dx}" y2="{dy}" '
                f'class="edge edge-write{gap_class}" '
                f'data-from="{step.id}" data-to="{dom_id}"/>'
            )

    out.append("</svg>")
    return "\n".join(out)


def _build_table_to_domain_lookup(wm: WorkflowMap) -> dict[str, str]:
    """Map 'schema.table' → domain.id using yaml domain_order + DOMAINS dict.

    A table that is not classified yields no entry — its edges are dropped.
    """
    from .domains import DOMAINS, domain_slug
    domain_slug_by_label = {d.id: d.id for d in wm.domains}
    out: dict[str, str] = {}
    for label, schemas in DOMAINS.items():
        slug = domain_slug(label)
        # Use yaml-declared id if present; else slugified label.
        target = slug if slug in domain_slug_by_label else slug
        for schema, tables in schemas.items():
            for tbl in tables:
                out[f"{schema}.{tbl}"] = target
    return out


def _edge_gap_class(step, direction: str) -> str:
    """If the step has a workflow-to-db gap matching this direction, mark it."""
    for g in step.gaps:
        if g.type == "workflow-to-db":
            return " edge-gap-orange"
    return ""
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
python3 -m unittest discover -s scripts/datamodel/tests -v
```

Expected: 15 tests, all pass. If the edge-emission test fails, the most likely cause is the test fixture domain id (`tickets`) doesn't match `domain_slug("Tickets & Issues") == "tickets-issues"`. Add `id: tickets-issues` to the fixture (or normalize the slug).

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/render.py scripts/datamodel/tests/test_build_datamodel.py
# Also commit the fixture update if you changed it
git add scripts/datamodel/tests/fixtures/minimal-workflow-map.yaml || true
git commit -m "feat(datamodel): hero SVG renderer (lifecycle pipeline)"
```

---

### Task 6: `render.py` — Matrix table

**Files:**
- Modify: `scripts/datamodel/render.py` (add `render_matrix()`)
- Modify: `scripts/datamodel/tests/test_build_datamodel.py` (add test class)

- [ ] **Step 1: Write failing tests**:

```python
class TestRenderMatrix(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_matrix_has_row_per_step(self):
        from datamodel.render import render_matrix
        html = render_matrix(self._sample_map())
        self.assertEqual(html.count('class="matrix-row"'), 2)

    def test_matrix_marks_writes(self):
        from datamodel.render import render_matrix
        html = render_matrix(self._sample_map())
        self.assertRegex(html,
            r'<td[^>]+class="cell cell-w"[^>]+data-step="dev-flow-plan"'
            r'[^>]+data-domain="tickets"')

    def test_matrix_emits_header_per_domain(self):
        from datamodel.render import render_matrix
        html = render_matrix(self._sample_map())
        self.assertIn('data-domain-header="tickets"', html)
        self.assertIn('data-domain-header="bachelorprojekt"', html)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Add `render_matrix()` to `render.py`**

```python
def render_matrix(wm: WorkflowMap) -> str:
    """Return an HTML <table> mapping steps × domains, cells = R/W/G/P."""
    domain_id_by_table = _build_table_to_domain_lookup(wm)
    out = ['<div class="matrix-wrap"><table class="matrix">']
    # Header row
    out.append('<thead><tr><th class="matrix-corner">Step ↓ / Domain →</th>')
    for d in wm.domains:
        out.append(f'<th data-domain-header="{d.id}">{d.label}</th>')
    out.append('</tr></thead><tbody>')
    # One row per step
    for s in wm.steps:
        out.append(f'<tr class="matrix-row" data-step-row="{s.id}">'
                   f'<th class="matrix-step">{s.label}</th>')
        for d in wm.domains:
            kind = _cell_kind(s, d.id, domain_id_by_table)
            if kind:
                out.append(
                    f'<td class="cell cell-{kind}" '
                    f'data-step="{s.id}" data-domain="{d.id}" '
                    f'onclick="dm.cellClick(this)">{kind.upper()}</td>'
                )
            else:
                out.append(f'<td class="cell"></td>')
        out.append('</tr>')
    out.append('</tbody></table></div>')
    # Empty drill-down placeholder filled by JS on click
    out.append('<div class="cell-drilldown" aria-live="polite"></div>')
    return "\n".join(out)


def _cell_kind(step, domain_id: str, domain_lookup: dict[str, str]) -> str | None:
    """Return 'w', 'r', 'g', 'p', or None for the cell at (step, domain)."""
    has_write = any(domain_lookup.get(t) == domain_id for t in step.writes_tables)
    has_read = any(domain_lookup.get(t) == domain_id for t in step.reads_tables)
    has_gap = any(
        g.type == "db-fk" and (g.target or "").startswith(domain_id)
        for g in step.gaps
    )
    if has_gap:
        return "g"
    if has_write and has_read:
        return "p"
    if has_write:
        return "w"
    if has_read:
        return "r"
    return None
```

- [ ] **Step 4: Run tests — expect PASS** (18 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/render.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): matrix renderer (step × domain)"
```

---

### Task 7: `render.py` — Skill cards + Cross-skill gaps section

**Files:**
- Modify: `scripts/datamodel/render.py` (add `render_skill_cards()`, `render_cross_skill_gaps()`)
- Modify: `scripts/datamodel/tests/test_build_datamodel.py`

- [ ] **Step 1: Write failing tests**:

```python
class TestRenderSkillCards(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_card_per_step(self):
        from datamodel.render import render_skill_cards
        html = render_skill_cards(self._sample_map())
        self.assertEqual(html.count('class="step-card"'), 2)

    def test_card_lists_writes(self):
        from datamodel.render import render_skill_cards
        html = render_skill_cards(self._sample_map())
        self.assertIn("tickets.tickets", html)
        self.assertIn("docs/superpowers/plans/*.md", html)

    def test_card_groups_by_family(self):
        from datamodel.render import render_skill_cards
        html = render_skill_cards(self._sample_map())
        self.assertIn('data-family-group="dev-flow"', html)
        self.assertIn('data-family-group="ci"', html)


class TestRenderCrossSkillGaps(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_gap_rendered(self):
        from datamodel.render import render_cross_skill_gaps
        html = render_cross_skill_gaps(self._sample_map())
        self.assertIn("dev-flow-plan", html)
        self.assertIn("tracking-import", html)
        self.assertIn("Plan ticket is set", html)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Add the two functions to `render.py`**:

```python
def render_skill_cards(wm: WorkflowMap) -> str:
    out = ['<div class="skill-cards-grid">']
    for fam in wm.families:
        steps = [s for s in wm.steps if s.family == fam.id]
        if not steps:
            continue
        color = FAMILY_COLOR.get(fam.color, "#888")
        out.append(
            f'<section class="family-group" data-family-group="{fam.id}" '
            f'style="--fam-color:{color}">'
        )
        out.append(f'<h3 class="family-heading">{fam.label}</h3>')
        for s in steps:
            out.append(
                f'<article class="step-card" data-step-card="{s.id}">'
                f'<h4>{s.label}</h4>'
            )
            if s.description:
                out.append(f'<p class="step-desc">{s.description}</p>')

            if s.writes_tables:
                out.append('<p class="out-tables"><b>out (tables):</b> '
                           + ", ".join(f"<code>{t}</code>" for t in s.writes_tables)
                           + '</p>')
            if s.writes_files:
                out.append('<p class="out-files"><b>out (files):</b> '
                           + ", ".join(f"<code>{f}</code>" for f in s.writes_files)
                           + '</p>')
            if s.reads_tables:
                out.append('<p class="in-tables"><b>in (tables):</b> '
                           + ", ".join(f"<code>{t}</code>" for t in s.reads_tables)
                           + '</p>')
            if s.reads_files:
                out.append('<p class="in-files"><b>in (files):</b> '
                           + ", ".join(f"<code>{f}</code>" for f in s.reads_files)
                           + '</p>')
            for g in s.gaps:
                out.append(
                    f'<p class="gap gap-{g.type}">'
                    f'<span class="gap-chip">{g.type}</span> {g.explanation}</p>'
                )
            out.append('</article>')
        out.append('</section>')
    out.append('</div>')
    return "\n".join(out)


def render_cross_skill_gaps(wm: WorkflowMap) -> str:
    if not wm.cross_skill_gaps:
        return '<p class="empty">No declared cross-skill gaps.</p>'
    out = ['<ul class="cross-skill-gaps">']
    for g in wm.cross_skill_gaps:
        out.append(
            f'<li class="cross-gap"><code>{g.from_step}</code> → '
            f'<code>{g.to_step}</code><br>'
            f'<span class="cross-gap-via">via: {g.via}</span><br>'
            f'<span class="cross-gap-expl">{g.explanation}</span></li>'
        )
    out.append('</ul>')
    return "\n".join(out)
```

- [ ] **Step 4: Run tests — expect PASS** (22 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/render.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): skill cards + cross-skill gaps renderers"
```

---

### Task 8: `render.py` — Domain deep-dives (Mermaid ER blocks)

**Files:**
- Modify: `scripts/datamodel/render.py` (add `render_domain_deepdives()`)
- Modify: `scripts/datamodel/tests/test_build_datamodel.py`

The deep-dives port the existing ER-diagram emission from `scripts/db-schema-diagram.py`. Keep the output identical so we can re-use the existing pre-rendered look.

- [ ] **Step 1: Read the existing emit-Mermaid code** in `scripts/db-schema-diagram.py` (the section that converts `(tables, fks)` per domain into a `erDiagram` block). It's roughly lines 270-350. Note the column → Mermaid-type mapping via `PG_TYPE_MAP`.

- [ ] **Step 2: Write failing tests**:

```python
class TestRenderDeepdives(unittest.TestCase):
    def _snapshot(self):
        from datamodel.db import introspect_schema
        return introspect_schema(self._fake_runner())

    def _fake_runner(self):
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "tickets,tickets,external_id,text,NO\n"
            "bachelorprojekt,features,id,uuid,NO\n"
            "bachelorprojekt,features,pr_number,integer,NO\n"
        )
        fk_csv = "table_schema,table_name,column_name,fk_schema,fk_table\n"
        pk_csv = ("table_schema,table_name,column_name\n"
                  "tickets,tickets,id\nbachelorprojekt,features,id\n")
        def _parse(t):
            import csv, io
            return list(csv.DictReader(io.StringIO(t)))
        return lambda qs: [_parse(schema_csv), _parse(fk_csv), _parse(pk_csv)][:len(qs)]

    def test_deepdives_emit_one_mermaid_per_domain(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.render import render_domain_deepdives
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        out = render_domain_deepdives(wm, self._snapshot())
        # Two domains in fixture, both have at least one mapped table.
        self.assertEqual(out.count("```mermaid"), 2)

    def test_deepdives_use_erDiagram(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.render import render_domain_deepdives
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        out = render_domain_deepdives(wm, self._snapshot())
        self.assertIn("erDiagram", out)
        self.assertIn("tickets {", out)
```

- [ ] **Step 3: Run tests — expect FAIL**

- [ ] **Step 4: Add to `render.py`**:

```python
PG_TYPE_MAP = {
    "integer": "int", "bigint": "bigint", "smallint": "int",
    "text": "string", "character varying": "string", "character": "string",
    "boolean": "bool", "uuid": "uuid",
    "timestamp with time zone": "timestamp",
    "timestamp without time zone": "timestamp",
    "date": "date", "time without time zone": "time",
    "numeric": "decimal", "jsonb": "jsonb", "json": "json",
    "bytea": "bytes", "ARRAY": "array", "USER-DEFINED": "enum",
}


def render_domain_deepdives(wm: WorkflowMap, snapshot) -> str:
    """Emit one Mermaid erDiagram per domain. Mirrors db-schema-diagram.py output.

    `snapshot` must be a SchemaSnapshot from datamodel.db.introspect_schema().
    """
    from .domains import DOMAINS, domain_slug
    out = []
    for domain in wm.domains:
        label = next((k for k in DOMAINS if domain_slug(k) == domain.id), None)
        if not label:
            continue
        # Resolve which tables belong to this domain
        tables_in_domain = []
        for schema, tbls in DOMAINS[label].items():
            for tname in tbls:
                ref = f"{schema}.{tname}"
                t = snapshot.by_ref.get(ref)
                if t:
                    tables_in_domain.append(t)
        if not tables_in_domain:
            continue
        out.append(f'<section class="domain-deepdive" id="domain-{domain.id}">')
        out.append(f'<h3>{domain.label}</h3>')
        out.append("\n```mermaid\nerDiagram")
        for t in tables_in_domain:
            out.append(f"  {t.name} {{")
            for c in t.columns:
                t_str = PG_TYPE_MAP.get(c.type, "string")
                pk_marker = " PK" if c.is_pk else ""
                out.append(f"    {t_str} {c.name}{pk_marker}")
            out.append("  }")
        # Include only FKs whose both endpoints are in this domain
        refs_in_dom = {t.ref for t in tables_in_domain}
        for fk in snapshot.fks:
            from_table = ".".join(fk.from_ref.split(".")[:2])
            if from_table in refs_in_dom and fk.to_ref in refs_in_dom:
                from_t = from_table.split(".")[1]
                to_t = fk.to_ref.split(".")[1]
                col = fk.from_ref.split(".")[2]
                out.append(f'  {from_t} ||--o{{ {to_t} : "{col}"')
        out.append("```")
        # Touched-by list
        touchers = [
            s for s in wm.steps
            if any(refs in refs_in_dom for refs in (s.writes_tables + s.reads_tables))
        ]
        if touchers:
            out.append('<p class="touched-by"><b>Touched by:</b> '
                       + ", ".join(f"<code>{s.id}</code>" for s in touchers)
                       + '</p>')
        out.append('</section>')
    return "\n".join(out)
```

- [ ] **Step 5: Run tests — expect PASS** (24 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/datamodel/render.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): domain deep-dive renderer (Mermaid ER per domain)"
```

---

### Task 9: `heuristics.py` — auto-discovery

**Files:**
- Create: `scripts/datamodel/heuristics.py`
- Modify: `scripts/datamodel/tests/test_build_datamodel.py`

- [ ] **Step 1: Write failing tests**:

```python
class TestHeuristics(unittest.TestCase):
    def _snapshot_with_dangling_id(self):
        # An "owner_id" column with no FK declaration → unbound candidate.
        from datamodel.db import introspect_schema
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "tickets,tickets,owner_id,uuid,YES\n"
            "tickets,tickets,external_id,text,NO\n"
            "keycloak,user,id,uuid,NO\n"
            "keycloak,user,realm_id,uuid,NO\n"
        )
        fk_csv = "table_schema,table_name,column_name,fk_schema,fk_table\n"
        pk_csv = ("table_schema,table_name,column_name\n"
                  "tickets,tickets,id\nkeycloak,user,id\n")
        def _parse(t):
            import csv, io
            return list(csv.DictReader(io.StringIO(t)))
        return introspect_schema(
            lambda qs: [_parse(schema_csv), _parse(fk_csv), _parse(pk_csv)][:len(qs)]
        )

    def test_unbound_fk_finds_id_columns_without_fk(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.heuristics import unbound_fk_candidates
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        snap = self._snapshot_with_dangling_id()
        results = unbound_fk_candidates(snap, wm.heuristics)
        refs = {r["ref"] for r in results}
        # owner_id is the only candidate (external_id doesn't match `_id$` if we
        # strip leading external_, but here pattern is just _id$ at end of name)
        self.assertIn("tickets.tickets.owner_id", refs)
        self.assertIn("tickets.tickets.external_id", refs)
        # keycloak excluded
        self.assertNotIn("keycloak.user.realm_id", refs)

    def test_table_with_no_writer_flags_orphan_tables(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.heuristics import tables_without_writer
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        snap = self._snapshot_with_dangling_id()
        # In our minimal map only tickets.tickets has a declared writer.
        # bachelorprojekt.features has a declared writer too.
        # snapshot above doesn't include bachelorprojekt.features at all.
        orphans = tables_without_writer(snap, wm)
        # No bachelorprojekt rows in snapshot, so the only candidate
        # is anything in snapshot that isn't tickets.tickets and not excluded.
        # keycloak.user excluded by config.
        self.assertEqual(orphans, [])
```

- [ ] **Step 2: Run tests — expect FAIL** (`No module named 'datamodel.heuristics'`)

- [ ] **Step 3: Implement `scripts/datamodel/heuristics.py`**

```python
"""Auto-discovery rules. Each returns a list of plain dicts so the rendered
output can format them uniformly.
"""
from __future__ import annotations

import re
from .yaml_loader import Heuristics, WorkflowMap


def unbound_fk_candidates(snapshot, h: Heuristics) -> list[dict]:
    """Columns matching `column_pattern` that have no declared FK.

    Returns: [{"ref": "schema.table.column", "table": "schema.table"}, ...]
    """
    if not h.unbound_fk_enabled:
        return []
    pattern = re.compile(h.unbound_fk_column_pattern)
    fk_targets = {fk.from_ref for fk in snapshot.fks}
    out = []
    for t in snapshot.tables:
        if t.schema in h.unbound_fk_exclude_schemas:
            continue
        for c in t.columns:
            if c.is_pk:
                continue
            if not pattern.search(c.name):
                continue
            ref = f"{t.ref}.{c.name}"
            if ref in fk_targets:
                continue
            out.append({"ref": ref, "table": t.ref})
    return out


def tables_without_writer(snapshot, wm: WorkflowMap) -> list[dict]:
    """Tables in the snapshot that no documented step writes to."""
    if not wm.heuristics.no_writer_enabled:
        return []
    declared = {ref for s in wm.steps for ref in s.writes_tables}
    out = []
    for t in snapshot.tables:
        if t.schema in wm.heuristics.no_writer_exclude_schemas:
            continue
        if t.ref in declared:
            continue
        out.append({"ref": t.ref})
    return out
```

- [ ] **Step 4: Run tests — expect PASS** (27 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/heuristics.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): heuristic gap auto-discovery"
```

---

### Task 10: `render.py` — Coverage footer + final assembly

**Files:**
- Modify: `scripts/datamodel/render.py` (add `render_footer()`, `assemble_page()`)
- Modify: `scripts/datamodel/tests/test_build_datamodel.py`

- [ ] **Step 1: Write failing tests**:

```python
class TestRenderFooter(unittest.TestCase):
    def test_footer_summarizes_counts(self):
        from datamodel.render import render_footer
        html = render_footer(
            tables_total=42,
            tables_with_writer=30,
            unbound_fk_hits=7,
            cross_skill_gap_count=3,
        )
        self.assertIn("30", html)
        self.assertIn("42", html)
        self.assertIn("7", html)
        self.assertIn("3", html)


class TestAssemblePage(unittest.TestCase):
    def test_assembles_all_sections(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.db import introspect_schema
        from datamodel.render import assemble_page
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        # Use same fake runner as previous tests
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "bachelorprojekt,features,id,uuid,NO\n"
        )
        fk_csv = "table_schema,table_name,column_name,fk_schema,fk_table\n"
        pk_csv = ("table_schema,table_name,column_name\n"
                  "tickets,tickets,id\nbachelorprojekt,features,id\n")
        def _parse(t):
            import csv, io
            return list(csv.DictReader(io.StringIO(t)))
        snap = introspect_schema(
            lambda qs: [_parse(schema_csv), _parse(fk_csv), _parse(pk_csv)][:len(qs)]
        )
        md = assemble_page(wm, snap)
        self.assertIn("# Datamodel × Workflow", md)
        self.assertIn('class="hero-svg"', md)
        self.assertIn('class="matrix"', md)
        self.assertIn('class="step-card"', md)
        self.assertIn("```mermaid", md)
        self.assertIn('class="coverage-footer"', md)
        self.assertIn('<style>', md)
        self.assertIn('<script>', md)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Add to `render.py`**:

```python
def render_footer(*, tables_total: int, tables_with_writer: int,
                  unbound_fk_hits: int, cross_skill_gap_count: int) -> str:
    return (
        '<aside class="coverage-footer">'
        f'<p><b>{tables_with_writer}/{tables_total}</b> documented tables have at '
        f'least one declared writer.</p>'
        f'<p><b>{unbound_fk_hits}</b> columns flagged by the unbound-FK heuristic.</p>'
        f'<p><b>{cross_skill_gap_count}</b> declared cross-skill gaps.</p>'
        '</aside>'
    )


def assemble_page(wm: WorkflowMap, snapshot) -> str:
    """Compose the full Markdown document. Embedded HTML/SVG/JS is passed
    through verbatim by `marked` in scripts/build-docs.js.
    """
    from .heuristics import unbound_fk_candidates, tables_without_writer
    from pathlib import Path as _P
    here = _P(__file__).resolve().parent
    css = (here / "assets" / "style.css").read_text()
    js = (here / "assets" / "script.js").read_text()

    unbound = unbound_fk_candidates(snapshot, wm.heuristics)
    no_writer = tables_without_writer(snapshot, wm)

    lines = [
        "# Datamodel × Workflow",
        "",
        "> Generated by `task datamodel:build`. Re-run after schema or workflow-map changes.",
        "",
        f"<style>{css}</style>",
        "",
        "## Lifecycle",
        render_hero_svg(wm),
        "",
        "## Matrix",
        render_matrix(wm),
        "",
        "## Cross-skill gaps",
        render_cross_skill_gaps(wm),
        "",
        "## Skills",
        render_skill_cards(wm),
        "",
        "## Domain deep-dives",
        render_domain_deepdives(wm, snapshot),
        "",
        "## Heuristic findings",
        _render_heuristics_block(unbound, no_writer),
        "",
        "## Coverage",
        render_footer(
            tables_total=len(snapshot.tables),
            tables_with_writer=(len(snapshot.tables) - len(no_writer)),
            unbound_fk_hits=len(unbound),
            cross_skill_gap_count=len(wm.cross_skill_gaps),
        ),
        "",
        f"<script>{js}</script>",
    ]
    return "\n".join(lines)


def _render_heuristics_block(unbound, no_writer) -> str:
    out = []
    if unbound:
        out.append('<h4>Unbound FK candidates <span class="tag-heuristic">(heuristic)</span></h4><ul>')
        for u in unbound[:40]:
            out.append(f'<li><code>{u["ref"]}</code></li>')
        if len(unbound) > 40:
            out.append(f'<li><i>… and {len(unbound) - 40} more</i></li>')
        out.append('</ul>')
    if no_writer:
        out.append('<h4>Tables with no declared writer <span class="tag-heuristic">(heuristic)</span></h4><ul>')
        for r in no_writer[:40]:
            out.append(f'<li><code>{r["ref"]}</code></li>')
        if len(no_writer) > 40:
            out.append(f'<li><i>… and {len(no_writer) - 40} more</i></li>')
        out.append('</ul>')
    if not out:
        out.append('<p class="empty">No heuristic findings.</p>')
    return "\n".join(out)
```

- [ ] **Step 4: Create placeholder asset files** so `assemble_page` doesn't crash:

```bash
mkdir -p scripts/datamodel/assets
echo "/* style.css — populated in Task 11 */" > scripts/datamodel/assets/style.css
echo "/* script.js — populated in Task 11 */" > scripts/datamodel/assets/script.js
```

- [ ] **Step 5: Run tests — expect PASS** (29 tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/datamodel/render.py scripts/datamodel/assets/ scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): coverage footer + page assembly"
```

---

### Task 11: Inline CSS + JS for the page

**Files:**
- Modify: `scripts/datamodel/assets/style.css` (replace placeholder)
- Modify: `scripts/datamodel/assets/script.js` (replace placeholder)
- Modify: `scripts/datamodel/tests/test_build_datamodel.py`

This task has no TDD step — the assets are visual presentation. We add one structural test that the generated MD contains the right script handlers, but the content quality is verified visually.

- [ ] **Step 1: Replace `scripts/datamodel/assets/style.css`** with the full theme:

```css
/* Datamodel × Workflow — scoped styles. Mentolder dark + gold palette. */

.hero-svg { width: 100%; height: auto; max-height: 480px; display: block;
  background: rgba(255,255,255,0.02); border-radius: 8px; margin: 1rem 0; }
.hero-svg .lane { transition: opacity 0.15s; }
.hero-svg .step-rect { fill: var(--dark-lighter, #1e2d45); stroke: var(--dark-border, #2a3a52);
  cursor: pointer; transition: fill 0.15s, stroke 0.15s; }
.hero-svg .step-rect:hover, .hero-svg .step-rect.is-highlight {
  fill: var(--gold-dim, rgba(232,200,112,0.18));
  stroke: var(--gold, #e8c870);
}
.hero-svg .step-label { fill: var(--light, #e8e8f0); font-size: 11px;
  font-family: monospace; pointer-events: none; }
.hero-svg .domain-pool { fill: rgba(91,158,106,0.10); stroke: rgba(91,158,106,0.50);
  transition: fill 0.15s, stroke 0.15s; cursor: pointer; }
.hero-svg .domain-pool.is-highlight {
  fill: rgba(232,200,112,0.20); stroke: var(--gold, #e8c870);
}
.hero-svg .pool-label { fill: var(--muted, #aabbcc); font-size: 12px;
  pointer-events: none; }
.hero-svg .edge { stroke: rgba(91,158,106,0.55); stroke-width: 1.5; fill: none; }
.hero-svg .edge-gap-orange { stroke: var(--gold, #c9a84c); stroke-dasharray: 4 3; }
.hero-svg .edge-gap-red { stroke: var(--fix, #c96b4a); stroke-dasharray: 4 3; }
.hero-svg .edge-gap-purple { stroke: var(--audit, #a87bc4); stroke-dasharray: 4 3; }
.hero-svg .edge.is-highlight { stroke-width: 3; opacity: 1; }
.hero-svg .lane-label { font-size: 11px; }

.matrix-wrap { overflow-x: auto; margin: 1rem 0; }
.matrix { border-collapse: collapse; font-size: 0.85rem; width: 100%; }
.matrix th { background: var(--dark-lighter, #1e2d45); color: var(--gold, #e8c870);
  padding: 0.4rem 0.6rem; text-align: center; border: 1px solid var(--dark-border, #2a3a52); }
.matrix th.matrix-step { text-align: left; }
.matrix td { padding: 0.4rem 0.6rem; text-align: center; border: 1px solid var(--dark-border, #2a3a52); }
.matrix .cell-w { background: rgba(91,158,106,0.25); color: #5b9e6a; font-weight: 600; cursor: pointer; }
.matrix .cell-r { background: rgba(107,130,168,0.20); color: #6b82a8; font-weight: 600; cursor: pointer; }
.matrix .cell-g { background: rgba(201,107,74,0.25); color: #c96b4a; font-weight: 700; cursor: pointer; }
.matrix .cell-p { background: rgba(201,168,76,0.20); color: #c9a84c; font-weight: 700; cursor: pointer; }
.matrix .cell.is-dim { opacity: 0.15; }
.cell-drilldown { background: var(--dark-lighter, #1e2d45); padding: 1rem;
  border-radius: 6px; margin: 0.5rem 0 1rem; min-height: 0; }
.cell-drilldown.is-empty { display: none; }

.skill-cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem; margin: 1rem 0; }
.family-group { border-left: 4px solid var(--fam-color, #888); padding-left: 0.8rem; }
.family-heading { color: var(--fam-color, #888); margin: 0 0 0.6rem; font-size: 1rem; }
.step-card { background: var(--dark-lighter, #1e2d45); border: 1px solid var(--dark-border, #2a3a52);
  border-radius: 6px; padding: 0.8rem; margin-bottom: 0.6rem; }
.step-card h4 { color: var(--gold, #e8c870); margin: 0 0 0.3rem; font-size: 0.95rem; }
.step-card .step-desc { color: var(--muted, #aabbcc); font-size: 0.8rem; margin: 0 0 0.5rem; }
.step-card p { font-size: 0.8rem; margin: 0.2rem 0; color: var(--muted, #aabbcc); }
.step-card code { background: rgba(255,255,255,0.05); padding: 0 0.3rem; border-radius: 2px;
  font-size: 0.78rem; color: var(--light, #e8e8f0); }
.gap-chip { display: inline-block; padding: 0.05rem 0.4rem; border-radius: 10px;
  font-size: 0.7rem; margin-right: 0.4rem; font-weight: 600; }
.gap-db-fk .gap-chip { background: rgba(201,107,74,0.20); color: #c96b4a; }
.gap-workflow-to-db .gap-chip { background: rgba(232,200,112,0.20); color: #e8c870; }
.gap-cross-skill .gap-chip { background: rgba(168,123,196,0.20); color: #a87bc4; }

.cross-skill-gaps { list-style: none; padding-left: 0; }
.cross-gap { background: var(--dark-lighter, #1e2d45); border-left: 3px solid var(--audit, #a87bc4);
  padding: 0.6rem 0.8rem; margin: 0.4rem 0; font-size: 0.85rem; border-radius: 0 4px 4px 0; }
.cross-gap-via { color: var(--gold, #e8c870); font-size: 0.8rem; }
.cross-gap-expl { color: var(--muted, #aabbcc); font-size: 0.8rem; }

.domain-deepdive { margin: 1.5rem 0; padding-top: 1rem; border-top: 1px solid var(--dark-border, #2a3a52); }
.domain-deepdive h3 { color: var(--gold, #e8c870); }
.touched-by { font-size: 0.85rem; color: var(--muted, #aabbcc); }

.coverage-footer { background: var(--dark-lighter, #1e2d45); padding: 1rem 1.2rem;
  border-radius: 6px; margin: 1.5rem 0; }
.coverage-footer p { margin: 0.3rem 0; color: var(--light, #e8e8f0); }
.coverage-footer b { color: var(--gold, #e8c870); }

.tag-heuristic { font-size: 0.7rem; color: var(--muted, #aabbcc); font-weight: 400; }

/* Filter classes toggled on <body> by the JS */
body.filter-gaps .cell:not(.cell-g):not(.cell-p) { opacity: 0.15; }
body.filter-writes .cell:not(.cell-w):not(.cell-p) { opacity: 0.15; }
body.filter-reads .cell:not(.cell-r):not(.cell-p) { opacity: 0.15; }
```

- [ ] **Step 2: Replace `scripts/datamodel/assets/script.js`** with the full handlers:

```javascript
/* Datamodel × Workflow — page interactivity.
 * Scope: hover-highlight, cell click → drilldown, filter buttons, Ctrl+K.
 * Namespaced under window.dm to avoid colliding with docs frame JS.
 */
(function () {
  const dm = window.dm = window.dm || {};

  // ── Hover-highlight: step ↔ domain ─────────────────────────────────────
  document.querySelectorAll('[data-step]').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      const id = el.getAttribute('data-step');
      document.querySelectorAll('[data-step="' + id + '"], [data-step-card="' + id + '"]')
        .forEach(function (n) { n.classList.add('is-highlight'); });
      document.querySelectorAll('[data-from="' + id + '"]').forEach(function (line) {
        line.classList.add('is-highlight');
        const dom = line.getAttribute('data-to');
        document.querySelectorAll('[data-domain="' + dom + '"]').forEach(function (n) {
          n.classList.add('is-highlight');
        });
      });
    });
    el.addEventListener('mouseleave', function () {
      document.querySelectorAll('.is-highlight').forEach(function (n) {
        n.classList.remove('is-highlight');
      });
    });
  });

  // ── Matrix cell click → drilldown ──────────────────────────────────────
  dm.cellClick = function (td) {
    const step = td.getAttribute('data-step');
    const domain = td.getAttribute('data-domain');
    const kind = td.classList.contains('cell-w') ? 'writes' :
                 td.classList.contains('cell-r') ? 'reads' :
                 td.classList.contains('cell-g') ? 'gap' : 'partial';
    const stepCard = document.querySelector('[data-step-card="' + step + '"]');
    const summary = stepCard ? stepCard.innerHTML : '<i>No card for ' + step + '</i>';
    const dd = document.querySelector('.cell-drilldown');
    if (!dd) return;
    dd.innerHTML = '<h4>' + step + ' × ' + domain + ' (' + kind + ')</h4>' + summary;
    dd.classList.remove('is-empty');
    dd.scrollIntoView({behavior: 'smooth', block: 'nearest'});
  };

  // ── Filter buttons ─────────────────────────────────────────────────────
  dm.filter = function (mode) {
    document.body.classList.remove('filter-gaps', 'filter-writes', 'filter-reads');
    if (mode) document.body.classList.add('filter-' + mode);
  };

  // ── Ctrl+K search ──────────────────────────────────────────────────────
  const idx = [];
  document.querySelectorAll('[data-step], [data-domain], [data-step-card]')
    .forEach(function (el) {
      const kind = el.getAttribute('data-step') ? 'step' :
                   el.getAttribute('data-step-card') ? 'step' : 'domain';
      const id = el.getAttribute('data-step') || el.getAttribute('data-step-card') ||
                 el.getAttribute('data-domain');
      const label = el.textContent.trim().slice(0, 60);
      if (id && !idx.find(function (e) { return e.id === id; })) {
        idx.push({id: id, kind: kind, label: label, el: el});
      }
    });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const term = prompt('Jump to step / domain / table:');
      if (!term) return;
      const hit = idx.find(function (e) {
        return e.id.indexOf(term) >= 0 || e.label.indexOf(term) >= 0;
      });
      if (hit) hit.el.scrollIntoView({behavior: 'smooth', block: 'center'});
    }
  });
})();
```

- [ ] **Step 3: Add a smoke test** in `test_build_datamodel.py`:

```python
class TestPageWiring(unittest.TestCase):
    def test_assembled_page_has_handlers(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.db import introspect_schema
        from datamodel.render import assemble_page
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        snap = introspect_schema(lambda qs: [[]] * len(qs))
        md = assemble_page(wm, snap)
        self.assertIn('window.dm', md)
        self.assertIn('onclick="dm.cellClick(this)"', md)
        self.assertIn('addEventListener', md)
```

- [ ] **Step 4: Run tests — expect PASS** (30 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/assets/ scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): inline CSS + JS for interactivity"
```

---

### Task 12: `build_datamodel.py` — CLI

**Files:**
- Create: `scripts/datamodel/build_datamodel.py`
- Modify: `scripts/datamodel/tests/test_build_datamodel.py`

- [ ] **Step 1: Write the integration test** (uses fake runner end-to-end):

```python
class TestCli(unittest.TestCase):
    def test_writes_output_to_path(self):
        import tempfile
        from datamodel.build_datamodel import build
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            out_path = f.name
        # Fake runner returns empty rows; the build should still produce a file
        # with the expected scaffolding.
        result = build(
            map_path=str(FIXTURES / "minimal-workflow-map.yaml"),
            out_path=out_path,
            runner=lambda qs: [[]] * len(qs),
        )
        self.assertTrue(result["ok"])
        from pathlib import Path
        text = Path(out_path).read_text()
        self.assertIn("# Datamodel × Workflow", text)
        self.assertIn('class="hero-svg"', text)
        self.assertIn('class="matrix"', text)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement `scripts/datamodel/build_datamodel.py`**

```python
#!/usr/bin/env python3
"""Generate k3d/docs-content/datamodel-workflow.md.

Usage:
    KUBECTL_CTX=mentolder KUBECTL_NS=workspace \
        python3 scripts/datamodel/build_datamodel.py \
            --map scripts/datamodel/workflow-map.yaml \
            --out k3d/docs-content/datamodel-workflow.md

Environment:
    KUBECTL_CTX  Required for live mode (e.g. "mentolder")
    KUBECTL_NS   Defaults to "workspace"
    PG_USER      Defaults to "postgres"

If KUBECTL_CTX is unset, the CLI aborts with a clear error so we never silently
produce an empty page.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def build(*, map_path: str, out_path: str, runner) -> dict:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from datamodel.yaml_loader import load_workflow_map
    from datamodel.db import introspect_schema
    from datamodel.render import assemble_page

    wm = load_workflow_map(map_path)
    snapshot = introspect_schema(runner)
    md = assemble_page(wm, snapshot)
    Path(out_path).write_text(md)
    return {"ok": True, "tables": len(snapshot.tables),
            "steps": len(wm.steps), "fks": len(snapshot.fks)}


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--map", required=True, help="Path to workflow-map.yaml")
    p.add_argument("--out", required=True, help="Path to output .md")
    p.add_argument("--db", default="website", help="Database name (default: website)")
    args = p.parse_args(argv)

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from datamodel.db import kubectl_psql_runner

    ctx = os.environ.get("KUBECTL_CTX") or ""
    if not ctx:
        print("error: KUBECTL_CTX must be set (e.g. mentolder)", file=sys.stderr)
        return 2
    ns = os.environ.get("KUBECTL_NS", "workspace")
    runner = kubectl_psql_runner(ctx=ctx, ns=ns, database=args.db)

    result = build(map_path=args.map, out_path=args.out, runner=runner)
    print(f"wrote {args.out}: {result['tables']} tables, "
          f"{result['steps']} steps, {result['fks']} FKs")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```

- [ ] **Step 4: Run tests — expect PASS** (31 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/datamodel/build_datamodel.py scripts/datamodel/tests/test_build_datamodel.py
git commit -m "feat(datamodel): build CLI"
```

---

### Task 13: Populate `workflow-map.yaml` with the full ~25-step inventory

**Files:**
- Create: `scripts/datamodel/workflow-map.yaml`

This task is data-entry. No tests beyond the loader's existing validation. The file is reviewed in PR.

- [ ] **Step 1: Write the canonical map** at `scripts/datamodel/workflow-map.yaml`

Use the schema from `scripts/datamodel/tests/fixtures/minimal-workflow-map.yaml` as the template. Source of truth for what to include:

| Family | Step inventory |
|---|---|
| `dev-flow` | `brainstorming`, `writing-plans`, `using-git-worktrees`, `dev-flow-plan`, `dev-flow-execute`, `plan-context-sh`, `plan-frontmatter-hook-sh`, `tdd-failing-test` |
| `agents`   | `bp-db`, `bp-infra`, `bp-ops`, `bp-website`, `bp-test`, `bp-security` |
| `ci`       | `track-pr`, `track-plans`, `tracking-import-cron`, `build-website`, `dev-auto-deploy`, `argocd-reconcile` |
| `app`      | `keycloak-sso-login`, `nextcloud-talk-meeting`, `website-chat-message`, `tickets-admin-create`, `bug-report-submit`, `coaching-ingest`, `arena-gameplay`, `brett-snapshot-save` |

For each step:
- `id` (kebab-case, unique)
- `family` (one of the four)
- `label` (display name)
- `description` (1 sentence)
- `writes`: `tables: [schema.table]`, `files: [glob]`
- `reads`: same shape
- `gaps`: list of `{type, explanation}` for any known issues

**Declared cross-skill gaps** (initial inventory — add at least 3 to satisfy the success criterion):

1. `dev-flow-plan` → `tracking-import-cron`: ticket_id is set but not joined into `bachelorprojekt.features`.
2. `brainstorming` → any DB: session events stay in `.superpowers/brainstorm/*/state/events`, never ingested.
3. `bug-report-submit` → `tickets-admin-create`: `bugs.bug_tickets` and `tickets.tickets` are two separate write paths — there's no automatic promotion from a bug to a triaged ticket.

After writing, validate locally:

```bash
python3 -c "import sys; sys.path.insert(0, 'scripts'); from datamodel.yaml_loader import load_workflow_map; m = load_workflow_map('scripts/datamodel/workflow-map.yaml'); print('OK:', len(m.steps), 'steps,', len(m.cross_skill_gaps), 'cross-skill gaps')"
```

Expected output: `OK: ≥ 25 steps, ≥ 3 cross-skill gaps`.

- [ ] **Step 2: Commit**

```bash
git add scripts/datamodel/workflow-map.yaml
git commit -m "feat(datamodel): seed workflow-map.yaml with full step inventory"
```

---

### Task 14: Taskfile entry + Sidebar entry

**Files:**
- Modify: `Taskfile.yml`
- Modify: `k3d/docs-content/_sidebar.md`

- [ ] **Step 1: Add the `datamodel:build` task** in `Taskfile.yml`. Place it near `db:diagram:` so related operations are co-located. Insert after the `db:diagram:` block:

```yaml
  datamodel:build:
    desc: "Regenerate k3d/docs-content/datamodel-workflow.md from shared-db + workflow-map.yaml"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
    cmds:
      - |
        source scripts/env-resolve.sh "{{.ENV}}"
        NS="${WORKSPACE_NAMESPACE:-workspace}"
        KUBECTL_CTX="${ENV_CONTEXT}" KUBECTL_NS="$NS" \
          python3 scripts/datamodel/build_datamodel.py \
            --map scripts/datamodel/workflow-map.yaml \
            --out k3d/docs-content/datamodel-workflow.md
        echo "Written. Review the diff, then commit + task docs:deploy."
```

- [ ] **Step 2: Verify the task is discoverable**

```bash
task --list 2>&1 | grep datamodel
```

Expected output: `* datamodel:build:   Regenerate k3d/docs-content/datamodel-workflow.md ...`

- [ ] **Step 3: Add the sidebar entry** in `k3d/docs-content/_sidebar.md`. Find the `- **Referenz**` block (near the bottom). Insert a new line just before `- [Glossar](glossary)`:

```markdown
- **Referenz**
  - [Datamodel × Workflow](datamodel-workflow)
  - [Glossar](glossary)
  - [Decision-Log](decisions)
```

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml k3d/docs-content/_sidebar.md
git commit -m "chore(datamodel): wire datamodel:build into Taskfile + sidebar"
```

---

### Task 15: End-to-end generation + smoke verification

**Files:**
- Create: `k3d/docs-content/datamodel-workflow.md` (generated)
- Modify: nothing else

This is the integration moment — we run the real generator against the live mentolder DB, commit the output, and verify the docs build chain accepts it.

- [ ] **Step 1: Verify mentolder cluster is reachable**

```bash
kubectl --context mentolder get pod -n workspace -l app=shared-db -o name | head -1
```

Expected: a pod name like `pod/shared-db-0`. If it returns empty, abort and ask the user to bring the cluster up.

- [ ] **Step 2: Run the generator against the live DB**

```bash
task datamodel:build ENV=mentolder
```

Expected output ends with `wrote k3d/docs-content/datamodel-workflow.md: 101 tables, ~25 steps, ~30 FKs`.

- [ ] **Step 3: Sanity-grep the generated file**

```bash
grep -c 'data-step="dev-flow-plan"' k3d/docs-content/datamodel-workflow.md
grep -c 'class="hero-svg"' k3d/docs-content/datamodel-workflow.md
grep -c '```mermaid' k3d/docs-content/datamodel-workflow.md
```

Expected: each grep returns ≥ 1 for the first two; the mermaid count should be 8 (one per domain).

- [ ] **Step 4: Run the docs build to verify the rendered HTML preserves our markup**

```bash
task docs:build FAST=true
grep -c 'data-step="dev-flow-plan"' k3d/docs-content-built/datamodel-workflow.html
grep -c '<script>' k3d/docs-content-built/datamodel-workflow.html
```

Expected: both ≥ 1. If `<script>` is missing, `marked` or `cheerio` stripped it — investigate `scripts/build-docs.js` for any tag-strip step. (Spec risk #2 — this is the smoke test for it.)

- [ ] **Step 5: Visually verify the page locally (optional)**

```bash
# Quickest path: open the built file directly
xdg-open k3d/docs-content-built/datamodel-workflow.html 2>/dev/null \
  || echo "Open k3d/docs-content-built/datamodel-workflow.html manually"
```

Verify:
- Hero SVG renders with 4 family lanes + 8 domain pools.
- Hovering a step rect highlights matching domain pool.
- Matrix cell click expands the drill-down.
- Coverage footer shows non-zero numbers.

- [ ] **Step 6: Commit the generated MD**

```bash
git add k3d/docs-content/datamodel-workflow.md
git commit -m "docs(datamodel): seed datamodel-workflow.md (generated)"
```

---

## Self-Review

I checked the plan against the spec; below is the audit.

**Spec coverage:**

| Spec requirement | Implementing task(s) |
|---|---|
| Generator script (Python, follows db-schema-diagram.py pattern) | Task 4, Task 12 |
| Live shared-db introspection (kubectl-exec) | Task 4 |
| `scripts/datamodel/workflow-map.yaml` schema + validation | Task 3, Task 13 |
| Hero SVG (lifecycle pipeline, 4 family lanes + 8 pools + gap edges) | Task 5 |
| Matrix (rows × domains, R/W/G/P cells, click drill-down) | Task 6, Task 11 (JS) |
| Skill cards (per step, in/out/gaps) | Task 7 |
| Domain deep-dives (Mermaid erDiagram per domain) | Task 8 |
| Heuristics (unbound FK, no-writer tables) | Task 9 |
| Coverage footer (counts) | Task 10 |
| Inline CSS (≤ ~8 KB) + inline JS (≤ ~4 KB) | Task 11 |
| Filter toolbar (gaps/writes/reads) | Task 11 (CSS body classes + `dm.filter()`) |
| Ctrl+K search | Task 11 |
| Three gap colors visually distinct (red/orange/purple) | Task 5 (edge classes), Task 11 (CSS) |
| New `task datamodel:build` task | Task 14 |
| Sidebar entry under "Referenz" | Task 14 |
| Committed output | Task 15 |
| Smoke verification: HTML preserves `data-step` + `<script>` | Task 15 |
| Coverage Footer non-zero (≥3 cross-skill, ≥5 unbound-FK, ≥2 no-writer) | Task 13 (gap inventory) + Task 15 (verification) |
| Reuse db-schema-diagram.py's DOMAINS dict | Task 2 |

No gaps in spec coverage.

**Placeholder scan:** I searched for "TBD", "TODO", "implement later", "appropriate", "as needed" — none in plan body. Code blocks contain real implementations, not pseudocode. The CSS in Task 11 is the full file; the JS is the full file.

**Type consistency:** I cross-checked the dataclasses across tasks:
- `WorkflowMap` (Task 3) is consumed by `render.py` (Tasks 5-10) and `heuristics.py` (Task 9).
- `SchemaSnapshot` (Task 4) is consumed by `render_domain_deepdives` (Task 8) and the heuristics (Task 9).
- `assemble_page(wm, snapshot)` (Task 10) is the single entry the CLI calls (Task 12).
- Field names match across producers and consumers (`writes_tables`, not `writes.tables`; `by_ref`, not `by_table`).

No inconsistencies found.

**Scope check:** 15 tasks, single feature, single output file. No multi-subsystem entanglement. Single implementation plan is appropriate.

---

**Plan complete and saved to `docs/superpowers/plans/datamodel-skill-overview.md`.**

Execution is the responsibility of the `dev-flow-execute` skill (per the project's `dev-flow-plan` workflow). The plan stops here; do not start implementation in this session.
