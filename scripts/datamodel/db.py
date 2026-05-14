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
