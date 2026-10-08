"""Native migration of tests/spec/mishap-t002422.bats; structural guards."""
import re
import pytest

@pytest.mark.parametrize(('path', 'patterns'), [
    ('.claude/skills/references/ticket-ops-procedures.md', [r'json_agg\(json_build_object', r'JSON-Ausgabe statt Pipe-Spalten \[T002422\]']),
    ('scripts/vda/ticket/_ticket-core.sh', [r'CLAUDE_CODE_SESSION_ID="\$\{CLAUDE_CODE_SESSION_ID:-\}"']),
    ('scripts/vda/ticket/_ticket-core.sh', [r'CLAUDE_SESSION_ID="\$\{CLAUDE_SESSION_ID:-\}"']),
    ('scripts/vda/ticket/_ticket-core.sh', ['T002422']),
    ('.claude/skills/ticket-ops/SKILL.md', [r'Pre-Check-Invariante \[T002422\]']),
    ('.claude/skills/references/ticket-ops-procedures.md', [r'Pre-Check-Invariante \[T002422\]']),
    ('.claude/skills/references/ticket-ops-procedures.md', [r'\*\*Pre-Check:\*\*.*agent-lock.sh check ticket']),
])
def test_mishap_guard(repo_root, path, patterns):
    text = (repo_root / path).read_text()
    for pattern in patterns:
        assert re.search(pattern, text)
