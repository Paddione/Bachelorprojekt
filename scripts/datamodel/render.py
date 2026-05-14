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

    Matches DOMAINS keys to yaml domain ids by label first, then by slug.
    This allows fixture-friendly short ids like 'tickets' as well as auto-slugs.
    """
    from .domains import DOMAINS, domain_slug
    label_to_id = {d.label: d.id for d in wm.domains}
    out: dict[str, str] = {}
    for label, schemas in DOMAINS.items():
        dom_id = label_to_id.get(label) or next(
            (d.id for d in wm.domains if domain_slug(label) == d.id), None
        )
        if not dom_id:
            continue
        for schema, tables in schemas.items():
            for tbl in tables:
                out[f"{schema}.{tbl}"] = dom_id
    return out


def _edge_gap_class(step, direction: str) -> str:
    """If the step has a workflow-to-db gap matching this direction, mark it."""
    for g in step.gaps:
        if g.type == "workflow-to-db":
            return " edge-gap-orange"
    return ""


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


def render_domain_deepdives(wm: WorkflowMap, snapshot) -> str:
    """Emit one Mermaid erDiagram per domain. Mirrors db-schema-diagram.py output.

    `snapshot` must be a SchemaSnapshot from datamodel.db.introspect_schema().
    """
    from .domains import DOMAINS, domain_slug
    out = []
    for domain in wm.domains:
        label = next((k for k in DOMAINS
                      if k == domain.label or domain_slug(k) == domain.id), None)
        if not label:
            continue
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
        refs_in_dom = {t.ref for t in tables_in_domain}
        for fk in snapshot.fks:
            from_table = ".".join(fk.from_ref.split(".")[:2])
            if from_table in refs_in_dom and fk.to_ref in refs_in_dom:
                from_t = from_table.split(".")[1]
                to_t = fk.to_ref.split(".")[1]
                col = fk.from_ref.split(".")[2]
                out.append(f'  {from_t} ||--o{{ {to_t} : "{col}"')
        out.append("```")
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
