#!/usr/bin/env bats
# tests/spec/dsh-harness-integration/hook-bridge.bats — PreToolUse hooks are command hooks.

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"

@test "hook-bridge: all PreToolUse hooks have type command" {
  # Parse .claude/settings.json and verify every PreToolUse hook has type: "command".
  run python3 -c "
import json, sys
with open('$REPO/.claude/settings.json') as f:
    data = json.load(f)
hooks = data.get('hooks', {}).get('PreToolUse', [])
for group in hooks:
    for h in group.get('hooks', []):
        if h.get('type') != 'command':
            print(f'FAIL: hook type={h.get(\"type\")} matcher={group.get(\"matcher\")}', file=sys.stderr)
            sys.exit(1)
print(f'OK: {sum(len(g.get(\"hooks\",[])) for g in hooks)} PreToolUse hooks are all command type')
"
  [ "$status" -eq 0 ]
}
