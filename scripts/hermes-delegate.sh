#!/usr/bin/env bash
# Delegates a single, cheap-inference prompt to the local Hermes Agent
# (gemma-4-12b-qat via LM Studio) instead of spending an expensive model's
# tokens on it. Intended for mechanical, low-risk subtasks (boilerplate,
# classification, rename suggestions, summarization) — not for anything
# needing judgment, architecture decisions, or untrusted tool execution.
#
# Usage: scripts/hermes-delegate.sh "<prompt>" [toolsets]
#   toolsets: comma-separated Hermes toolsets to enable (default: none —
#             pure text generation, no file/shell/exec access).
set -euo pipefail

HERMES="${HERMES:-$HOME/.local/bin/hermes}"
PROMPT="${1:?usage: hermes-delegate.sh \"<prompt>\" [toolsets]}"
TOOLSETS="${2:-}"

if [[ ! -x "$HERMES" ]]; then
  echo "FATAL: hermes binary not found at $HERMES" >&2
  exit 1
fi

if [[ -n "$TOOLSETS" ]]; then
  exec "$HERMES" -z "$PROMPT" -t "$TOOLSETS" --cli
else
  exec "$HERMES" -z "$PROMPT" -t "" --cli
fi
