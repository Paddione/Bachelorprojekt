#!/usr/bin/env python3
"""Bewertung und SQL-Aufbau für Health-Goal-Messungen (T016657).

Gemeinsamer Helper für scripts/sdlc/health-goals-daemon.sh und
scripts/sdlc/seed-quality-goals.py. Die Bewertungsregeln spiegeln
components/website/src/lib/sdlc/goal-evaluation.ts:

- nur endliche Zahlen sind Evidenz; fehlt current/target → unknown
- Vergleich le/ge/eq (Scan) bzw. lower/higher (Zieldefinition)
- Ziel 0 ist gültig; baseline == target und Grenze verletzt → critical
- ohne baseline: erfüllt → achieved, sonst on_track (konservativ)

CLI: health_goals_record.py daemon-sql <scan.json> <sha> <branch> [<goals.json>]
     schreibt das SQL auf stdout; Exit 1 bei kaputtem Scan-JSON.
"""
from __future__ import annotations

import datetime as _dt
import json
import math
import re
import sys

STATUSES = ("critical", "at_risk", "on_track", "achieved", "unknown")
_GOAL_ID = re.compile(r"^G-[A-Z0-9][A-Z0-9-]{0,29}$")


def finite(value):
    """Endliche Zahl oder None (bool, NaN, Infinity und Strings ohne Zahl zählen nicht)."""
    if value is None or isinstance(value, bool):
        return None
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return num if math.isfinite(num) else None


def comparison_for(direction):
    return "ge" if direction == "higher" else "le"


def is_met(current, target, cmp):
    if cmp == "eq":
        return current == target
    return current <= target if cmp == "le" else current >= target


def evaluate(current, target, baseline=None, cmp=None, direction=None):
    current, target, baseline = finite(current), finite(target), finite(baseline)
    if current is None or target is None:
        return "unknown"
    cmp = cmp if cmp in ("le", "ge", "eq") else comparison_for(direction)
    if is_met(current, target, cmp):
        return "achieved"
    if baseline is None:
        return "on_track"
    span = abs(target - baseline)
    if span == 0:
        return "critical"
    if cmp == "eq":
        progress = (span - abs(current - target)) / span
    elif cmp == "le":
        progress = (baseline - current) / span
    else:
        progress = (current - baseline) / span
    if progress >= 0.8:
        return "on_track"
    if progress >= 0.3:
        return "at_risk"
    return "critical" if progress < 0 else "at_risk"


def sql_text(value):
    """Kontrolliert escapter SQL-String-Literal oder NULL."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("'", "''") + "'"  # standard_conforming_strings


def sql_number(value):
    num = finite(value)
    return "NULL" if num is None else repr(int(num) if num.is_integer() else num)


def goal_id(value):
    if not isinstance(value, str) or not _GOAL_ID.match(value):
        raise ValueError(f"ungültige Ziel-ID: {value!r}")
    return value


def iso_timestamp(value):
    """ISO-Datum/-Zeitpunkt validieren; None wenn keine ehrliche Messzeit vorliegt."""
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        _dt.datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return value.strip()


def measurement_values(gid, current, status, sha, branch, details):
    if status not in STATUSES:
        raise ValueError(f"ungültiger Status: {status!r}")
    return ", ".join([sql_text(goal_id(gid)), sql_number(current), sql_text(status),
                      sql_text(sha), sql_text(branch), sql_text(json.dumps(details)) + "::jsonb"])


def daemon_sql(items, sha, branch, baselines):
    """SQL für einen Daemon-Lauf; [] wenn nichts zu speichern ist."""
    if not isinstance(items, list):
        raise TypeError("Scan-Ausgabe ist kein JSON-Array")
    rows = []
    for item in items:
        if not isinstance(item, dict):
            raise TypeError(f"Scan-Eintrag ist kein Objekt: {item!r}")
        gid = goal_id(item.get("id"))
        measurable = item.get("measurable") is True
        current = finite(item.get("actual")) if measurable else None
        target = finite(item.get("target")) if measurable else None
        cmp = item.get("cmp") if measurable else None
        status = evaluate(current, target, baselines.get(gid), cmp=cmp)
        details = {"source": "health-goals-daemon", "measurable": measurable,
                   "cmp": cmp, "target": target}
        rows.append(f"({measurement_values(gid, current, status, sha, branch, details)})")
    if not rows:
        return []
    return ["BEGIN;",
            "INSERT INTO quality.repo_health_measurements "
            "(goal_id, current_value, status, git_sha, git_branch, details) VALUES\n  "
            + ",\n  ".join(rows) + ";",
            "COMMIT;"]


def load_baselines(path):
    if not path:
        return {}
    try:
        with open(path, encoding="utf-8") as fh:
            goals = json.load(fh)
    except FileNotFoundError:
        return {}
    return {g["id"]: g.get("baseline") for g in goals if isinstance(g, dict) and "id" in g}


def main(argv):
    if len(argv) < 4 or argv[0] != "daemon-sql":
        print(__doc__, file=sys.stderr)
        return 2
    scan_path, sha, branch = argv[1:4]
    try:
        with open(scan_path, encoding="utf-8") as fh:
            items = json.load(fh)
        sql = daemon_sql(items, sha, branch, load_baselines(argv[4] if len(argv) > 4 else None))
    except (OSError, TypeError, ValueError) as exc:
        print(f"ERROR: Scan-Ergebnis unbrauchbar: {exc}", file=sys.stderr)
        return 1
    print("\n".join(sql))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
