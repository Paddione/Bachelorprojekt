"""Native migration of tests/spec/mishap-bundle/ci-test-agentlock.bats."""

import re

import pytest

VITEST_WARN = "⚠ vitest not available (worktree symlink limitation)"


@pytest.fixture
def paths(repo_root):
    return {
        "script": repo_root / "scripts" / "ci-pr-health.sh",
        "taskfile": repo_root / "taskfiles" / "Taskfile.test.yml",
        "agent_lock": repo_root / "scripts" / "agent-lock.sh",
        "gates": repo_root / "docs" / "code-quality" / "gates.yaml",
    }


def test_t002414_m1_ci_pr_health_sh_exists_and_is_executable(paths):
    script = paths["script"]
    assert script.is_file()
    assert script.stat().st_mode & 0o111, "nicht ausfuehrbar"


def test_t002414_m1_ci_pr_health_sh_declares_json_flag_and_documented_exit_codes(paths):
    text = paths["script"].read_text(encoding="utf-8")
    assert "--json" in text
    assert re.search(r"^#\s+0\s+=", text, re.M)
    assert re.search(r"^#\s+1\s+=", text, re.M)
    assert re.search(r"^#\s+2\s+=", text, re.M)


def test_t002414_m2_taskfile_test_changed_prints_warning_when_vitest_unavailable(paths):
    assert VITEST_WARN in paths["taskfile"].read_text(encoding="utf-8")


def test_t002414_m2_taskfile_test_changed_guards_vitest_invocation_behind_condition(paths):
    text = paths["taskfile"].read_text(encoding="utf-8")
    vitest_refs = text.count("pnpm vitest --version")
    assert vitest_refs >= 1
    guard_count = text.count("vitest not available (worktree symlink limitation)")
    # Mismatch is reported but does not fail the case (BATS-Original: nur echo).
    if guard_count != vitest_refs:
        print(f"WARNING: {guard_count} warning lines for {vitest_refs} vitest refs — mismatch!")


def test_t002414_m3_agent_lock_sh_complies_with_s1_sh_limit_from_gates_yaml(paths):
    line_count = len(paths["agent_lock"].read_bytes().split(b"\n")) - 1
    m = None
    for line in paths["gates"].read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s+\.sh: (\d+)", line)
        if m:
            break
    limit = int(m.group(1)) if m else None
    print(f"agent-lock.sh: {line_count} lines (S1 .sh limit: {limit or '?'})")
    assert limit is not None
    assert line_count <= limit
