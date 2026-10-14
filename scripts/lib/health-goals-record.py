#!/usr/bin/env python3
"""Validate a scanner packet and atomically record it through the existing psql boundary."""
import datetime
import json
import math
import re
import subprocess
import sys


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def goal_ids(artifact, taskfile=None):
    with open(artifact, encoding='utf-8') as stream:
        goals = json.load(stream)
    ids = [goal['id'] for goal in goals]
    if not ids or not all(isinstance(gid, str) and gid for gid in ids):
        raise ValueError('invalid goal definitions')
    if taskfile:
        with open(taskfile, encoding='utf-8') as stream:
            matches = re.findall(r'^  HG_LOCAL_ONLY_GOALS:[ \t]+(G-[A-Z0-9,-]+)[ \t]*$', stream.read(), re.MULTILINE)
        if len(matches) != 1:
            raise ValueError('missing or ambiguous local-only goal registry')
        excluded = set(matches[0].split(','))
        if not excluded or not excluded <= set(ids):
            raise ValueError('invalid local-only goal registry')
        ids = [gid for gid in ids if gid not in excluded]
    return ids


def main():
    if sys.argv[1] == '--ids':
        print('\n'.join(goal_ids(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None)))
        return
    path, sha, branch, pod, ctx, ns = sys.argv[1:7]
    with open(path, encoding="utf-8") as stream:
        data = json.load(stream)
    if not isinstance(data, list):
        raise ValueError("scanner output must be an array")
    statements = ["BEGIN;"]
    for item in data:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise ValueError("invalid measurement identity")
        measurable = item.get("measurable") is True
        actual, target, cmp = item.get("actual"), item.get("target"), item.get("cmp")
        if measurable and (not finite(actual) or not finite(target) or cmp not in ("le", "ge", "eq")):
            raise ValueError("invalid numeric measurement")
        status = "unknown"
        if measurable:
            met = actual <= target if cmp == "le" else actual >= target if cmp == "ge" else actual == target
            status = "achieved" if met else "at_risk"
        value = str(actual) if measurable else "NULL"
        measured_at = 'NOW()'
        if item.get('measured_at'):
            observed = datetime.datetime.fromisoformat(item['measured_at'].replace('Z', '+00:00'))
            if observed.tzinfo is None:
                raise ValueError('measurement timestamp requires timezone')
            measured_at = literal(observed.isoformat()) + '::timestamptz'
        details = literal(json.dumps(dict(source="daemon", **item), allow_nan=False))
        statements.append("INSERT INTO quality.repo_health_measurements "
                          "(goal_id, current_value, status, git_sha, git_branch, details, measured_at) "
                          f"VALUES ({literal(item['id'])}, {value}, {literal(status)}, "
                          f"{literal(sha)}, {literal(branch)}, {details}::jsonb, {measured_at});")
    statements.append("COMMIT;")
    command = ["kubectl", "--context", ctx, "-n", ns, "exec", "-i", pod,
               "-c", "postgres", "--", "psql", "-U", "website", "-d", "website",
               "-q", "-v", "ON_ERROR_STOP=1"]
    subprocess.run(command, input="\n".join(statements), text=True, check=True)


if __name__ == "__main__":
    main()
