"""Native migration of tests/unit/test-tasks-node-deps.bats."""
import re
from pathlib import Path

# Regression test for T000427: test tasks that run node scripts must lazily
# install root node_modules first ([ -d node_modules ] || npm ci).
GUARD_RE = r"\[ -d node_modules \] \|\| npm ci"
# A real `node` invocation in a cmd: "      - node ..." (NOT "node_modules").
NODE_RE = r"-[ \t\r\f\v]+node[ \t\r\f\v]"


def _task_block(taskfile: Path, name: str) -> str:
    """Top-level task block '  <name>:' up to (excluding) the next top-level task."""
    marker = f"  {name}:"
    out = []
    capturing = False
    for line in taskfile.read_text(encoding="utf-8").splitlines():
        if line.startswith(marker):
            capturing = True
            out.append(line)
            continue
        if capturing and re.match(r"^  [a-zA-Z]", line):
            break
        if capturing:
            out.append(line)
    return "\n".join(out)


def _first_match_line(block: str, pattern: str):
    """1-based line number of the first matching line in block, or None."""
    for number, line in enumerate(block.splitlines(), start=1):
        if re.search(pattern, line):
            return number
    return None


def test_t000427_split_test_taskfile_exists(repo_root):
    assert (repo_root / "taskfiles" / "Taskfile.test.yml").is_file()


def test_t000427_test_agent_guide_block_is_extractable_and_runs_node(repo_root):
    block = _task_block(repo_root / "taskfiles" / "Taskfile.test.yml", "test:agent-guide")
    assert block
    assert _first_match_line(block, NODE_RE) is not None


def test_t000427_test_agent_guide_lazily_installs_node_deps_before_any_node_call(repo_root):
    block = _task_block(repo_root / "taskfiles" / "Taskfile.test.yml", "test:agent-guide")
    assert _first_match_line(block, GUARD_RE) is not None
    guard_ln = _first_match_line(block, GUARD_RE)
    node_ln = _first_match_line(block, NODE_RE)
    assert guard_ln is not None
    assert node_ln is not None
    assert guard_ln < node_ln


def test_t000427_the_lazy_install_guard_reuses_the_existing_taskfile_convention(repo_root):
    # 3 pre-existing Playwright guards + the 2 added here = at least 5.
    taskfile = (repo_root / "taskfiles" / "Taskfile.test.yml").read_text(encoding="utf-8")
    count = sum(1 for line in taskfile.splitlines() if re.search(GUARD_RE, line))
    assert count >= 5
