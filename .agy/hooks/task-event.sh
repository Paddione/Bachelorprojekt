#!/usr/bin/env bash
# agy task-event hook → agent-push. [T000991]
EVENT="${1:?missing event}"
TASK_ID="${2:?missing task-id}"
SUMMARY="${3:-}"
bash "$(dirname "$0")/../../scripts/agent-push.sh" agy "$EVENT" "$TASK_ID" "$SUMMARY" || true
