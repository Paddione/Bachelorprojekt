#!/usr/bin/env bash
# scripts/plan-intel-filter.sh <intel.json|slug> <target_file>...
# Emits the intel.json subset a partial-plan subagent needs: impact_files whose
# path is in the target list, symbols whose file matches, plus meta/db_tables/
# api_contracts/risks verbatim (small, correctness-critical).
# Hybrid-Kontext-Transfer Teil 1 (Design Entscheidung 7): deterministic filter,
# NOT embedding-based.
set -euo pipefail
src="${1:?usage: plan-intel-filter.sh <intel.json|slug> <target_file>...}"; shift
[[ -f "$src" ]] || src="openspec/changes/${src}/intel.json"
[[ -f "$src" ]] || { echo "intel.json not found: $src" >&2; exit 1; }
# NOTE: with `--args` jq treats every remaining CLI arg as a positional string,
# so the intel JSON must come via stdin (a file-arg would be swallowed as a
# positional). Target files become $ARGS.positional.
jq --args '
  ($ARGS.positional) as $t
  | .impact_files = [.impact_files[] | select(.path as $p | $t | index($p))]
  | .symbols      = [(.symbols // [])[] | select((.file // "") as $f | $t | index($f))]
' "$@" < "$src"
