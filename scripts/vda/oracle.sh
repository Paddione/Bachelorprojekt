#!/usr/bin/env bash
# task-oracle.sh — natural-language task dispatcher
# Three phases: namespace selection → task selection → ENV-aware execution
set -euo pipefail

# ── Interactive mode ──────────────────────────────────────────────────────────
interactive_mode() {
  local REPO
  REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  set +o pipefail
  local ALL_TASKS
  ALL_TASKS=$(cd "$REPO" && task --list-all 2>/dev/null | grep '^\* ' | sed 's/^\* //')
  set -o pipefail

  if [[ -z "$ALL_TASKS" ]]; then
    echo "✗ Could not load task list from Taskfile" >&2; return 1
  fi

  local HAS_FZF=0
  if command -v fzf &>/dev/null; then HAS_FZF=1; fi

  # ── Step 1: namespace ─────────────────────────────────────────────────────
  local NS_LIST
  NS_LIST=$(echo "$ALL_TASKS" | awk '
  {
    n = split($0, parts, /:  +/)
    if (n < 2) next
    ns = parts[1]; sub(/:.*/, "", ns)
    ns_count[ns]++
    if (!(ns in ns_first)) ns_first[ns] = parts[2]
  }
  END {
    for (ns in ns_count)
      printf "%-20s  %3d tasks — %s\n", ns, ns_count[ns], ns_first[ns]
  }' | sort)

  local SELECTED_NS=""
  if [[ $HAS_FZF -eq 1 ]]; then
    SELECTED_NS=$(echo "$NS_LIST" | fzf \
      --height=50% --reverse --border \
      --prompt="Namespace › " \
      --header="Step 1/3 — Select namespace") || return 0
    SELECTED_NS=$(echo "$SELECTED_NS" | awk '{print $1}')
  else
    echo "Step 1/3 — Select namespace:"; echo ""
    local ns_arr=()
    while IFS= read -r line; do ns_arr+=("$line"); done <<< "$NS_LIST"
    PS3=$'\nNamespace: '
    select choice in "${ns_arr[@]}"; do
      [[ -n "$choice" ]] && SELECTED_NS=$(echo "$choice" | awk '{print $1}') && break
    done
  fi
  [[ -z "$SELECTED_NS" ]] && return 0

  # ── Step 2: task ──────────────────────────────────────────────────────────
  local TASK_LIST
  TASK_LIST=$(echo "$ALL_TASKS" | awk -v ns="$SELECTED_NS" '
  {
    n = split($0, parts, /:  +/)
    if (n < 2) next
    ns_part = parts[1]; sub(/:.*/, "", ns_part)
    if (ns_part == ns) printf "%-40s  %s\n", parts[1], parts[2]
  }')

  local SELECTED_TASK=""
  if [[ $HAS_FZF -eq 1 ]]; then
    # Write a preview helper to avoid quoting hell inside --preview
    local PREVIEW_SH
    PREVIEW_SH=$(mktemp /tmp/oracle-preview-XXXX.sh)
    {
      echo '#!/usr/bin/env bash'
      echo "task_name=\$(awk '{print \$1}' <<< \"\$1\")"
      echo "cd \"${REPO}\" && task --summary \"\$task_name\" 2>/dev/null | head -25 || echo '(no summary)'"
    } > "$PREVIEW_SH"
    chmod +x "$PREVIEW_SH"
    trap "rm -f \"$PREVIEW_SH\"" RETURN

    SELECTED_TASK=$(echo "$TASK_LIST" | fzf \
      --height=70% --reverse --border \
      --prompt="Task › " \
      --header="Step 2/3 — Tasks in '${SELECTED_NS}' (right pane: task --summary)" \
      --preview="\"$PREVIEW_SH\" {}" \
      --preview-window=right:50%:wrap) || return 0
    SELECTED_TASK=$(echo "$SELECTED_TASK" | awk '{print $1}')
  else
    echo ""; echo "Step 2/3 — Tasks in '${SELECTED_NS}':"; echo ""
    local task_arr=()
    while IFS= read -r line; do task_arr+=("$line"); done <<< "$TASK_LIST"
    PS3=$'\nTask: '
    select choice in "${task_arr[@]}"; do
      [[ -n "$choice" ]] && SELECTED_TASK=$(echo "$choice" | awk '{print $1}') && break
    done
  fi
  [[ -z "$SELECTED_TASK" ]] && return 0

  # ── Step 3: environment ───────────────────────────────────────────────────
  local TASK_SUMMARY EXEC_ENV=""
  TASK_SUMMARY=$(cd "$REPO" && task --summary "$SELECTED_TASK" 2>/dev/null || true)

  if echo "$TASK_SUMMARY" | grep -q 'ENV='; then
    local ENV_CHOICE=""
    if [[ $HAS_FZF -eq 1 ]]; then
      ENV_CHOICE=$(printf 'none\ndev\nmentolder\nkorczewski\nboth' | fzf \
        --height=30% --reverse --border \
        --prompt="ENV › " \
        --header="Step 3/3 — Environment for '${SELECTED_TASK}'") || return 0
    else
      echo ""; echo "Step 3/3 — Environment for '${SELECTED_TASK}':"; echo ""
      PS3=$'\nENV: '
      select ENV_CHOICE in none dev mentolder korczewski both; do
        [[ -n "$ENV_CHOICE" ]] && break
      done
    fi
    case "${ENV_CHOICE:-none}" in
      none|"") EXEC_ENV="" ;;
      both)    EXEC_ENV="__BOTH__" ;;
      *)       EXEC_ENV="ENV=${ENV_CHOICE}" ;;
    esac
  fi

  # ── Execute ───────────────────────────────────────────────────────────────
  echo ""
  if [[ "$EXEC_ENV" == "__BOTH__" ]]; then
    echo "→ ${SELECTED_TASK}  ENV=mentolder  then  ENV=korczewski" >&2
    cd "$REPO" && task "$SELECTED_TASK" ENV=mentolder
    cd "$REPO" && task "$SELECTED_TASK" ENV=korczewski
  else
    echo "→ ${SELECTED_TASK}${EXEC_ENV:+  ${EXEC_ENV}}" >&2
    # shellcheck disable=SC2086
    cd "$REPO" && task "$SELECTED_TASK" ${EXEC_ENV:-}
  fi
}
# ─────────────────────────────────────────────────────────────────────────────

if [[ $# -eq 0 || "${1:-}" == "-i" || "${1:-}" == "--interactive" ]]; then
  interactive_mode
  exit $?
fi

# ── Flag parsing ─────────────────────────────────────────────────────────────
DRY_RUN=0
JSON_OUT=0
QUIET=0
REMAINING_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    --json)       JSON_OUT=1; DRY_RUN=1 ;;
    --quiet|-q)   QUIET=1 ;;
    *)            REMAINING_ARGS+=("$arg") ;;
  esac
done

GOAL="${REMAINING_ARGS[*]:?Usage: task-oracle.sh [--dry-run|--json|--quiet] '<goal>'}"

# ── Task-var resolution (ENV vs BRAND) ─────────────────────────────────────
# shellcheck source=./oracle-task-vars.sh
source "$(dirname "${BASH_SOURCE[0]}")/oracle-task-vars.sh"

# ── Dry-run / JSON output helper ──────────────────────────────────────────
emit_dry_run() {
  local task="$1" env="$2" label="${3:-}" repo="${4:-.}" cmd
  if [[ "${env:-}" == __BOTH__ ]]; then
    # Materialize the correct var (ENV vs BRAND) per task instead of assuming
    # ENV= — fleet:deploy:brand and friends require BRAND=fleet-<brand>. [T001583]
    local m k
    m="$(materialize_task_env_arg "$task" mentolder "$repo")"
    k="$(materialize_task_env_arg "$task" korczewski "$repo")"
    cmd="task ${task}${m:+ ${m}} && task ${task}${k:+ ${k}}"
    label=both
  else
    cmd="task ${task}${env:+ ${env}}"
  fi
  [[ $JSON_OUT -eq 1 ]] && printf '{"task":"%s","env":"%s","cmd":"%s"}\n' "$task" "$label" "$cmd" || echo "$cmd"
  exit 0
}

# ── Structured fast-path: skip LLM for "namespace:action [ENV=X]" input ──────
# Matches e.g. "workspace:deploy ENV=mentolder", "feature:website", "brett:build ENV=both"
FASTPATH_REGEX='^([a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*)([[:space:]]+ENV=(dev|mentolder|korczewski|both))?[[:space:]]*$'
if [[ "$GOAL" =~ $FASTPATH_REGEX ]]; then
  FP_TASK="${BASH_REMATCH[1]}"
  FP_ENV="${BASH_REMATCH[3]}"   # "dev"|"mentolder"|"korczewski"|"both"|""

  REPO_FP="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

  # Validate task exists in the Taskfile
  set +o pipefail
  VALID_FP=$(cd "$REPO_FP" && task --list-all 2>/dev/null \
    | grep '^\* ' | sed 's/^\* //' \
    | awk '{n=split($0,p,/:  +/); if(n>=2) print p[1]}')
  set -o pipefail

  if ! echo "$VALID_FP" | grep -qxF "$FP_TASK"; then
    echo "✗ Unknown task: '${FP_TASK}' — run 'task --list-all' to see valid tasks" >&2
    exit 1
  fi

  FP_FINAL="$FP_TASK"
  FP_EXEC_ENV=""

  if [[ "$FP_ENV" == "both" ]]; then
    ALL_PRODS="${FP_TASK}:all-prods"
    if echo "$VALID_FP" | grep -qxF "$ALL_PRODS"; then
      FP_FINAL="$ALL_PRODS"
      [[ $QUIET -eq 0 ]] && echo "→ [fast-path] Using :all-prods variant: ${FP_FINAL}" >&2
    else
      FP_EXEC_ENV="__BOTH__"
    fi
  elif [[ -n "$FP_ENV" ]]; then
    # Resolve to the task's actual required var (ENV vs BRAND) — the user
    # types the "ENV=<token>" DSL regardless of which var the target task
    # wants; materialize_task_env_arg maps the token to the right var name
    # (e.g. fleet:deploy:brand ENV=mentolder → BRAND=fleet-mentolder). [T001583]
    FP_EXEC_ENV="$(materialize_task_env_arg "$FP_FINAL" "$FP_ENV" "$REPO_FP")"
  fi

  TASK_DESC_FP=$(cd "$REPO_FP" && task --summary "$FP_FINAL" 2>/dev/null | sed -n '3p' || true)
  [[ $QUIET -eq 0 ]] && echo "→ [fast-path] Task: ${FP_FINAL}${FP_EXEC_ENV:+  ${FP_EXEC_ENV}}" >&2
  [[ $QUIET -eq 0 && -n "$TASK_DESC_FP" ]] && echo "  ${TASK_DESC_FP}" >&2

  [[ $DRY_RUN -eq 1 ]] && emit_dry_run "$FP_FINAL" "$FP_EXEC_ENV" "$FP_ENV" "$REPO_FP"

  if [[ "${FP_EXEC_ENV:-}" == "__BOTH__" ]]; then
    [[ $QUIET -eq 0 ]] && echo "→ Running on mentolder then korczewski..." >&2
    FP_MENTOLDER_ARG="$(materialize_task_env_arg "$FP_FINAL" mentolder "$REPO_FP")"
    FP_KORCZEWSKI_ARG="$(materialize_task_env_arg "$FP_FINAL" korczewski "$REPO_FP")"
    # shellcheck disable=SC2086
    cd "$REPO_FP" && task "$FP_FINAL" ${FP_MENTOLDER_ARG:-}
    # shellcheck disable=SC2086
    cd "$REPO_FP" && task "$FP_FINAL" ${FP_KORCZEWSKI_ARG:-}
  else
    # shellcheck disable=SC2086
    cd "$REPO_FP" && task "$FP_FINAL" ${FP_EXEC_ENV:-}
  fi
  exit $?
fi
# ─────────────────────────────────────────────────────────────────────────────

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERMES="${HERMES:-$HOME/.local/bin/hermes}"

# ── Infer target environment from goal keywords ───────────────────────────
infer_env() {
  local g="${1,,}"
  if echo "$g" | grep -qE 'both prod|all.?prod|all.?cluster|mentolder.{1,15}korczewski|korczewski.{1,15}mentolder'; then
    echo "both"
  elif echo "$g" | grep -qE '\bkorczewski\b.{0,30}\bdev\b|\bdev\b.{0,30}\bkorczewski\b'; then echo ""
  elif echo "$g" | grep -qE '\bkorczewski\b'; then echo "korczewski"
  elif echo "$g" | grep -qE '\bmentolder\b';  then echo "mentolder"
  elif echo "$g" | grep -qE '\bdev\b|\blocal\b|\bk3d\b';  then echo "dev"
  else echo ""
  fi
}

source "$(dirname "$0")/oracle-ai-call.sh"

# ── Primary: Local LLM ────────────────────────────────────────────────────
if local_llm_available; then

  # Full task list — no truncation
  set +o pipefail
  ALL_TASKS=$(cd "$REPO" && task --list-all 2>/dev/null | grep '^\* ' | sed 's/^\* //')
  set -o pipefail

  # ── Phase 1: namespace selection ──────────────────────────────────────
  # Build one summary line per namespace: "workspace (23 tasks) — Deploy workspace services"
  # split() on /:  +/ splits "ns:sub:task:   description" into name+desc at the column gap.
  NS_SUMMARY=$(echo "$ALL_TASKS" | awk '
  {
    n = split($0, parts, /:  +/)
    if (n < 2) next
    name = parts[1]
    desc = parts[2]
    ns = name; sub(/:.*/, "", ns)
    ns_count[ns]++
    if (!(ns in ns_desc)) ns_desc[ns] = desc
  }
  END {
    for (ns in ns_count)
      printf "%s (%d tasks) — %s\n", ns, ns_count[ns], ns_desc[ns]
  }' | sort)

  KNOWN_NS=$(echo "$ALL_TASKS" | awk -F: '{print $1}' | sort -u)

  # Keyword overrides: bypass LLM for namespaces the model reliably gets wrong.
  # 'sealed-secrets' (controller install) vs 'env' (env:seal) is the canonical case.
  keyword_ns_override() {
    local g="${1,,}"
    if echo "$g" | grep -qE '(seal|encrypt).{0,20}(env|environment|secret)|(env|environment|secret).{0,20}(seal|encrypt)|\benv:seal\b'; then
      echo "env"
    elif echo "$g" | grep -qE '\bkorczewski\b.{0,30}\bdev\b|\bdev\b.{0,30}\bkorczewski\b'; then
      echo "dev-korczewski"
    fi
  }

  OVERRIDE_NS=$(keyword_ns_override "$GOAL")

  NS_PROMPT="Output ONLY the 1-2 namespace names (one per line) most relevant to the goal. No explanation. /no_think

Note: 'mentolder' and 'korczewski' are environment names, NOT task namespaces — ignore them when selecting namespaces. EXCEPTION: 'dev-korczewski' IS a valid task namespace (korczewski dev stack tasks like dev-korczewski:cluster:status, dev-korczewski:redeploy:website etc.).
Note: 'sealed-secrets' namespace is for installing/managing the Sealed Secrets controller itself. For sealing or encrypting environment variables/credentials, use the 'env' namespace (env:seal, env:fetch-cert, etc.).

${NS_SUMMARY}

Goal: ${GOAL}"

  SELECTED_NS=$(
    if [[ -n "$OVERRIDE_NS" ]]; then
      echo "$OVERRIDE_NS"
    else
      ask_llm "$NS_PROMPT"
    fi \
    | grep -oE '\b[a-z][a-z0-9_-]+\b' \
    | grep -xF -f <(echo "$KNOWN_NS") \
    | head -2 || true)

  # ── Phase 2: task selection within namespace(s) ───────────────────────
  if [[ -n "$SELECTED_NS" ]]; then
    NS_TASKS=$(echo "$SELECTED_NS" | while IFS= read -r ns; do
      echo "$ALL_TASKS" | grep "^${ns}:"
    done)
    [[ $QUIET -eq 0 ]] && echo "→ Namespace(s): $(echo "$SELECTED_NS" | tr '\n' ' ')" >&2
  else
    # Fallback: use all tasks (model gets full list, all 244)
    NS_TASKS="$ALL_TASKS"
    [[ $QUIET -eq 0 ]] && echo "→ Namespace selection failed — searching all ${#ALL_TASKS} tasks" >&2
  fi

  # Format for model: "task:name — description" (no trailing colon)
  TASK_LIST=$(echo "$NS_TASKS" | awk '
  {
    n = split($0, parts, /:  +/)
    if (n < 2) next
    printf "%s — %s\n", parts[1], parts[2]
  }')

  TASK_PROMPT="Output ONLY the single best matching task name (e.g. 'workspace:deploy'). /no_think
If no task matches, output: NONE

Note: For deploying a specific service image (brett, website, livekit, docs), prefer 'feature:<service>' tasks (e.g. 'feature:brett', 'feature:website') over 'workspace:deploy'. Use 'workspace:deploy' only for full cluster rollouts.

${TASK_LIST}

Goal: ${GOAL}"

  RAW=$(ask_llm "$TASK_PROMPT")

  # Build set of valid task names for exact-match fallback
  VALID_TASKS=$(echo "$NS_TASKS" | awk '{n=split($0,p,/:  +/); if(n>=2) print p[1]}')

  SELECTED=""
  if ! echo "$RAW" | grep -qiE '^none\b'; then
    # Tier 1: backtick-quoted task name
    SELECTED=$(echo "$RAW" | grep -oE '`[a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*`' | head -1 | tr -d '`' || true)
    # Tier 2: bare task name pattern anywhere in output
    if [[ -z "$SELECTED" ]]; then
      SELECTED=$(echo "$RAW" | grep -oE '\b[a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*\b' | head -1 || true)
    fi
    # Tier 3: scan RAW for any known task name verbatim (handles prose/think output)
    if [[ -z "$SELECTED" ]]; then
      SELECTED=$(echo "$VALID_TASKS" | while IFS= read -r t; do
        if echo "$RAW" | grep -qF "$t"; then echo "$t"; fi
      done | head -1 || true)
    fi
  fi

  if [[ -z "$SELECTED" ]]; then
    [[ $QUIET -eq 0 ]] && echo "→ No task matched. Falling back to OpenClaw." >&2
  else
    # ── Phase 3: ENV inference + task summary + execution ───────────────

    # task --summary line 3 = human-readable description, purely informational.
    TASK_DESC=$(cd "$REPO" && task --summary "$SELECTED" 2>/dev/null | sed -n '3p' || true)
    # Resolve the ACTUAL Taskfile.yml `requires: vars:` var (ENV or BRAND) —
    # not a substring guess on the description text, which silently produced
    # a non-runnable `ENV=<token>` for BRAND-only tasks like fleet:deploy:brand
    # (T001583 mishap 3). Empty means the task takes neither var.
    TASK_VAR=$(task_required_var "$SELECTED" "$REPO")

    INFERRED_ENV=$(infer_env "$GOAL")
    FINAL_TASK="$SELECTED"
    EXEC_ENV=""

    if [[ -n "$TASK_VAR" && -n "$INFERRED_ENV" ]]; then
      if [[ "$INFERRED_ENV" == "both" ]]; then
        # Prefer the :all-prods sibling if one exists
        ALL_PRODS="${SELECTED}:all-prods"
        if echo "$ALL_TASKS" | grep -qE "^${ALL_PRODS}:"; then
          FINAL_TASK="$ALL_PRODS"
          [[ $QUIET -eq 0 ]] && echo "→ Using :all-prods variant: ${FINAL_TASK}" >&2
        else
          EXEC_ENV="__BOTH__"
        fi
      else
        EXEC_ENV="$(materialize_task_env_arg "$SELECTED" "$INFERRED_ENV" "$REPO")"
      fi
    fi

    [[ $QUIET -eq 0 ]] && echo "→ Task: ${FINAL_TASK}${EXEC_ENV:+  ${EXEC_ENV}}" >&2
    [[ $QUIET -eq 0 && -n "$TASK_DESC" ]] && echo "  ${TASK_DESC}" >&2

    [[ $DRY_RUN -eq 1 ]] && emit_dry_run "$FINAL_TASK" "$EXEC_ENV" "${INFERRED_ENV:-}" "$REPO"

    # Tail hermes log to stderr during execution (skip for quiet/agent mode)
    TAIL_PID=""
    if [[ $QUIET -eq 0 ]] && [[ -f ~/.hermes/logs/agent.log ]]; then
      tail -fn 0 ~/.hermes/logs/agent.log >&2 2>/dev/null &
      TAIL_PID=$!
      trap "kill $TAIL_PID 2>/dev/null || true" EXIT
    fi

    if [[ "${EXEC_ENV:-}" == "__BOTH__" ]]; then
      [[ $QUIET -eq 0 ]] && echo "→ Running on mentolder then korczewski..." >&2
      MENTOLDER_ARG="$(materialize_task_env_arg "$FINAL_TASK" mentolder "$REPO")"
      KORCZEWSKI_ARG="$(materialize_task_env_arg "$FINAL_TASK" korczewski "$REPO")"
      # shellcheck disable=SC2086
      cd "$REPO" && task "$FINAL_TASK" ${MENTOLDER_ARG:-}
      # shellcheck disable=SC2086
      cd "$REPO" && task "$FINAL_TASK" ${KORCZEWSKI_ARG:-}
    else
      # shellcheck disable=SC2086
      cd "$REPO" && task "$FINAL_TASK" ${EXEC_ENV:-}
    fi
    RC=$?

    [[ -n "$TAIL_PID" ]] && kill $TAIL_PID 2>/dev/null || true
    trap - EXIT
    exit $RC
  fi
fi

# ── Fallback: Opencode / OpenClaw (Claude, reliable) ──────────────────────
# Skip interactive fallback in dry-run mode — just report no match
if [[ $DRY_RUN -eq 1 ]]; then
  [[ $JSON_OUT -eq 1 ]] && echo '{"task":null,"env":null,"cmd":null}' || echo "NONE"
  exit 1
fi

if curl -sf http://localhost:18789/healthz >/dev/null 2>&1; then
  if command -v opencode &>/dev/null; then
    opencode run --agent task-runner --format json "$GOAL" && exit 0
  elif command -v openclaw &>/dev/null; then
    openclaw agent --agent task-runner --message "$GOAL" --json && exit 0
  fi
fi

echo "No local LLM service (Ollama) or Opencode/OpenClaw daemon is running (Neither Hermes nor OpenClaw is available)." >&2
echo "Discover tasks manually: cd ${REPO} && task --list" >&2
exit 1
