#!/usr/bin/env bash
# opencode session-end hook → agent-push. [T000991]
EVENT="session.completed"
[ "${OPENCODE_EXIT_CODE:-0}" != "0" ] && EVENT="session.failed"
bash "$(dirname "$0")/../../scripts/agent-push.sh" opencode "$EVENT" \
  "${OPENCODE_SESSION_ID:-$1}" || true
