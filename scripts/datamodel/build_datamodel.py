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
