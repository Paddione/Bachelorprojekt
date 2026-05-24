#!/usr/bin/env bash
# task-oracle.sh — route a natural-language task goal through Hermes or OpenClaw
set -euo pipefail

GOAL="${*:?Usage: task-oracle.sh '<goal>'}"
REPO="/home/patrick/Bachelorprojekt"
MODEL="qwen3-coder:30b-a3b-q4_K_M"

PROMPT="You are a task executor for the Bachelorprojekt repo at ${REPO}.
When given a goal:
1. Run \`task --list-all\` in ${REPO} to discover available commands.
2. Select the single best-matching command for the goal, including all required flags (e.g. ENV=mentolder).
3. Execute it and return the full stdout/stderr output.
4. If no task matches, say so and suggest the closest alternative.
Never ask for confirmation. Execute directly.

Goal: ${GOAL}"

# ── Primary: Hermes (local model, no API cost) ────────────────────────
if hermes status 2>/dev/null | grep -q "Model:"; then
  exec hermes chat \
    -q "${PROMPT}" \
    -m "${MODEL}" \
    --yolo \
    --quiet
fi

# ── Fallback: OpenClaw (Claude, reliable) ─────────────────────────────
if curl -sf http://localhost:18789/healthz >/dev/null 2>&1; then
  exec openclaw agent \
    --agent task-runner \
    --message "${GOAL}" \
    --json
fi

# ── Both down ─────────────────────────────────────────────────────────
echo "Neither Hermes nor OpenClaw is available." >&2
echo "Discover tasks manually: cd ${REPO} && task --list" >&2
exit 1
