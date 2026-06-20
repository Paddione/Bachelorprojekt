#!/usr/bin/env bash
# opencode session-start hook → agent-push. [T000991]
bash "$(dirname "$0")/../../scripts/agent-push.sh" opencode session.started \
  "${OPENCODE_SESSION_ID:-$1}" "Session gestartet" || true
