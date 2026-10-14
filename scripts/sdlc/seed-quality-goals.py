#!/usr/bin/env python3
"""seed-quality-goals.py — Seeds quality schema from goals-data.generated.json and updates snapshot (T016507)."""

import argparse
import datetime
import math
import json
import os
import subprocess
import sys
from pathlib import Path


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


def numeric(value):
    if value is None:
        return "NULL"
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise ValueError("seed values must be finite numbers")
    return str(value)


def main(argv=()):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--definitions-only', action='store_true', help='Upsert definitions without importing historical measurements or rewriting snapshot')
    parser.add_argument('--initialize-schema', action='store_true', help='Apply the existing idempotent quality migration in the same transaction')
    args = parser.parse_args(argv)
    if os.environ.get('DRY_RUN') == '1':
        print('Dry run: quality database and snapshot remain unchanged.')
        return
    repo_root = get_repo_root()
    gen_json = repo_root / "components/website/src/lib/sdlc/goals-data.generated.json"
    snapshot_json = repo_root / "components/website/src/lib/sdlc/goals-data.snapshot.json"

    if not gen_json.is_file():
        print(f"ERROR: {gen_json} does not exist.", file=sys.stderr)
        sys.exit(1)

    goals_data = json.loads(gen_json.read_text(encoding="utf-8"))

    # 1. Update/write offline fallback snapshot
    if not args.definitions_only:
        snapshot_json.write_text(json.dumps(goals_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Updated offline snapshot: {snapshot_json} ({len(goals_data)} goals)")

    # 2. Build SQL statements
    statements = [
        "BEGIN;",
        "CREATE SCHEMA IF NOT EXISTS quality;",
    ]

    if args.initialize_schema:
        migration = repo_root / 'scripts/migrations/2026-10-12-quality-schema-T016507.sql'
        statements.append(migration.read_text(encoding='utf-8'))

    for g in goals_data:
        gid = g["id"].replace("'", "''")
        title = g["title"].replace("'", "''")
        cat = g.get("category", "General").replace("'", "''")
        prio = g.get("priority", "B").replace("'", "''")
        direction = g.get("direction", "lower").replace("'", "''")
        baseline = numeric(g.get("baseline"))
        target = numeric(g.get("target"))
        unit = (g.get("unit") or "").replace("'", "''")
        cmd = (g.get("measurement") or "").replace("'", "''")
        current = "NULL" if args.definitions_only else numeric(g.get("current"))
        status = (g.get("status") or "unknown").replace("'", "''")

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

        if not args.definitions_only and current != "NULL" and g.get("measured_at"):
            # Source timestamps identify historical seed evidence. No NOW relabeling.
            measured_at = datetime.datetime.fromisoformat(g["measured_at"].replace("Z", "+00:00")).isoformat()
            if not math.isfinite(float(current)):
                raise ValueError(f"nonfinite historical value for {gid}")
            details = json.dumps({"source": g.get("source", ""), "historical_seed": True}).replace("'", "''")
            sql_meas = f"""
            UPDATE quality.repo_health_measurements SET measured_at = '{measured_at}'::timestamptz,
                details = details || '{details}'::jsonb
            WHERE goal_id = '{gid}' AND git_sha = 'seed' AND git_branch = 'main'
                AND current_value IS NOT DISTINCT FROM {current}
                AND NOT (details ? 'historical_seed');
            INSERT INTO quality.repo_health_measurements (goal_id, current_value, status, git_sha, git_branch, measured_at, details)
            SELECT '{gid}', {current}, '{status}', 'seed', 'main', '{measured_at}'::timestamptz, '{details}'::jsonb
            WHERE NOT EXISTS (SELECT 1 FROM quality.repo_health_measurements
                WHERE goal_id = '{gid}' AND git_sha = 'seed' AND measured_at = '{measured_at}'::timestamptz
                    AND current_value IS NOT DISTINCT FROM {current});
            """
            statements.append(sql_meas)

    statements.append("COMMIT;")
    full_sql = "\n".join(statements)

    ok = run_psql(full_sql)
    if ok:
        print(f"Successfully seeded {len(goals_data)} goals into quality.repo_health_goals.")
    else:
        print("ERROR: Seeding DB failed; snapshot remains available for offline use.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
