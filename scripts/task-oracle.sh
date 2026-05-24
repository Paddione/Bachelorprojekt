#!/usr/bin/env bash
# task-oracle.sh — natural-language task dispatcher
# Three phases: namespace selection → task selection → ENV-aware execution
set -euo pipefail

GOAL="${*:?Usage: task-oracle.sh '<goal>'}"
REPO="/home/patrick/Bachelorprojekt"
MODEL="qwen/qwen3-4b-2507"
HERMES="${HERMES:-$HOME/.local/bin/hermes}"

# ── Infer target environment from goal keywords ───────────────────────────
infer_env() {
  local g="${1,,}"
  if echo "$g" | grep -qE 'both prod|all.?prod|all.?cluster|mentolder.{1,15}korczewski|korczewski.{1,15}mentolder'; then
    echo "both"
  elif echo "$g" | grep -qE '\bkorczewski\b'; then echo "korczewski"
  elif echo "$g" | grep -qE '\bmentolder\b';  then echo "mentolder"
  elif echo "$g" | grep -qE '\bdev\b|\blocal\b|\bk3d\b';  then echo "dev"
  else echo ""
  fi
}

# ── Wrapper: call Hermes, strip session_id noise ──────────────────────────
ask_hermes() {
  "${HERMES}" chat -q "$1" -m "${MODEL}" --quiet 2>/dev/null \
    | grep -v "^session_id:" || true
}

# ── Primary: Hermes (local model, no API cost) ────────────────────────────
if [[ -x "${HERMES}" ]] && "${HERMES}" status 2>/dev/null | grep -q "Model:"; then

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

  NS_PROMPT="Output ONLY the 1-2 namespace names (one per line) most relevant to the goal. No explanation. /no_think

Note: 'mentolder' and 'korczewski' are environment names, NOT task namespaces — ignore them when selecting namespaces.

${NS_SUMMARY}

Goal: ${GOAL}"

  SELECTED_NS=$(ask_hermes "$NS_PROMPT" \
    | grep -oE '\b[a-z][a-z0-9_-]+\b' \
    | grep -xF -f <(echo "$KNOWN_NS") \
    | head -2 || true)

  # ── Phase 2: task selection within namespace(s) ───────────────────────
  if [[ -n "$SELECTED_NS" ]]; then
    NS_TASKS=$(echo "$SELECTED_NS" | while IFS= read -r ns; do
      echo "$ALL_TASKS" | grep "^${ns}:"
    done)
    echo "→ Namespace(s): $(echo "$SELECTED_NS" | tr '\n' ' ')" >&2
  else
    # Fallback: use all tasks (model gets full list, all 244)
    NS_TASKS="$ALL_TASKS"
    echo "→ Namespace selection failed — searching all ${#ALL_TASKS} tasks" >&2
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

${TASK_LIST}

Goal: ${GOAL}"

  RAW=$(ask_hermes "$TASK_PROMPT")

  SELECTED=""
  if ! echo "$RAW" | grep -qiE '^none\b'; then
    SELECTED=$(echo "$RAW" \
      | grep -oE '`[a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*`' | head -1 | tr -d '`' \
      || echo "$RAW" \
      | grep -oE '\b[a-z][a-z0-9_-]*:[a-z][a-z0-9_:-]*\b' | head -1 \
      || true)
  fi

  if [[ -z "$SELECTED" ]]; then
    echo "→ No task matched. Falling back to OpenClaw." >&2
  else
    # ── Phase 3: ENV inference + task summary + execution ───────────────

    # task --summary line 3 = human-readable description (includes ENV= hints)
    TASK_DESC=$(cd "$REPO" && task --summary "$SELECTED" 2>/dev/null | sed -n '3p' || true)
    TASK_HAS_ENV=$(echo "$TASK_DESC" | grep -c 'ENV=' || true)

    INFERRED_ENV=$(infer_env "$GOAL")
    FINAL_TASK="$SELECTED"
    EXEC_ENV=""

    if [[ "$TASK_HAS_ENV" -gt 0 && -n "$INFERRED_ENV" ]]; then
      if [[ "$INFERRED_ENV" == "both" ]]; then
        # Prefer the :all-prods sibling if one exists
        ALL_PRODS="${SELECTED}:all-prods"
        if echo "$ALL_TASKS" | grep -qE "^${ALL_PRODS}:"; then
          FINAL_TASK="$ALL_PRODS"
          echo "→ Using :all-prods variant: ${FINAL_TASK}" >&2
        else
          EXEC_ENV="__BOTH__"
        fi
      else
        EXEC_ENV="ENV=${INFERRED_ENV}"
      fi
    fi

    echo "→ Task: ${FINAL_TASK}${EXEC_ENV:+  ${EXEC_ENV}}" >&2
    [[ -n "$TASK_DESC" ]] && echo "  ${TASK_DESC}" >&2

    # Tail hermes log to stderr during execution
    tail -fn 0 ~/.hermes/logs/agent.log >&2 2>/dev/null &
    TAIL_PID=$!
    trap "kill $TAIL_PID 2>/dev/null || true" EXIT

    if [[ "${EXEC_ENV:-}" == "__BOTH__" ]]; then
      echo "→ Running on mentolder then korczewski..." >&2
      cd "$REPO" && task "$FINAL_TASK" ENV=mentolder
      cd "$REPO" && task "$FINAL_TASK" ENV=korczewski
    else
      cd "$REPO" && task "$FINAL_TASK" ${EXEC_ENV:-}
    fi
    RC=$?

    kill $TAIL_PID 2>/dev/null || true
    trap - EXIT
    exit $RC
  fi
fi

# ── Fallback: OpenClaw (Claude, reliable) ─────────────────────────────────
if curl -sf http://localhost:18789/healthz >/dev/null 2>&1; then
  openclaw agent \
    --agent task-runner \
    --message "$GOAL" \
    --json && exit 0
  echo "OpenClaw agent failed (billing cooldown? run: openclaw configure --section model)" >&2
fi

echo "Neither Hermes nor OpenClaw is available." >&2
echo "Discover tasks manually: cd ${REPO} && task --list" >&2
exit 1
