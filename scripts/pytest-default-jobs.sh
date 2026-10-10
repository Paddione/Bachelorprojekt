#!/usr/bin/env bash
# pytest-default-jobs.sh — default xdist worker count for scripts/pytest-run.sh.
#
# Same formula as tests/runner.sh JOBS (nproc/2, clamped to 1..4): measured on
# a 12-CPU box, tests/py/unit takes 142s serial, 58s with 4 workers and 59s
# with -n auto (12 workers) — auto only adds processes, not speed, and raises
# contention risk on suites with shared fixtures. Prints the number to stdout.
set -euo pipefail

nproc_val="${PYTEST_DEFAULT_JOBS_NPROC:-$(nproc 2>/dev/null || echo 2)}"
jobs=$((nproc_val / 2))
[ "$jobs" -lt 1 ] && jobs=1
[ "$jobs" -gt 4 ] && jobs=4
printf '%s\n' "$jobs"
