#!/usr/bin/env bash
# Coverage-of-coverage guard for tests/unit/*.bats.
#
# Fails if any tests/unit/*.bats file is neither referenced by a test task in
# Taskfile.yml nor listed in tests/unit/.coverage-allowlist. This prevents the
# silent coverage drift the 2026-06-06 test-environment audit found: 31 bats
# files in tests/unit/ that no `task test:*` ever ran (so regressions in them
# could merge green). New unit tests must now be wired into a task OR explicitly
# allowlisted with a reason — no third, silent option.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

allowlist="tests/unit/.coverage-allowlist"
missing=()

while IFS= read -r f; do
  b="$(basename "$f" .bats)"
  # Referenced by a test task (subtasks invoke `tests/unit/<name>.bats`)?
  if grep -qF "${b}.bats" Taskfile.yml; then
    continue
  fi
  # Explicitly allowlisted (exact bare-basename line)?
  if [[ -f "$allowlist" ]] && grep -qxF "$b" "$allowlist"; then
    continue
  fi
  missing+=("$b")
done < <(find tests/unit -maxdepth 1 -name '*.bats' | sort)

if (( ${#missing[@]} > 0 )); then
  {
    echo "ERROR: tests/unit bats files run by no task and not in ${allowlist}:"
    printf '  - %s\n' "${missing[@]}"
    echo
    echo "Fix: wire each into a test task (e.g. test:unit), or add its bare basename"
    echo "to ${allowlist} with a comment explaining why it is not run offline."
  } >&2
  exit 1
fi

total="$(find tests/unit -maxdepth 1 -name '*.bats' | wc -l | tr -d ' ')"
echo "unit-coverage: all ${total} tests/unit/*.bats files are tracked (run by a task or allowlisted)."
