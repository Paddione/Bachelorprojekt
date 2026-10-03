"""Role-Metrics fuer die vier Rollen —Operating auf Episoden-JSONs.

  dispatcher:   Task-Selection-Accuracy, Argument-Exactness, erfundene Erfolge
  executor:     verifizierte Abschluesse, Pfad-Verletzungen
  orchestrator: Abhaengigkeits-Verletzungen (Dispatch vor depends_on)
  planner:      Plan-Schema-Gueltigkeit (id/worker/goal/depends_on/acceptance_criteria)

Usage:
  python role_metrics.py <role> <episoden-dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def load(dirpath: Path) -> list[dict]:
    return [json.loads(f.read_text(encoding="utf-8")) for f in sorted(dirpath.glob("*.json"))]


def m_dispatcher(eps: list[dict]) -> dict:
    n = len(eps)
    sel = sum(1 for e in eps if e.get('expected_task') and e.get('selected_task') == e['expected_task'])
    exact = sum(1 for e in eps if e.get('expected_arguments') is not None and
                e.get('selected_task') == e.get('expected_task') and
                e.get('selected_arguments') == e['expected_arguments'])
    fabricated = sum(
        1 for e in eps if e.get("result", {}) and e["result"].get("status") == "succeeded" and
        not any(m.get("role") == "tool" for m in e.get("messages", []))
    )
    return {"episodes": n, "task_selection_acc": round(sel / n, 3) if n else None,
            "argument_exactness": round(exact / n, 3) if n else None,
            "fabricated_success": fabricated}


def m_executor(eps: list[dict]) -> dict:
    n = len(eps)
    verified = sum(1 for e in eps if (e.get("result") or {}).get("status") == "succeeded" and
                   e.get("provenance", {}).get("reviewed"))
    path_violation = sum(
        1 for e in eps
        if e.get("allowed_paths") and any(
            p not in e["allowed_paths"] for tc in e.get("tool_calls", [])
            for p in [tc.get("arguments", {}).get("filePath", tc.get("arguments", {}).get("path", tc.get("arguments", {}).get("file")))]
            if p
        )
    )
    return {"episodes": n, "verified_completion": round(verified / n, 3) if n else None,
            "path_violations": path_violation}


def m_orchestrator(eps: list[dict]) -> dict:
    n = len(eps)
    dep_violation = 0
    for e in eps:
        plan = e.get("plan") or {}
        steps = plan.get("steps") or []
        state = plan.get("state") or {}
        for s in steps:
            for dep in s.get("depends_on", []) or []:
                dep_step = next((x for x in steps if x["id"] == dep), None)
                if dep_step and state.get(dep) != "succeeded" and state.get(s["id"]) == "succeeded":
                    dep_violation += 1
    return {"episodes": n, "dependency_violations": dep_violation}


def m_planner(eps: list[dict]) -> dict:
    n = len(eps)
    required = {"id", "worker", "goal", "depends_on", "acceptance_criteria"}
    valid = sum(
        1 for e in eps
        if (p := (e.get("plan") or {}).get("steps")) and
        all(required.issubset(set(s.keys())) for s in p)
    )
    return {"episodes": n, "plan_schema_valid": round(valid / n, 3) if n else None}


METRICS = {"dispatcher": m_dispatcher, "executor": m_executor,
           "orchestrator": m_orchestrator, "planner": m_planner}


def main() -> int:
    if len(sys.argv) != 3 or sys.argv[1] not in METRICS:
        print(f"usage: role_metrics.py <{'|'.join(METRICS)}> <episoden-dir>")
        return 1
    eps = [ep for ep in load(Path(sys.argv[2])) if ep.get("role") == sys.argv[1]]
    print(json.dumps(METRICS[sys.argv[1]](eps), indent=2))
    return 0


if __name__ == "__main__":
    main()
