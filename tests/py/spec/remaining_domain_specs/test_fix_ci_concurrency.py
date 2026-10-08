"""Native migration of tests/spec/fix-ci-concurrency.bats."""
def test_cancel_excludes_edited(repo_root):
    lines = (repo_root / '.github/workflows/ci.yml').read_text().splitlines()
    blocks = ["\n".join(lines[i:i+3]) for i, line in enumerate(lines) if 'cancel-in-progress:' in line]
    assert blocks
    assert "!= 'edited'" in "\n".join(blocks)

def test_jobs_edited_guards(repo_root):
    lines = (repo_root / '.github/workflows/ci.yml').read_text().splitlines()
    assert sum("github.event.action != 'edited'" in line for line in lines) >= 8
