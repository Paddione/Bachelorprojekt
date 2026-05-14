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
