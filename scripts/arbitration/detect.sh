#!/usr/bin/env bash
set -euo pipefail

GH_AXI="${GH_AXI:-gh-axi}"
GIT_ATTR="${GIT_ATTR:-.gitattributes}"

merge_ours_patterns() {
  if [ ! -f "$GIT_ATTR" ]; then
    return
  fi
  grep 'merge=ours' "$GIT_ATTR" 2>/dev/null | awk '{print $1}' | grep -v '^\s*$' || true
}

prs_json() {
  "$GH_AXI" pr list --json number,headRefName,headRefOid,isDraft,labels,statusCheckRollup,title --limit 100 2>/dev/null || echo '[]'
}

pr_diff_files() {
  local head_ref="$1"
  local base_ref="origin/main"
  if ! git rev-parse --verify "$base_ref" >/dev/null 2>&1; then
    base_ref="main"
  fi
  local pr_ref="origin/$head_ref"
  if ! git rev-parse --verify "$pr_ref" >/dev/null 2>&1; then
    pr_ref="$head_ref"
  fi
  git diff --name-only "$base_ref...$pr_ref" 2>/dev/null || echo ''
}

cluster_key() {
  printf '%s\0' "$@" | sha256sum | cut -d' ' -f1
}

eligible() {
  local is_draft="$1" ci_state="$2" labels_json="$3"
  [ "$is_draft" = "true" ] && return 1
  [ "$ci_state" != "SUCCESS" ] && [ "$ci_state" != "NEUTRAL" ] && [ "$ci_state" != "" ] && return 1
  if echo "$labels_json" | jq -e '.nodes | map(.name) | contains(["arbitration"])' >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

main() {
  local prs
  prs=$(prs_json)
  if [ "$(echo "$prs" | jq length)" -eq 0 ]; then
    echo '[]'
    return
  fi

  local ignored_patterns
  ignored_patterns=$(merge_ours_patterns)

  declare -A file_pr_map

  while IFS=$'\t' read -r number head_ref head_oid is_draft labels_json ci_state title; do
    local files
    files=$(pr_diff_files "$head_ref")
    if [ -z "$files" ]; then
      continue
    fi

    while IFS= read -r file; do
      [ -z "$file" ] && continue
      local skip=false
      if [ -n "$ignored_patterns" ]; then
        while IFS= read -r pattern; do
          [ -z "$pattern" ] && continue
          if echo "$file" | grep -q "^$pattern"; then
            skip=true
            break
          fi
        done <<< "$ignored_patterns"
      fi
      $skip && continue

      local ticket=""
      if echo "$title" | grep -qE '\[T[0-9]+\]'; then
        ticket=$(echo "$title" | sed 's/.*\(\[T[0-9]*\]\).*/\1/' | tr -d '[]')
      fi

      local is_eligible="false"
      local ineligible_reason=""
      if eligible "$is_draft" "$ci_state" "$labels_json"; then
        is_eligible="true"
      else
        if [ "$is_draft" = "true" ]; then
          ineligible_reason="draft"
        elif echo "$labels_json" | jq -e '.nodes | map(.name) | contains(["arbitration"])' >/dev/null 2>&1; then
          ineligible_reason="arbitration_label"
        else
          ineligible_reason="ci_red"
        fi
      fi

      local pr_entry
      pr_entry=$(jq -n \
        --argjson num "$number" \
        --arg sha "$head_oid" \
        --arg branch "$head_ref" \
        --arg t "$ticket" \
        --arg title "$title" \
        '{number: $num, head_sha: $sha, branch: $branch, ticket: $t, title: $title}')

      # Use underscore as internal separator key
      local key="$file"
      if [ -z "${file_pr_map[$key]:-}" ]; then
        file_pr_map["$key"]="[]"
      fi
      file_pr_map["$key"]=$(echo "${file_pr_map[$key]}" | jq --argjson entry "$pr_entry" \
        --argjson eligible "$is_eligible" \
        --arg reason "$ineligible_reason" \
        '. += [{"pr": $entry, "eligible": $eligible, "ineligible_reason": $reason}]')
    done <<< "$files"
  done < <(echo "$prs" | jq -r '.[] | [.number, .headRefName, .headRefOid, (.isDraft|tostring), (.labels|tostring), (.statusCheckRollup.state // ""), .title] | @tsv')

  local clusters=()
  local cluster_idx=0
  for file_key in "${!file_pr_map[@]}"; do
    local pr_list="${file_pr_map[$file_key]}"
    local eligible_count
    eligible_count=$(echo "$pr_list" | jq '[.[] | select(.eligible == true)] | length')
    if [ "$eligible_count" -lt 3 ]; then
      echo "DEBUG: unter Schwelle: $file_key ($eligible_count eligible)" >&2
      continue
    fi

    local eligible_prs_json
    eligible_prs_json=$(echo "$pr_list" | jq '[.[] | select(.eligible == true) | {number: .pr.number, head_sha: .pr.head_sha, ticket: .pr.ticket, branch: .pr.branch, title: .pr.title}]')
    local ineligible_prs_json
    ineligible_prs_json=$(echo "$pr_list" | jq '[.[] | select(.eligible == false) | {number: .pr.number, reason: .ineligible_reason}]')

    local files_arr="[\"$file_key\"]"
    local nums
    nums=$(echo "$eligible_prs_json" | jq -r '.[].number' | sort -n | tr '\n' ',' | sed 's/,$//')
    local shas
    shas=$(echo "$eligible_prs_json" | jq -r '.[].head_sha' | sort | tr '\n' ',' | sed 's/,$//')
    local ckey
    ckey=$(cluster_key "$file_key" "$nums" "$shas")

    if [ "$cluster_idx" -gt 0 ]; then
      clusters+=(", ")
    fi
    clusters+=("$(jq -n \
      --arg ck "$ckey" \
      --argjson files "$files_arr" \
      --argjson eligible "$eligible_prs_json" \
      --argjson ineligible "$ineligible_prs_json" \
      '{cluster_key: $ck, files: $files, eligible_prs: $eligible, ineligible_prs: $ineligible}')")
    cluster_idx=$((cluster_idx + 1))
  done

  local joined
  joined=$(IFS=''; echo "${clusters[*]}")
  echo "[$joined]"
}

main "$@"
