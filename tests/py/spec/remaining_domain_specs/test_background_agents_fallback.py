"""Native migration of tests/spec/background-agents-fallback.bats."""
import re

def test_default_timeout(repo_root):
    text = (repo_root / '.opencode/skills/dev-flow/background-agents.ts').read_text()
    assert re.search(r'DEFAULT_MAX_RUN_TIME_MS = 25 \* 60 \* 1000', text)
