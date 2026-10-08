"""Native migration of tests/spec/dsh-harness-integration/hook-bridge.bats."""
import json

def test_pretooluse_command_hooks(repo_root):
    settings = json.loads((repo_root / '.claude/settings.json').read_text())
    for group in settings.get('hooks', {}).get('PreToolUse', []):
        for hook in group.get('hooks', []):
            assert hook.get('type') == 'command', group.get('matcher')
