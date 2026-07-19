#!/usr/bin/env bash
# openspec-drift-check.sh — advisory OpenSpec spec-drift gate (Phase 1).
# Warns when a feat/fix PR changes spec-mapped files without touching the spec.
# Exit codes: 0 = ok / advisory warning, 1 = drift under DRIFT_CHECK_ENFORCE=1,
#             >=2 = script error (CI step MUST fail). Bypass: SKIP_SPEC_DRIFT=1.
set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
[[ -n "$REPO_ROOT" ]] || { echo "openspec-drift-check: not inside a git repository" >&2; exit 2; }
MAP_FILE="$REPO_ROOT/openspec/component-map.yaml"
ENFORCE="${DRIFT_CHECK_ENFORCE:-0}"

# ── Self-test mode ──────────────────────────────────────────────────────────
run_self_test() {
  local TMP fail=0
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' RETURN

  # Fixture repo with a minimal component-map + specs dir.
  rm -rf "$TMP/repo" && mkdir -p "$TMP/repo/openspec/specs" && cd "$TMP/repo" || return 1
  git init -q >/dev/null
  git config user.email test@test && git config user.name test >/dev/null

  cat > openspec/component-map.yaml <<'MAP'
mappings:
  - prefix: website/src/lib/tickets
    spec: tickets
MAP
  echo "# tickets spec" > openspec/specs/tickets.md
  mkdir -p website/src/lib/tickets
  echo "seed" > website/src/lib/tickets/.gitkeep
  git add -A >/dev/null && git commit -q -m "chore: seed base" >/dev/null
  git branch -q -m main >/dev/null 2>&1 || true
  git checkout -q -b origin-main-shadow >/dev/null 2>&1
  git branch -q -f main HEAD >/dev/null 2>&1
  git checkout -q main >/dev/null 2>&1
  mkdir -p "$TMP/origin.git"
  git -C "$TMP/origin.git" init -q --bare >/dev/null
  git remote add origin "$TMP/origin.git" >/dev/null 2>&1
  git push -q origin main >/dev/null 2>&1

  assert_case() {
    local name="$1" branch="$2" pr_title="$3" file="$4" content="$5" \
          extra_file="$6" extra_content="$7" env_extra="$8" \
          expect_status="$9" expect_grep="${10}" expect_no_drift="${11}"
    git checkout -q main >/dev/null 2>&1
    git branch -q -D "$branch" >/dev/null 2>&1 || true
    git checkout -q -b "$branch" >/dev/null 2>&1
    if [[ -n "$file" ]]; then
      mkdir -p "$(dirname "$file")"
      echo "$content" > "$file"
      git add -A >/dev/null
      git commit -q -m "feat: fixture change" >/dev/null
    fi
    if [[ -n "$extra_file" ]]; then
      mkdir -p "$(dirname "$extra_file")"
      echo "$extra_content" > "$extra_file"
      git add -A >/dev/null
      git commit -q -m "feat: fixture spec change" >/dev/null
    fi

    local out status
    out="$(cd "$TMP/repo" && env PR_TITLE="$pr_title" $env_extra bash "$REPO_ROOT/scripts/openspec-drift-check.sh" 2>&1)"
    status=$?

    if [[ "$status" -ne "$expect_status" ]]; then
      echo "  FAIL  $name (expected exit $expect_status, got $status)"
      echo "$out" | sed 's/^/         /'
      fail=1
      return
    fi
    if [[ -n "$expect_grep" ]] && ! echo "$out" | grep -q "$expect_grep"; then
      echo "  FAIL  $name (expected output to contain '$expect_grep')"
      echo "$out" | sed 's/^/         /'
      fail=1
      return
    fi
    if [[ "$expect_no_drift" == "1" ]] && echo "$out" | grep -q 'DRIFT: '; then
      echo "  FAIL  $name (expected no DRIFT: line)"
      echo "$out" | sed 's/^/         /'
      fail=1
      return
    fi
    echo "  ok    $name"
  }

  # Case 1: feat PR changes mapped code, no spec touch -> exactly one DRIFT line, exit 0.
  assert_case "drift-warns" "case1" "feat: add ticket helper" \
    "website/src/lib/tickets/x.ts" "export const x = 1;" \
    "" "" "" 0 "DRIFT: " ""

  # Case 2: same diff + delta spec touched -> no DRIFT line, exit 0.
  git checkout -q main >/dev/null 2>&1
  git branch -q -D case2 >/dev/null 2>&1 || true
  git checkout -q -b case2 >/dev/null 2>&1
  mkdir -p website/src/lib/tickets openspec/changes/demo/specs
  echo "export const x = 1;" > website/src/lib/tickets/x.ts
  echo "## ADDED Requirements" > openspec/changes/demo/specs/tickets.md
  git add -A >/dev/null && git commit -q -m "feat: add ticket helper with spec" >/dev/null
  out="$(env PR_TITLE="feat: add ticket helper" bash "$REPO_ROOT/scripts/openspec-drift-check.sh" 2>&1)"
  status=$?
  if [[ "$status" -eq 0 ]] && ! echo "$out" | grep -q 'DRIFT: '; then
    echo "  ok    delta-spec-suppresses-drift"
  else
    echo "  FAIL  delta-spec-suppresses-drift (status=$status)"
    echo "$out" | sed 's/^/         /'
    fail=1
  fi

  # Case 3: chore PR title -> skip message, exit 0.
  git checkout -q main >/dev/null 2>&1
  git branch -q -D case3 >/dev/null 2>&1 || true
  git checkout -q -b case3 >/dev/null 2>&1
  mkdir -p website/src/lib/tickets
  echo "export const x = 1;" > website/src/lib/tickets/x.ts
  git add -A >/dev/null && git commit -q -m "chore: fixture" >/dev/null
  out="$(env PR_TITLE="chore: housekeeping" bash "$REPO_ROOT/scripts/openspec-drift-check.sh" 2>&1)"
  status=$?
  if [[ "$status" -eq 0 ]] && echo "$out" | grep -q "skipped"; then
    echo "  ok    chore-title-skipped"
  else
    echo "  FAIL  chore-title-skipped (status=$status)"
    fail=1
  fi

  # Case 4: SKIP_SPEC_DRIFT=1 -> skip message, exit 0.
  out="$(env PR_TITLE="feat: add ticket helper" SKIP_SPEC_DRIFT=1 bash "$REPO_ROOT/scripts/openspec-drift-check.sh" 2>&1)"
  status=$?
  if [[ "$status" -eq 0 ]] && echo "$out" | grep -q "skipped"; then
    echo "  ok    skip-spec-drift-bypass"
  else
    echo "  FAIL  skip-spec-drift-bypass (status=$status)"
    fail=1
  fi

  cd "$REPO_ROOT" || true
  if [[ "$fail" -ne 0 ]]; then
    echo "openspec-drift-check: self-test FAILED" >&2
    return 1
  fi
  echo "openspec-drift-check: self-test passed"
  return 0
}

if [[ "${1:-}" == "--self-test" ]]; then run_self_test; exit $?; fi

# --- explicit bypass (repo convention, mirrors SKIP_COMMIT_VS_DIFF) ---
if [[ "${SKIP_SPEC_DRIFT:-0}" == "1" ]]; then
  echo "openspec-drift-check: skipped (SKIP_SPEC_DRIFT=1)"; exit 0
fi

# --- feat/fix detection: PR title prefix, else branch-name fallback ---
PR_TITLE="${PR_TITLE:-}"
if [[ -n "$PR_TITLE" ]]; then
  if ! echo "$PR_TITLE" | grep -qE '^(feat|fix)(\([^)]+\))?(!)?:'; then
    echo "openspec-drift-check: skipped — not a feat/fix PR ($PR_TITLE)"; exit 0
  fi
else
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
  case "$BRANCH" in
    feature/*|fix/*) ;;
    *) echo "openspec-drift-check: skipped — not a feature/fix branch ($BRANCH)"; exit 0 ;;
  esac
fi

# --- changed files vs main + component-map parsing (mirrors openspec-context.sh) ---
BASE=$(git merge-base HEAD origin/main 2>/dev/null || git rev-parse origin/main 2>/dev/null || echo "HEAD^")
mapfile -t CHANGED < <(git diff --name-only "$BASE" HEAD 2>/dev/null || true)

declare -A PREFIX_TO_SPEC; declare -a PREFIX_ORDER
while IFS= read -r line; do
  line="${line%%#*}"; line="${line#"${line%%[! ]*}"}"
  if [[ "$line" == "- prefix:"* ]]; then
    current_prefix="${line#- prefix: }"; current_prefix="${current_prefix//[\'\"]/}"
    current_prefix="${current_prefix%"${current_prefix##*[! ]}"}"
  elif [[ "$line" == "spec:"* ]]; then
    spec_slug="${line#spec: }"; spec_slug="${spec_slug//[\'\"]/}"
    spec_slug="${spec_slug%"${spec_slug##*[! ]}"}"
    [[ -n "${current_prefix:-}" && -n "$spec_slug" ]] && \
      { PREFIX_TO_SPEC["$current_prefix"]="$spec_slug"; PREFIX_ORDER+=("$current_prefix"); }
  fi
done < "$MAP_FILE"

declare -A MATCHED MATCH_FILE
for f in "${CHANGED[@]}"; do
  for prefix in "${PREFIX_ORDER[@]}"; do
    if [[ "$f" == "$prefix"* ]]; then
      slug="${PREFIX_TO_SPEC[$prefix]}"; MATCHED["$slug"]=1
      [[ -z "${MATCH_FILE[$slug]:-}" ]] && MATCH_FILE["$slug"]="$f"; break
    fi
  done
done

# "Spec angefasst?" — direct SSOT edit OR delta spec named after the parent slug.
spec_touched() {  # $1 = slug
  local f
  for f in "${CHANGED[@]}"; do
    [[ "$f" == "openspec/specs/${1}.md" ]] && return 0
    [[ "$f" == openspec/changes/*/specs/${1}.md ]] && return 0
  done
  return 1
}

drift=0
for slug in "${!MATCHED[@]}"; do
  spec_touched "$slug" && continue
  echo "DRIFT: $slug <- ${MATCH_FILE[$slug]}"
  echo "::warning::openspec-drift: code mapped to spec '$slug' changed but no spec/delta touched"
  [[ -n "${GITHUB_STEP_SUMMARY:-}" ]] && \
    echo "- DRIFT: \`$slug\` <- \`${MATCH_FILE[$slug]}\`" >> "$GITHUB_STEP_SUMMARY"
  drift=$((drift + 1))
done

if [[ "$drift" -gt 0 ]]; then
  echo "openspec-drift-check: $drift spec-drift warning(s) (advisory)"
  [[ "$ENFORCE" == "1" ]] && exit 1
fi
exit 0
