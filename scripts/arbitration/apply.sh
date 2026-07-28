#!/usr/bin/env bash
set -euo pipefail

GH_AXI="${GH_AXI:-gh-axi}"
TICKET_SH="${TICKET_SH:-./scripts/vda.sh ticket}"
SYNTHESIZE="${SYNTHESIZE:-$(dirname "$0")/synthesize.mjs}"
SHARED_STATE="${SHARED_STATE:-scripts/factory/shared-state-paths.txt}"
CONFIDENCE_THRESHOLD="${CONFIDENCE_THRESHOLD:-0.8}"

syntax_check() {
  local file="$1"
  local ext="${file##*.}"
  case "$ext" in
    js|mjs) node --check "$file" 2>/dev/null ;;
    sh) bash -n "$file" 2>/dev/null ;;
    json) jq empty "$file" 2>/dev/null ;;
    bats) bash tests/unit/lib/bats-core/bin/bats --count "$file" 2>/dev/null ;;
    yaml|yml) python3 -c "import yaml; yaml.safe_load(open('$file'))" 2>/dev/null ;;
    ts|tsx) return 0 ;;  # skip TS — no runtime check without project config
    *) return 0 ;;
  esac
}

load_cluster() {
  if [ -t 0 ]; then
    echo "Usage: $0 < cluster.json" >&2
    exit 1
  fi
  cat
}

check_idempotent() {
  local cluster_key="$1"
  if "$GH_AXI" pr list --json title,labels,headRefName 2>/dev/null | jq -e \
    --arg key "$cluster_key" '.[] | select(.headRefName | startswith("chore/merge-arbitration-")) | select(.labels | any(.name == "arbitration")) | select(.title | contains($key))' >/dev/null 2>&1; then
    echo "IDEMPOTENT: cluster_key $cluster_key already has open arbitration PR" >&2
    return 0
  fi
  return 1
}

check_risk_path() {
  local files_json="$1"
  if [ ! -f "$SHARED_STATE" ]; then
    return 1
  fi
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    if echo "$files_json" | jq -e --arg p "$pattern" 'any(.[]; startswith($p))' >/dev/null 2>&1; then
      echo "RISK: file matches $pattern" >&2
      return 0
    fi
  done < "$SHARED_STATE"
  return 1
}

escalate() {
  local cluster="$1"
  local reason="$2"
  local cluster_key
  cluster_key=$(echo "$cluster" | jq -r '.cluster_key')
  local files
  files=$(echo "$cluster" | jq -r '.files | join(", ")')
  local prs
  prs=$(echo "$cluster" | jq -r '[.eligible_prs[].number] | join(", ")')

  echo "--- ESCALATION: $reason ---" >&2
  echo "cluster_key: $cluster_key" >&2
  echo "files: $files" >&2
  echo "PRs: $prs" >&2
}

apply_arbitration() {
  local cluster="$1"
  local synthesis="$2"
  local cluster_key
  cluster_key=$(echo "$cluster" | jq -r '.cluster_key')

  local branch="chore/merge-arbitration-${cluster_key:0:12}"
  if git rev-parse --verify "$branch" >/dev/null 2>&1; then
    git branch -D "$branch"
  fi
  git checkout -b "$branch" origin/main 2>/dev/null || git checkout -b "$branch" main

  while IFS=$'\t' read -r file content; do
    echo "$content" > "$file"
    git add "$file"
  done < <(echo "$synthesis" | jq -r '.merged | to_entries[] | [.key, .value] | @tsv')

  git commit -m "merge-arbitration: $cluster_key" 2>/dev/null || true
  git push origin "$branch" 2>/dev/null || echo "PUSH FAILED (non-fatal)" >&2

  local pr_body
  pr_body=$(echo "$synthesis" | jq -r "\"Cluster: $cluster_key\\n\\n\" + .rationale")
  "$GH_AXI" pr create \
    --title "merge-arbitration [$cluster_key]" \
    --body "$pr_body" \
    --label arbitration \
    --base main \
    --head "$branch" 2>/dev/null || echo "PR CREATE FAILED (non-fatal)" >&2

  git checkout main 2>/dev/null || true
}

main() {
  local cluster
  cluster=$(load_cluster)
  local cluster_key
  cluster_key=$(echo "$cluster" | jq -r '.cluster_key')

  if check_idempotent "$cluster_key"; then
    exit 0
  fi

  local risk_paths
  if risk_paths=$(check_risk_path "$(echo "$cluster" | jq '.files')"); then
    escalate "$cluster" "risk_path: $risk_paths"
    exit 0
  fi

  local synthesis
  if ! synthesis=$(node "$SYNTHESIZE" <<< "$cluster" 2>/dev/null); then
    escalate "$cluster" "synthesis_failed"
    exit 0
  fi

  local confidence
  confidence=$(echo "$synthesis" | jq -r '.confidence // 0')
  if (( $(echo "$confidence < $CONFIDENCE_THRESHOLD" | bc -l 2>/dev/null || echo 1) )); then
    escalate "$cluster" "low_confidence: $confidence < $CONFIDENCE_THRESHOLD"
    exit 0
  fi

  while IFS= read -r file; do
    [ -z "$file" ] && continue
    local tmpdir
    tmpdir=$(mktemp -d)
    echo "$synthesis" | jq -r --arg f "$file" '.merged[$f] // ""' > "$tmpdir/$(basename "$file")"
    if ! syntax_check "$tmpdir/$(basename "$file")"; then
      escalate "$cluster" "syntax_gate: $file"
      rm -rf "$tmpdir"
      exit 0
    fi
    rm -rf "$tmpdir"
  done < <(echo "$cluster" | jq -r '.files[]')

  apply_arbitration "$cluster" "$synthesis"
}

main "$@"
