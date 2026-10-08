"""Native migration of tests/spec/s1-violations-batch2.bats."""
import json
import pytest

def test_baseline_limit(repo_root):
    baseline = json.loads((repo_root / 'docs/code-quality/baseline.json').read_text())
    assert sum(key.startswith('S1:') for key in baseline) <= 30

@pytest.mark.parametrize(('path', 'limit'), [('components/website/src/lib/tickets-db.ts', 600), ('scripts/backup-restore.sh', 500), ('components/website/src/lib/tickets-db.ts', 200), ('scripts/backup-restore.sh', 200)])
def test_line_budget(repo_root, path, limit):
    assert (repo_root / path).read_bytes().count(b'\n') <= limit
