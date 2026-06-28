#!/usr/bin/env bash
# scripts/vda/release-notes.sh — Release notes generator from merged PRs
# Usage: release-notes.sh <generate|publish-github|publish-changelog|help> [args]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/vda-core.sh"

_show_help() {
  vda_header "Release Notes Generator"
  echo "Usage: release-notes.sh <subcommand> [args]"
  echo ""
  echo "Subcommands:"
  echo "  generate          Build release notes from merged PRs since last tag"
  echo "  publish-github    Set GitHub Release body"
  echo "  publish-changelog Prepend new section to CHANGELOG.md"
  echo "  help              Show this help"
  echo ""
  echo "Options (generate):"
  echo "  --since <tag|date>   Start from this tag or date (default: last git tag)"
  echo "  --out <file>         Write notes to file instead of stdout"
  echo ""
  echo "Options (publish-github):"
  echo "  --tag <tag>          Target release tag (default: last git tag)"
  echo "  --notes-file <file>  Read notes from file (required)"
  echo "  --dry-run            Show command without executing"
  echo ""
  echo "Options (publish-changelog):"
  echo "  --notes-file <file>  Read notes from file (required)"
  echo "  --dry-run            Show diff without modifying file"
}

_get_last_tag() {
  local tag
  tag=$(git describe --tags --abbrev=0 2>/dev/null) || true
  if [[ -z "$tag" ]]; then
    # Fallback: first commit date
    echo "HEAD~50"
    return
  fi
  echo "$tag"
}

_get_tag_date() {
  local tag="$1"
  git log -1 --format=%cI "$tag" 2>/dev/null || date -Iseconds
}

_collect_prs() {
  local since_date="$1"
  local prs_json
  if command -v gh &>/dev/null; then
    prs_json=$(gh pr list --state merged --search "merged:>=${since_date}" \
      --json number,title,labels,mergedAt 2>/dev/null) || true
    if [[ -n "$prs_json" ]] && jq -e '. | length > 0' <<<"$prs_json" &>/dev/null; then
      echo "$prs_json"
      return
    fi
  fi
  echo "[]"
}

_collect_commits() {
  local since_ref="$1"
  git log "${since_ref}..HEAD" --format='%s' 2>/dev/null || true
}

_detect_type() {
  # Detect conventional commit type from PR title or commit subject
  local title="$1"
  # Match conventional commit: type(scope): subject or type: subject
  local re='^([a-zA-Z]+)(\([^)]*\))?!?:'
  if [[ "$title" =~ $re ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  # Detect from label patterns
  if [[ "$title" =~ [[:space:]]Label: ]]; then
    local label_part="${title#*Label: }"
    if [[ "$label_part" =~ ^type: ]]; then
      echo "${label_part#type:}"
      return
    fi
  fi
  echo "chore"
}

_ensure_type_key() {
  case "$1" in feat) echo "Features";; fix) echo "Bug Fixes";; perf) echo "Performance";; refactor) echo "Code Refactoring";; docs) echo "Documentation";; test) echo "Tests";; build) echo "Build System";; ci) echo "CI/CD";; revert) echo "Reverts";; chore|*) echo "Miscellaneous";; esac
}

_section_order() {
  case "$1" in "Features") echo 1;; "Bug Fixes") echo 2;; "Performance") echo 3;; "Code Refactoring") echo 4;; "Documentation") echo 5;; "Tests") echo 6;; "Build System") echo 7;; "CI/CD") echo 8;; "Miscellaneous") echo 9;; "Reverts") echo 10;; *) echo 99;; esac
}

_build_deterministic_notes() {
  local since_ref="$1"
  local since_date="$2"
  local notes=""

  local feat_list="" fix_list="" perf_list="" refactor_list=""
  local docs_list="" test_list="" build_list="" ci_list="" chore_list="" revert_list=""

  _append() {
    local list_name="$1" entry="$2"
    case "$list_name" in
      Features)         feat_list+=$'\n'"$entry" ;;
      "Bug Fixes")      fix_list+=$'\n'"$entry" ;;
      Performance)      perf_list+=$'\n'"$entry" ;;
      "Code Refactoring") refactor_list+=$'\n'"$entry" ;;
      Documentation)    docs_list+=$'\n'"$entry" ;;
      Tests)            test_list+=$'\n'"$entry" ;;
      "Build System")   build_list+=$'\n'"$entry" ;;
      "CI/CD")          ci_list+=$'\n'"$entry" ;;
      Miscellaneous)    chore_list+=$'\n'"$entry" ;;
      Reverts)          revert_list+=$'\n'"$entry" ;;
    esac
  }

  _emit_section() {
    local title="$1" entries="$2"
    if [[ -n "${entries:-}" ]]; then
      notes+="## ${title}\n\n${entries#$'\n'}\n\n"
    fi
  }

  local prs_json
  prs_json=$(_collect_prs "$since_date")
  local pr_count
  pr_count=$(jq -r '. | length' <<<"$prs_json" 2>/dev/null || echo "0")

  if [[ "$pr_count" -gt 0 ]]; then
    local i=0
    while [[ "$i" -lt "$pr_count" ]]; do
      local title
      title=$(jq -r ".[$i].title" <<<"$prs_json" 2>/dev/null || echo "")
      local pr_num
      pr_num=$(jq -r ".[$i].number" <<<"$prs_json" 2>/dev/null || echo "?")
      if [[ -n "$title" ]]; then
        local typ section
        typ=$(_detect_type "$title")
        section=$(_ensure_type_key "$typ")
        _append "$section" "- ${title} (#${pr_num})"
      fi
      i=$((i + 1))
    done
  fi

  if [[ "$pr_count" -eq 0 ]]; then
    notes+="> Generated from commit history (gh CLI unavailable or no merged PRs found).\n\n"
    local commits
    commits=$(_collect_commits "$since_ref")
    while IFS= read -r commit_subject; do
      if [[ -n "$commit_subject" ]]; then
        local typ section
        typ=$(_detect_type "$commit_subject")
        section=$(_ensure_type_key "$typ")
        _append "$section" "- ${commit_subject}"
      fi
    done <<<"$commits"
  fi

  _emit_section "Features"           "$feat_list"
  _emit_section "Bug Fixes"          "$fix_list"
  _emit_section "Performance"        "$perf_list"
  _emit_section "Code Refactoring"   "$refactor_list"
  _emit_section "Documentation"      "$docs_list"
  _emit_section "Tests"              "$test_list"
  _emit_section "Build System"       "$build_list"
  _emit_section "CI/CD"              "$ci_list"
  _emit_section "Miscellaneous"      "$chore_list"
  _emit_section "Reverts"            "$revert_list"

  echo -e "$notes"
}

_deepseek_narrative() {
  local pr_titles="$1"
  if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
    return 1
  fi
  local base_url="${DEEPSEEK_BASE_URL:-https://api.deepseek.com/v1}"
  local prompt="Fasse diese gemergten PRs zu einer kurzen, user-freundlichen 'Was ist neu'-Einleitung im Markdown-Format zusammen. Nutze Aufzählungen, fokussiere auf Nutzerwert. Maximal 3-4 Sätze.
PRs:
${pr_titles}"

  local llm_response
  llm_response=$(curl -s --max-time 30 "${base_url}/chat/completions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
    -d "$(jq -n --arg prompt "$prompt" '{
      model: "deepseek-chat",
      messages: [{role: "user", content: $prompt}],
      temperature: 0,
      max_tokens: 500
    }')" 2>/dev/null | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)

  if [[ -n "$llm_response" ]]; then
    echo "$llm_response"
    return 0
  fi
  return 1
}

_generate() {
  local since_ref=""
  local out_file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --since) since_ref="$2"; shift 2 ;;
      --out) out_file="$2"; shift 2 ;;
      --help|-h) _show_help; exit 0 ;;
      *) vda_error "Unknown option: $1"; exit 2 ;;
    esac
  done

  if [[ -z "$since_ref" ]]; then
    since_ref=$(_get_last_tag)
  fi

  local since_date
  since_date=$(_get_tag_date "$since_ref")
  local repo_tag
  if git describe --tags --abbrev=0 &>/dev/null; then
    repo_tag=$(git describe --tags --abbrev=0 2>/dev/null)
  else
    repo_tag="HEAD"
  fi

  # Collect PR titles for LLM prompt
  local prs_json pr_count pr_titles
  prs_json=$(_collect_prs "$since_date")
  pr_count=$(jq -r '. | length' <<<"$prs_json" 2>/dev/null || echo "0")
  pr_titles=""
  if [[ "$pr_count" -gt 0 ]]; then
    pr_titles=$(jq -r '.[].title' <<<"$prs_json" 2>/dev/null || true)
  fi

  # Build deterministic section notes
  local sections
  sections=$(_build_deterministic_notes "$since_ref" "$since_date")

  # Build final notes with header
  local notes
  notes="# Release Notes (${repo_tag})\n\n"

  # Try LLM narrative
  local narrative=""
  if [[ -n "$pr_titles" ]]; then
    if narrative=$(_deepseek_narrative "$pr_titles") && [[ -n "$narrative" ]]; then
      notes+="## Was ist neu?\n\n${narrative}\n\n---\n\n"
    fi
  fi

  notes+="${sections}"

  if [[ -n "$out_file" ]]; then
    echo -e "$notes" > "$out_file"
    vda_success "Release notes written to $out_file"
  else
    echo -e "$notes"
  fi
}

_publish_github() {
  local tag=""
  local notes_file=""
  local dry_run=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --tag) tag="$2"; shift 2 ;;
      --notes-file) notes_file="$2"; shift 2 ;;
      --dry-run) dry_run=1; shift ;;
      --help|-h) _show_help; exit 0 ;;
      *) vda_error "Unknown option: $1"; exit 2 ;;
    esac
  done

  if [[ -z "$tag" ]]; then
    tag=$(_get_last_tag)
  fi
  if [[ -z "$notes_file" ]]; then
    vda_error "--notes-file is required"
    exit 2
  fi
  if [[ ! -f "$notes_file" ]]; then
    vda_error "Notes file not found: $notes_file"
    exit 2
  fi

  if command -v gh &>/dev/null; then
    if [[ "$dry_run" -eq 1 ]]; then
      vda_dry_run "gh release edit $tag --notes-file $notes_file"
    else
      gh release edit "$tag" --notes-file "$notes_file" 2>/dev/null && \
        vda_success "GitHub Release body updated for $tag" || \
        vda_warn "Failed to update GitHub Release. Try 'gh release create $tag --notes-file $notes_file'"
    fi
  else
    vda_warn "gh CLI not available — cannot publish to GitHub"
    exit 0
  fi
}

_publish_changelog() {
  local notes_file=""
  local dry_run=0

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --notes-file) notes_file="$2"; shift 2 ;;
      --dry-run) dry_run=1; shift ;;
      --help|-h) _show_help; exit 0 ;;
      *) vda_error "Unknown option: $1"; exit 2 ;;
    esac
  done

  if [[ -z "$notes_file" ]]; then
    vda_error "--notes-file is required"
    exit 2
  fi
  if [[ ! -f "$notes_file" ]]; then
    vda_error "Notes file not found: $notes_file"
    exit 2
  fi

  local changelog_file="CHANGELOG.md"
  local notes_content
  notes_content=$(cat "$notes_file")

  if [[ "$dry_run" -eq 1 ]]; then
    echo "[DRY_RUN] Would prepend to $changelog_file:"
    echo "---"
    echo "$notes_content" | head -10
    echo "..."
    exit 0
  fi

  if [[ -f "$changelog_file" ]]; then
    local tmp
    tmp=$(mktemp)
    echo -e "$notes_content\n\n" > "$tmp"
    cat "$changelog_file" >> "$tmp"
    mv "$tmp" "$changelog_file"
  else
    echo -e "$notes_content" > "$changelog_file"
  fi

  vda_success "Changelog prepended to $changelog_file"
}

main() {
  if [[ $# -eq 0 ]] || [[ "${1:-}" = "--help" || "${1:-}" = "-h" ]]; then
    _show_help
    exit 0
  fi

  case "${1:-}" in
    generate)
      shift
      _generate "$@"
      ;;
    publish-github)
      shift
      _publish_github "$@"
      ;;
    publish-changelog)
      shift
      _publish_changelog "$@"
      ;;
    help)
      _show_help
      ;;
    *)
      vda_error "Unknown subcommand: ${1:-}. Use 'help' for usage."
      exit 2
      ;;
  esac
}

main "$@"
