#!/usr/bin/env python3
"""seed-quality-goals.py — Seeds quality schema from goals-data.generated.json and updates snapshot (T016507)."""

import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))
import health_goals_record as hgr  # scripts/lib (T016657)


def get_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def run_psql(sql: str) -> bool:
    """Executes SQL via kubectl exec in shared-db pod, or direct psql if configured."""
    pg_url = os.environ.get("DATABASE_URL")
    if pg_url:
        res = subprocess.run(["psql", pg_url, "-v", "ON_ERROR_STOP=1"], input=sql, text=True, capture_output=True)
        return res.returncode == 0

    # Default: kubectl exec in shared-db
    ctx = os.environ.get("TICKET_CTX", "devmesh")
    ns = os.environ.get("TICKET_NS", "workspace")
    cmd_find_pod = [
        "kubectl", "--context", ctx, "-n", ns,
        "get", "pod", "-l", "app=shared-db", "--field-selector=status.phase=Running",
        "-o", "jsonpath={.items[0].metadata.name}"
    ]
    find_res = subprocess.run(cmd_find_pod, capture_output=True, text=True)
    pod = find_res.stdout.strip()
    if not pod:
        print("WARN: No Running shared-db pod found, skipping DB insert.", file=sys.stderr)
        return False

    cmd_exec = [
        "kubectl", "--context", ctx, "-n", ns, "exec", "-i", pod,
        "-c", "postgres", "--", "psql", "-U", "website", "-d", "website", "-v", "ON_ERROR_STOP=1"
    ]
    res = subprocess.run(cmd_exec, input=sql, text=True, capture_output=True)
    if res.returncode != 0:
        print(f"ERROR executing psql: {res.stderr}", file=sys.stderr)
        return False
    return True


def historical_measurement_sql(g: dict) -> str | None:
    """Historische Evidenz mit ihrer ursprünglichen Messzeit, idempotent.

    Ohne Zahl oder ohne belastbares measured_at wird nichts geschrieben — eine
    alte Messung bekommt nie NOW() als Zeitstempel (T016657). Dieselbe
    (Ziel, Messzeit, Wert)-Evidenz wird bei erneutem Seed nicht verdoppelt;
    neuere Live-Messungen bleiben über measured_at DESC vorne.
    """
    current = hgr.finite(g.get("current"))
    measured_at = hgr.iso_timestamp(g.get("measured_at"))
    if current is None or measured_at is None:
        return None
    status = hgr.evaluate(current, g.get("target"), g.get("baseline"), direction=g.get("direction"))
    details = {"source": "seed", "origin": g.get("source")}
    gid, value, ts = hgr.sql_text(hgr.goal_id(g["id"])), hgr.sql_number(current), hgr.sql_text(measured_at)
    return f"""
            INSERT INTO quality.repo_health_measurements (goal_id, current_value, status, measured_at, git_sha, git_branch, details)
            SELECT {gid}, {value}, {hgr.sql_text(status)}, {ts}::timestamptz, 'seed', 'main', {hgr.sql_text(json.dumps(details))}::jsonb
            WHERE NOT EXISTS (
                SELECT 1 FROM quality.repo_health_measurements
                WHERE goal_id = {gid} AND measured_at = {ts}::timestamptz AND current_value = {value}
            );
            """


def main():
    repo_root = get_repo_root()
    gen_json = repo_root / "components/website/src/lib/sdlc/goals-data.generated.json"
    snapshot_json = repo_root / "components/website/src/lib/sdlc/goals-data.snapshot.json"

    if not gen_json.is_file():
        print(f"ERROR: {gen_json} does not exist.", file=sys.stderr)
        sys.exit(1)

    goals_data = json.loads(gen_json.read_text(encoding="utf-8"))

    # 1. Update/write offline fallback snapshot
    snapshot_json.write_text(json.dumps(goals_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated offline snapshot: {snapshot_json} ({len(goals_data)} goals)")

    # 2. Build SQL statements
    statements = [
        "BEGIN;",
        "CREATE SCHEMA IF NOT EXISTS quality;",
    ]

    for g in goals_data:
        gid = g["id"].replace("'", "''")
        title = g["title"].replace("'", "''")
        cat = g.get("category", "General").replace("'", "''")
        prio = g.get("priority", "B").replace("'", "''")
        direction = g.get("direction", "lower").replace("'", "''")
        baseline = hgr.sql_number(g.get("baseline"))
        target = hgr.sql_number(g.get("target"))
        unit = (g.get("unit") or "").replace("'", "''")
        cmd = (g.get("measurement") or "").replace("'", "''")
        sql_goal = f"""
        INSERT INTO quality.repo_health_goals (id, title, category, priority, direction, baseline, target, unit, measurement_cmd, active)
        VALUES ('{gid}', '{title}', '{cat}', '{prio}', '{direction}', {baseline}, {target}, '{unit}', '{cmd}', TRUE)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            category = EXCLUDED.category,
            priority = EXCLUDED.priority,
            direction = EXCLUDED.direction,
            baseline = EXCLUDED.baseline,
            target = EXCLUDED.target,
            unit = EXCLUDED.unit,
            measurement_cmd = EXCLUDED.measurement_cmd,
            updated_at = NOW();
        """
        statements.append(sql_goal)

        meas = historical_measurement_sql(g)
        if meas:
            statements.append(meas)

    statements.append("COMMIT;")
    full_sql = "\n".join(statements)

    ok = run_psql(full_sql)
    if ok:
        print(f"Successfully seeded {len(goals_data)} goals into quality.repo_health_goals.")
    else:
        print("ERROR: Seeding DB skipped or failed — snapshot remains available for offline use.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
