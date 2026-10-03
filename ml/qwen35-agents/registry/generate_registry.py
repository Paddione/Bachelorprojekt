"""Registry-Generator: Bachelorprojekt-Tasks -> task registry fuer den 0.8B-Dispatcher.

Quellen: Taskfile.yml (tasks + desc + cmds-Heuristik). Manuelle Ergaenzungen
liegen in registry.manual.json und werden gemerged.

Usage:
  python generate_registry.py --taskfile ../../Taskfile.yml --out registry.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import yaml

DESTRUCTIVE = re.compile(r"\b(delete|drop|prune|kill|reset|rm -rf|revoke|destroy)\b", re.I)
PARAM_VARS = re.compile(r"(?:ENV|VAR)=([A-Z_]+)")


def risk_of(cmds: list[str]) -> str:
    joined = " ".join(cmds)
    if DESTRUCTIVE.search(joined):
        return "requires-approval"
    return "auto"


def task_params(cmds: list[str], task: dict) -> dict:
    params: dict = {}
    for env in PARAM_VARS.findall(" ".join(cmds)):
        params[env] = {"type": "string", "required": False}
    for var, spec in (task.get("vars") or {}).items():
        params[str(var)] = {"type": "string", "required": False, "default": str(spec)}
    return params


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--taskfile", type=Path, default=Path("../../Taskfile.yml"))
    ap.add_argument("--out", type=Path, default=Path("registry.json"))
    ap.add_argument("--manual", type=Path, default=Path("registry.manual.json"))
    args = ap.parse_args()

    def load_taskfile(path: Path, seen: set[Path] | None = None) -> dict:
        """Taskfile + includes rekursiv (eine Ebene Namespacing pro Include)."""
        seen = seen or set()
        path = path.resolve()
        if path in seen:
            return {}
        seen.add(path)
        tf = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        tasks: dict = dict(tf.get("tasks") or {})
        for ns, inc in (tf.get("includes") or {}).items():
            if not isinstance(inc, dict):
                inc = {"taskfile": inc}
            inc_path = (path.parent / inc["taskfile"]).resolve()
            if not inc_path.exists():
                continue
            sub = load_taskfile(inc_path, seen)
            for tname, tspec in sub.items():
                tasks[f"{ns}:{tname}"] = tspec
        return tasks

    tasks = load_taskfile(args.taskfile)
    registry: list[dict] = []
    for name, spec in tasks.items():
        if not isinstance(spec, dict):
            continue
        cmds = [json.dumps(c) if isinstance(c, dict) else str(c) for c in (spec.get("cmds") or [])]
        registry.append(
            {
                "task_id": name,
                "source": "taskfile",
                "description": spec.get("desc") or f"Task {name}",
                "parameters": task_params(cmds, spec),
                "cmds_summary": cmds[:3],
                "risk": risk_of(cmds),
                "timeout_s": None,
            }
        )

    if args.manual.exists():
        registry.extend(json.loads(args.manual.read_text(encoding="utf-8"))["tasks"])

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({"tool_schema_version": "v1", "tasks": registry}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"{len(registry)} Tasks -> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
