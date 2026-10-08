"""Native assertions from tests/spec/ci-cd/ci-wait-loop-nonempty-guard.bats."""

import json
import re
import shlex
import subprocess


def verdict(repo_root, checks):
    library = repo_root / "scripts/lib/ci-checks.sh"
    return subprocess.run(["bash", "-c", f"source {shlex.quote(str(library))}; ci_checks_verdict"], input=json.dumps(checks), text=True, capture_output=True, timeout=60, cwd=repo_root)


def test_empty_checklist_not_green(repo_root):
    valid = verdict(repo_root, [{"name": "CI", "state": "SUCCESS"}])
    assert valid.returncode == 0
    assert "green" in valid.stdout
    result = verdict(repo_root, [])
    assert result.returncode != 0
    output = result.stdout + result.stderr
    assert "green" not in output
    assert re.search(r"empty|leer", output, re.I)


def test_nonempty_green_checklist_positive_anchor(repo_root):
    result = verdict(repo_root, [{"name": "CI", "state": "SUCCESS"}, {"name": "Vitest", "state": "SUCCESS"}])
    assert result.returncode == 0
    assert "green" in result.stdout + result.stderr


def test_pending_and_red_distinct_from_green(repo_root):
    test_nonempty_green_checklist_positive_anchor(repo_root)
    result = verdict(repo_root, [{"name": "CI", "state": "SUCCESS"}, {"name": "Vitest", "state": "PENDING"}])
    assert result.returncode != 0
    assert "green" not in result.stdout + result.stderr
    result = verdict(repo_root, [{"name": "CI", "state": "FAILURE"}])
    assert result.returncode != 0
    assert "green" not in result.stdout + result.stderr
    assert "red" in result.stdout + result.stderr


def test_hygiene_reference_explains_empty_all(repo_root):
    source = (repo_root / ".claude/skills/references/repo-hygiene-ops.md").read_text()
    assert "T002822" in source
    assert "all(" in source
    assert re.search(r"nichtleer|nicht leer|vakuos", source, re.I)
