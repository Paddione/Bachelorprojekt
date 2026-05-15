#!/usr/bin/env bash
# Interactive task picker — wraps `task --list-all` with fzf.
# Usage: ./scripts/t.sh [query]   or via alias: t [query]

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v fzf &>/dev/null; then
  echo "fzf not found — install with: sudo apt install fzf" >&2
  exit 1
fi

# ENV-sensitive task name patterns: tasks that accept ENV=
ENV_PATTERN='workspace:|website:|brett:|arena:|livekit:|cert:|dev:|llm:|mcp:|keycloak:|docs:|argocd:|ha:|feature:|tracking:|tickets:|env:|config:|db:'

# Build list: "<name>  <description>"
TASK_LIST=$(cd "$ROOT" && task --list-all 2>/dev/null \
  | grep -E '^\* ' \
  | sed 's/^\* //' \
  | sed 's/:  */\t/')

# fzf with preview showing whether task needs ENV=
SELECTION=$(echo "$TASK_LIST" \
  | fzf \
      --query="${1:-}" \
      --delimiter='\t' \
      --with-nth=1,2 \
      --preview='echo "Task: {1}"; echo ""; echo "{2}"' \
      --preview-window='right:40%:wrap' \
      --height='80%' \
      --prompt='task > ' \
      --header='Enter to run · Ctrl-C to cancel' \
  | cut -f1)

[[ -z "$SELECTION" ]] && exit 0

# Prompt for ENV= if task looks ENV-sensitive
ENV_ARG=""
if echo "$SELECTION" | grep -qE "$ENV_PATTERN"; then
  read -r -p "ENV= (dev/mentolder/korczewski, blank=dev): " ENV_VAL
  [[ -n "$ENV_VAL" ]] && ENV_ARG="ENV=$ENV_VAL"
fi

# Prompt for extra args (-- ...)
read -r -p "Extra args (blank for none, e.g. -- keycloak): " EXTRA_ARGS

echo ""
echo "▶ task $SELECTION $ENV_ARG ${EXTRA_ARGS:+-- $EXTRA_ARGS}"
echo ""

cd "$ROOT"
if [[ -n "$EXTRA_ARGS" ]]; then
  # shellcheck disable=SC2086
  task $SELECTION $ENV_ARG -- $EXTRA_ARGS
else
  # shellcheck disable=SC2086
  task $SELECTION $ENV_ARG
fi
