"""Insta-CI: lokales Required-Check-Replikat (T901630).

Liest docs/code-quality/ci-map.yaml (SSOT CI-Jobname -> lokales Kommando)
mit einem minimalen Zeilen-Parser fuer das dort fixierte Flach-Schema
(kein PyYAML, das kein Stdlib ist) und fuehrt Jobs sequentiell mit je
eigenem Timeout aus.

CLI: instaci.py [job ...] (Default: alle gemappten Jobs), --list listet
nur die Job-IDs. Ausgabe im GitHub-Annotation-Format (::error::,
::warning::, ::notice::). Exit 0 alle gruen, 1 mindestens ein Job rot,
2 Map fehlt/ungueltig oder Job unbekannt. Aufruf aus dem Proxy:
{worktree} als JSON auf stdin. Stdlib-only, Ziel <= 250 Zeilen.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

DEFAULT_MAP = "docs/code-quality/ci-map.yaml"


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


def parse_ci_map(text):
    """Minimaler Parser fuer das ci-map-Flach-Schema.

    Akzeptiert nur: Kommentar-/Leerzeilen, `version: N`, `checks:`,
    zwei-Leerzeichen-Jobkeys und vier-Leerzeichen-Skalare
    (command/timeout/workdir). Alles andere -> ValueError.
    """
    checks = {}
    job = None
    seen_version = False
    in_checks = False
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()
        if indent == 0:
            in_checks = False
            if stripped == "checks:":
                in_checks = True
            elif stripped.startswith("version:"):
                seen_version = True
            else:
                raise ValueError(f"line {lineno}: unexpected top-level: {stripped}")
        elif indent == 2 and in_checks:
            if not stripped.endswith(":"):
                raise ValueError(f"line {lineno}: expected job key: {stripped}")
            job = stripped[:-1]
            if not job or job in checks:
                raise ValueError(f"line {lineno}: bad/duplicate job: {job}")
            checks[job] = {}
        elif indent == 4 and in_checks and job is not None:
            if ":" not in stripped:
                raise ValueError(f"line {lineno}: expected key: value: {stripped}")
            key, _, value = stripped.partition(":")
            key, value = key.strip(), value.strip()
            if key not in ("command", "timeout", "workdir"):
                raise ValueError(f"line {lineno}: unknown key: {key}")
            checks[job][key] = value
        else:
            raise ValueError(f"line {lineno}: bad indentation: {stripped}")
    if not seen_version:
        raise ValueError("missing version: 1")
    if not checks:
        raise ValueError("no checks mapped")
    for name, spec in checks.items():
        if not spec.get("command"):
            raise ValueError(f"job {name}: missing command")
        try:
            spec["timeout"] = int(spec.get("timeout", ""))
        except ValueError:
            raise ValueError(f"job {name}: timeout must be seconds") from None
        if spec["timeout"] <= 0:
            raise ValueError(f"job {name}: timeout must be positive")
    return checks


def load_ci_map(path):
    """Laedt und parst die Map; Fehler -> ValueError mit Pfad."""
    try:
        text = Path(path).read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"ci-map unreadable at {path}: {exc}") from None
    try:
        return parse_ci_map(text)
    except ValueError as exc:
        raise ValueError(f"ci-map invalid at {path}: {exc}") from None


def _run_job(name, spec, root):
    started = time.monotonic()
    cwd = spec.get("workdir") or str(root)
    if not os.path.isabs(cwd):
        cwd = str(Path(root) / cwd)
    try:
        proc = subprocess.run(
            spec["command"],
            shell=True,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=spec["timeout"],
        )
    except subprocess.TimeoutExpired:
        return {"job": name, "status": "fail",
                "detail": f"timeout after {spec['timeout']}s",
                "duration_ms": int((time.monotonic() - started) * 1000)}
    except OSError as exc:
        return {"job": name, "status": "fail", "detail": str(exc),
                "duration_ms": int((time.monotonic() - started) * 1000)}
    tail = (proc.stdout or "").strip().splitlines()[-3:]
    return {
        "job": name,
        "status": "ok" if proc.returncode == 0 else "fail",
        "detail": "exit %d%s" % (proc.returncode,
                                 (": " + " / ".join(tail)) if tail else ""),
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def run(jobs=(), worktree=".", map_path=DEFAULT_MAP):
    """Fuehrt Jobs aus (leer = alle); gibt das Ergebnis-Dict zurueck."""
    root = Path(worktree) if worktree else Path(".")
    checks = load_ci_map(root / map_path)
    wanted = list(jobs) if jobs else sorted(checks)
    unknown = [j for j in wanted if j not in checks]
    if unknown:
        raise ValueError(f"unknown job(s): {', '.join(unknown)}")
    results = []
    for name in wanted:
        print(f"instaci: [{len(results) + 1}/{len(wanted)}] {name} ...", flush=True)
        results.append(_run_job(name, checks[name], root))
    failed = sum(1 for r in results if r["status"] == "fail")
    return {"jobs": results,
            "summary": {"total": len(results), "ok": len(results) - failed,
                        "failed": failed},
            "exit": 1 if failed else 0}


def _annotate(report):
    for item in report["jobs"]:
        if item["status"] == "ok":
            print(f"::notice::{item['job']} ok ({item['duration_ms']}ms)")
        else:
            print(f"::error::{item['job']} failed: {item['detail']}")
    summary = report["summary"]
    level = "::error::" if summary["failed"] else "::notice::"
    print(f"{level}instaci: {summary['ok']}/{summary['total']} jobs green")


def main(argv=None):
    """CLI; gibt den Exit-Code zurueck."""
    parser = argparse.ArgumentParser(
        prog="python3 -m devflow insta_ci",
        description="Lokale Required-Checks aus ci-map.yaml ausfuehren.",
    )
    parser.add_argument("jobs", nargs="*", help="Job-IDs (Default: alle)")
    parser.add_argument("--list", action="store_true", help="nur Job-IDs listen")
    parser.add_argument("--map", default=None)
    parser.add_argument("--worktree", default=None)
    ns = parser.parse_args(list(sys.argv[1:] if argv is None else argv))
    stdin_data = _stdin_json()
    worktree = ns.worktree or stdin_data.get("worktree") or "."
    map_path = ns.map or stdin_data.get("map") or DEFAULT_MAP
    try:
        checks = load_ci_map(Path(worktree) / map_path)
    except ValueError as exc:
        print(json.dumps({"error": {"code": "devflow_env", "message": str(exc)}}),
              file=sys.stderr)
        return 2
    if ns.list:
        for name in sorted(checks):
            print(name)
        return 0
    jobs = ns.jobs or stdin_data.get("jobs") or []
    if isinstance(jobs, str):
        jobs = [jobs]
    try:
        report = run(jobs=jobs, worktree=worktree, map_path=map_path)
    except ValueError as exc:
        print(json.dumps({"error": {"code": "devflow_env", "message": str(exc)}}),
              file=sys.stderr)
        return 2
    _annotate(report)
    return report["exit"]


if __name__ == "__main__":
    raise SystemExit(main())
