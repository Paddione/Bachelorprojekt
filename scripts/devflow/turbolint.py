"""Turbolint: paralleler Lint-Aggregator, V1 mit 3 Lintern (T901630).

Linter (je mit eigenem Timeout, parallel via ThreadPoolExecutor):
  plan-lint  scripts/plan-lint.sh --json <plan> (positional)
  ruff       ruff check scripts/devflow/
  tsc        npx tsc --noEmit (cwd components/brett)
Fehlt ein Linter-Binary, wird genau dieser als `skipped` mit Warnung
markiert statt den Lauf zu failen. Exit 2 nur, wenn die Plan-Datei fehlt
oder KEIN Linter lauffaehig ist.

File-Hash-Cache (sha256 je Linter, `.devflow/cache/turbolint.json`):
unveraenderte Linter werden als `cached` uebersprungen.

Formate: --format condensed (Default, eine Zeile pro Befund) oder json
(Top-Level-Keys `results` und `summary`). Exit 0 gruen, 1 Hard-Fail,
2 Umgebung. Test-Seams (Stubs im PATH): DEVFLOW_PLAN_LINT, DEVFLOW_TSC_CMD,
DEVFLOW_DIR. Aufruf aus dem Proxy: {worktree, scope} als JSON auf stdin.
Stdlib-only, Ziel <= 300 Zeilen.
"""

import argparse
import concurrent.futures
import hashlib
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

CACHE_REL = Path(".devflow") / "cache" / "turbolint.json"
FINDING_CAP = 50
TSC_GLOB_CAP = 1000

LINTER_TIMEOUTS = {"plan-lint": 180, "ruff": 180, "tsc": 300}


def _stdin_json():
    """Optionaler stdin-Payload (Proxy); {} bei TTY/leer/ungueltig."""
    try:
        if sys.stdin.isatty():
            return {}
        raw = sys.stdin.read()
    except Exception:
        return {}
    if not raw or not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except ValueError:
        return {}
    return data if isinstance(data, dict) else {}


def _linter_argv(name, plan):
    if name == "plan-lint":
        base = shlex.split(os.environ.get("DEVFLOW_PLAN_LINT", "scripts/plan-lint.sh"))
        return base + ["--json", plan]
    if name == "ruff":
        return ["ruff", "check", "scripts/devflow/"]
    if name == "tsc":
        base = shlex.split(os.environ.get("DEVFLOW_TSC_CMD", "npx tsc"))
        return base + ["--noEmit"]
    raise ValueError(f"unknown linter: {name}")


def _linter_cwd(name, root):
    if name == "tsc":
        return str(Path(root) / "components" / "brett")
    return str(root)


def _linter_inputs(name, root, plan):
    root = Path(root)
    if name == "plan-lint":
        return [root / plan]
    if name == "ruff":
        return sorted((root / "scripts" / "devflow").glob("*.py"))
    if name == "tsc":
        out = []
        brett = root / "components" / "brett"
        for ext in ("*.ts", "*.tsx"):
            out.extend(sorted(brett.rglob(ext)))
        return out[:TSC_GLOB_CAP]
    return []


def _hash_inputs(paths):
    digest = hashlib.sha256()
    for path in paths:
        try:
            blob = Path(path).read_bytes()
        except OSError:
            blob = b"<missing>"
        digest.update(str(path).encode("utf-8") + b"\0" + blob)
    return digest.hexdigest()


def _parse_findings(name, stdout):
    text = (stdout or "").strip()
    if not text:
        return []
    if name == "plan-lint":
        try:
            doc = json.loads(text)
            return list(doc.get("hard", [])) + list(doc.get("warn", []))
        except ValueError:
            pass
    return text.splitlines()[:FINDING_CAP]


def _run_linter(name, root, plan):
    started = time.monotonic()

    def _skip(warning):
        return {
            "name": name, "status": "skipped", "findings": [],
            "warning": warning,
            "duration_ms": int((time.monotonic() - started) * 1000),
        }

    try:
        argv = _linter_argv(name, plan)
    except ValueError as exc:
        return _skip(f"bad linter command override: {exc}")
    cwd = _linter_cwd(name, root)
    if not Path(cwd).is_dir():
        return _skip(f"workdir missing: {cwd}")
    try:
        proc = subprocess.run(
            argv,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=LINTER_TIMEOUTS[name],
        )
    except FileNotFoundError:
        return _skip(f"binary not found: {argv[0]}")
    except subprocess.TimeoutExpired:
        return {
            "name": name, "status": "fail",
            "findings": [f"timeout after {LINTER_TIMEOUTS[name]}s"],
            "duration_ms": int((time.monotonic() - started) * 1000),
        }
    except OSError as exc:
        return _skip(str(exc))
    return {
        "name": name,
        "status": "ok" if proc.returncode == 0 else "fail",
        "findings": _parse_findings(name, proc.stdout),
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def _cache_path(root):
    override = os.environ.get("DEVFLOW_DIR")
    base = Path(override) if override else Path(root) / ".devflow"
    return base / "cache" / "turbolint.json"


def _load_cache(path):
    try:
        doc = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return doc if isinstance(doc, dict) else {}


def _save_cache(path, doc):
    try:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")
    except OSError:
        pass  # Cache ist Best-effort, nie ein Fail-Grund


def run(plan=None, format="condensed", worktree=".", scope="changed"):
    """Fuehrt die Linter aus; gibt das Ergebnis-Dict zurueck."""
    root = Path(worktree) if worktree else Path(".")
    plan_path = root / plan
    if not plan_path.is_file():
        return {
            "results": [], "summary": {"error": f"plan file missing: {plan_path}"},
            "plan": plan, "scope": scope, "exit": 2,
        }
    names = ("plan-lint", "ruff", "tsc")
    hashes = {n: _hash_inputs(_linter_inputs(n, root, plan)) for n in names}
    cache_file = _cache_path(root)
    cache = _load_cache(cache_file)
    fresh = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        pending = {}
        for name in names:
            entry = cache.get(name)
            prev = entry.get("result") if isinstance(entry, dict) else None
            hit = (isinstance(entry, dict) and entry.get("hash") == hashes[name]
                   and isinstance(prev, dict)
                   and prev.get("verdict", prev.get("status")) in ("ok", "fail"))
            if hit:
                saved = dict(prev)
                saved["verdict"] = prev.get("verdict", prev.get("status"))
                saved["status"] = "cached"
                fresh[name] = saved
            else:
                pending[name] = pool.submit(_run_linter, name, root, plan)
        for name, fut in pending.items():
            try:
                fresh[name] = fut.result()
            except Exception as exc:  # Worker darf den Lauf nie zerreissen
                fresh[name] = {"name": name, "status": "fail",
                               "findings": [f"linter crashed: {exc}"],
                               "duration_ms": 0}
    results = [fresh[n] for n in names]
    for item in results:
        item.setdefault("verdict", item["status"])
    _save_cache(cache_file, {n: {"hash": hashes[n], "result": fresh[n]} for n in names})
    runnable = [r for r in results if r["status"] != "skipped"]
    summary = {
        "total": len(results),
        "ok": sum(1 for r in results if r["verdict"] == "ok"),
        "failed": sum(1 for r in results if r["verdict"] == "fail"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
        "cached": sum(1 for r in results if r["status"] == "cached"),
        "findings": sum(len(r.get("findings", [])) for r in results),
    }
    if not runnable:
        exit_code = 2
    elif summary["failed"]:
        exit_code = 1
    else:
        exit_code = 0
    return {"results": results, "summary": summary, "plan": plan,
            "scope": scope, "exit": exit_code}


def _print_condensed(report):
    for item in report["results"]:
        for finding in item.get("findings", []):
            print(f"[{item['name']}] {finding}")
        if item["status"] == "skipped":
            print(f"[{item['name']}] SKIPPED: {item.get('warning', '')}")
        elif item["status"] == "cached":
            print(f"[{item['name']}] CACHED: inputs unchanged")
    summary = report["summary"]
    if summary.get("error"):
        print(f"[turbolint] ERROR: {summary['error']}")
    print(f"turbolint: {summary.get('findings', 0)} finding(s), "
          f"{summary.get('ok', 0)} ok, {summary.get('failed', 0)} failed, "
          f"{summary.get('skipped', 0)} skipped, {summary.get('cached', 0)} cached")


def main(argv=None):
    """CLI; gibt den Exit-Code zurueck."""
    parser = argparse.ArgumentParser(
        prog="python3 -m devflow turbolint",
        description="Paralleler Lint-Aggregator (V1: plan-lint, ruff, tsc).",
    )
    parser.add_argument("--plan", default=None,
                        help="Pfad zu tasks.md (Pflicht; kein Default mehr — T901749)")
    parser.add_argument("--format", choices=("condensed", "json"), default=None)
    parser.add_argument("--worktree", default=None)
    parser.add_argument("--scope", default=None)
    ns = parser.parse_args(list(sys.argv[1:] if argv is None else argv))
    stdin_data = _stdin_json()
    plan = ns.plan or stdin_data.get("plan")
    if not plan:
        # T901749: kein Default-Plan mehr (.agents/plans/ ist leer, SSOT ist
        # die DB) — --plan ist Pflicht, fail-closed mit actionable Message.
        print("--plan is required (default plan removed; staged plans live "
              "in tickets.ticket_plans — use ticket.sh plan-get)", file=sys.stderr)
        return 2
    fmt = ns.format or stdin_data.get("format") or "condensed"
    worktree = ns.worktree or stdin_data.get("worktree") or "."
    scope = ns.scope or stdin_data.get("scope") or "changed"
    report = run(plan=plan, format=fmt, worktree=worktree, scope=scope)
    if fmt == "json":
        print(json.dumps({k: report[k] for k in ("results", "summary")}))
    else:
        _print_condensed(report)
    return report["exit"]


if __name__ == "__main__":
    raise SystemExit(main())
