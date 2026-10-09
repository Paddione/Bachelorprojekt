"""Sandbox-Verb: create/activate/destroy plus Manifest (T901630).

Das Manifest `.devflow/sandbox.json` haelt Ticket, Branch, Plan und
Intel-Snapshot des Worktrees fest. Die Aktion steht im JSON-Feld `action`
des stdin-Payloads; Antwort-JSON geht nach stdout, Fehler als
{"error": {"code", "message"}} nach stderr. Exit 0 gruen, 1 Hard-Fail,
2 Umgebung (Pfad fehlt, Manifest unlesbar). Stdlib-only.
"""

import argparse
import json
import sys
from pathlib import Path

MANIFEST_FIELDS = ("ticket", "branch", "plan", "intel-snapshot")
MANIFEST_REL = Path(".devflow") / "sandbox.json"


def _manifest_path(worktree):
    return Path(worktree) / MANIFEST_REL


def _require_fields(data, fields):
    missing = [f for f in fields if not data.get(f)]
    if missing:
        raise ValueError(f"missing required field(s): {', '.join(missing)}")


def create(worktree, ticket, branch, plan, intel_snapshot):
    """Schreibt das Manifest; gibt das Antwort-Dict zurueck."""
    manifest = {
        "ticket": ticket,
        "branch": branch,
        "plan": plan,
        "intel-snapshot": intel_snapshot,
    }
    _require_fields(manifest, MANIFEST_FIELDS)
    path = _manifest_path(worktree)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return {"action": "create", "worktree": str(worktree), "manifest": manifest}


def activate(worktree):
    """Liest und validiert das Manifest; gibt das Antwort-Dict zurueck."""
    path = _manifest_path(worktree)
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise ValueError(f"no sandbox manifest at {path}") from None
    except OSError as exc:
        raise ValueError(f"manifest unreadable at {path}: {exc}") from None
    if not isinstance(manifest, dict):
        raise ValueError(f"manifest at {path} is not a JSON object")
    _require_fields(manifest, MANIFEST_FIELDS)
    return {"action": "activate", "worktree": str(worktree), "manifest": manifest}


def destroy(worktree):
    """Entfernt den .devflow-Eintrag; gibt das Antwort-Dict zurueck."""
    path = _manifest_path(worktree)
    if not path.is_file():
        raise ValueError(f"no sandbox manifest at {path}")
    path.unlink()
    try:
        path.parent.rmdir()  # nur wenn leer (Cache bleibt unangetastet)
    except OSError:
        pass
    return {"action": "destroy", "worktree": str(worktree)}


def _fail(code, message):
    print(json.dumps({"error": {"code": code, "message": message}}), file=sys.stderr)


def main(argv=None):
    """stdin-JSON lesen, Aktion ausfuehren, Exit-Code zurueckgeben."""
    parser = argparse.ArgumentParser(
        prog="python3 -m devflow sandbox",
        description="Sandbox-Manifest verwalten (Payload als JSON auf stdin).",
    )
    parser.parse_args(list(sys.argv[1:] if argv is None else argv))
    try:
        data = json.load(sys.stdin)
    except ValueError as exc:
        _fail("devflow_env", f"invalid JSON on stdin: {exc}")
        return 2
    if not isinstance(data, dict):
        _fail("devflow_env", "stdin JSON must be an object")
        return 2
    action = data.get("action")
    worktree = data.get("worktree")
    if not action or not worktree:
        _fail("devflow_env", "missing required field(s): action, worktree")
        return 2
    try:
        if action == "create":
            _require_fields(data, MANIFEST_FIELDS)
            result = create(worktree, data["ticket"], data["branch"],
                            data["plan"], data["intel-snapshot"])
        elif action == "activate":
            result = activate(worktree)
        elif action == "destroy":
            result = destroy(worktree)
        else:
            _fail("devflow_env", f"unknown sandbox action: {action}")
            return 2
    except ValueError as exc:
        _fail("devflow_env", str(exc))
        return 2
    except OSError as exc:
        _fail("devflow_env", str(exc))
        return 2
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
