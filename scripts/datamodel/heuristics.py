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
