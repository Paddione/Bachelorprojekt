#!/usr/bin/env bash
# pytest-run.sh — single entry point for the native pytest suite (tests/py). [T901392]
#
# Replaces the BATS runners (tests/bats, scripts/lib/run-bats.sh). Uses uv when
# available, otherwise a pip-installed pytest. Runs in parallel (-n auto) unless
# PYTEST_JOBS overrides the worker count (PYTEST_JOBS=0 runs serially).
#
# Usage:  scripts/pytest-run.sh [pytest args...] [paths...]
#         (no paths -> the whole tests/py suite)
#
# Sharding: SPEC_SHARD=<n> SPEC_SHARDS=<m> keeps only every m-th test module
# (see tests/py/conftest.py). Live tests under tests/py/local run only with
# PYTEST_LOCAL=1 (tests/runner.sh local sets it).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

has_path=0
for arg in "$@"; do
  # Option values like `-p no:cacheprovider` are not paths; only existing paths count.
  case "$arg" in -*) ;; *) [ -e "${arg%%::*}" ] && has_path=1 ;; esac
done
[ "$has_path" -eq 1 ] || set -- "$@" tests/py

jobs="${PYTEST_JOBS:-auto}"
xdist_args=()
[ "$jobs" = "0" ] || xdist_args=(-n "$jobs")

if command -v uv >/dev/null 2>&1; then
  exec uv run -q --with pytest --with pyyaml --with pytest-xdist --with jinja2 \
    pytest -c tests/py/pytest.ini "${xdist_args[@]}" "$@"
fi

if ! python3 -c 'import pytest, xdist, yaml, jinja2' >/dev/null 2>&1; then
  python3 -m pip install --quiet --break-system-packages pytest pytest-xdist pyyaml jinja2 \
    || python3 -m pip install --quiet --user pytest pytest-xdist pyyaml jinja2
fi
exec python3 -m pytest -c tests/py/pytest.ini "${xdist_args[@]}" "$@"
