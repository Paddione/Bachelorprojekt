"""Native migration of tests/spec/agent-library.bats."""
import glob
import re
from pathlib import Path

import pytest

BEHAVIOR_FRAGMENTS = [
    ".claude/lib/behaviors/never-push-main.md",
    ".claude/lib/behaviors/inject-plan-context.md",
    ".claude/lib/behaviors/tool-use-safety.md",
    ".claude/lib/behaviors/commit-conventions.md",
]
PROMPT_SNIPPETS = [
    ".claude/lib/prompts/review-lens-format.md",
    ".claude/lib/prompts/diff-analysis-context.md",
    ".claude/lib/prompts/review-coordinator.md",
]
README_ENTRIES = [
    "behaviors/never-push-main.md",
    "behaviors/inject-plan-context.md",
    "behaviors/tool-use-safety.md",
    "behaviors/commit-conventions.md",
    "prompts/review-lens-format.md",
    "prompts/diff-analysis-context.md",
    "prompts/review-coordinator.md",
]
TOOLS_HELPER = "tests/spec/helpers/agent-tools.py"
KNOWN_BUILTINS = (
    " Agent Artifact Bash BashOutput Edit ExitPlanMode Glob Grep KillShell LS "
    "NotebookEdit NotebookRead Read Skill Task TodoWrite ToolSearch WebFetch WebSearch Write "
)
DOMAIN_AGENTS = ["bachelorprojekt-db", "bachelorprojekt-infra", "bachelorprojekt-security"]


def _agents_dir(repo_root: Path) -> Path:
    agents = repo_root / ".agents" / "agents"
    return agents if agents.is_dir() else repo_root / ".claude" / "agents"


def _library_agents(repo_root: Path):
    """Equivalent of the BATS glob loop: bachelorprojekt-*.md then bp-*.md, existing only."""
    adir = _agents_dir(repo_root)
    files = sorted(glob.glob(str(adir / "bachelorprojekt-*.md"))) + \
        sorted(glob.glob(str(adir / "bp-*.md")))
    return [Path(f) for f in files if Path(f).exists()]


def _tool_entries(run_cmd, agent_rel: str):
    """Entries emitted by tests/spec/helpers/agent-tools.py (exit status not checked, as in BATS)."""
    r = run_cmd(["python3", TOOLS_HELPER, agent_rel], timeout=300)
    return r.stdout.splitlines()


def _agent_files(repo_root: Path):
    return sorted(glob.glob(str(repo_root / ".claude" / "agents" / "*.md")))


def test_all_behavior_fragment_files_exist(repo_root):
    for f in BEHAVIOR_FRAGMENTS:
        assert (repo_root / f).is_file(), f"MISSING: {f}"


def test_all_prompt_snippet_files_exist(repo_root):
    for f in PROMPT_SNIPPETS:
        assert (repo_root / f).is_file(), f"MISSING: {f}"


def test_readme_md_index_exists_and_lists_all_fragments(repo_root):
    readme = repo_root / ".claude" / "lib" / "README.md"
    assert readme.is_file()
    text = readme.read_text(encoding="utf-8")
    for entry in README_ENTRIES:
        assert entry in text, f"README missing entry: {entry}"


def test_all_agents_have_a_library_section(repo_root):
    for agent in _library_agents(repo_root):
        text = agent.read_text(encoding="utf-8")
        assert re.search(r"^## Library", text, re.M), f"MISSING Library section in: {agent}"


def test_all_library_paths_referenced_in_agents_actually_exist(repo_root):
    for agent in _library_agents(repo_root):
        for line in agent.read_text(encoding="utf-8").splitlines():
            if line.startswith("- .claude/lib/"):
                path = line[2:]
                assert (repo_root / path).is_file(), f"DEAD LINK in {agent}: {path}"


# ── [T002221] tools: frontmatter must name tools that actually resolve ──────


def test_t002221_no_agent_declares_a_wildcard_tool_name(run_cmd, repo_root):
    bad = ""
    for agent in _agent_files(repo_root):
        rel = str(Path(agent).relative_to(repo_root))
        for entry in _tool_entries(run_cmd, rel):
            if "*" in entry:
                bad += f"{rel}: {entry}\n"
    assert bad == "", f"wildcard tool names found:\n{bad}"


def test_t002221_every_mcp_tool_name_uses_the_mcp_server_tool_form(run_cmd, repo_root):
    bad = ""
    for agent in _agent_files(repo_root):
        rel = str(Path(agent).relative_to(repo_root))
        for entry in _tool_entries(run_cmd, rel):
            if entry.startswith("mcp_") or "_mcp_" in entry:
                if not re.fullmatch(r"mcp__[a-z0-9-]+__[a-z0-9_]+", entry):
                    bad += f"{rel}: {entry}\n"
    assert bad == "", f"malformed MCP tool names (expected mcp__<server>__<tool>):\n{bad}"


def test_t002221_every_non_mcp_tool_name_is_a_known_builtin(run_cmd, repo_root):
    bad = ""
    for agent in _agent_files(repo_root):
        rel = str(Path(agent).relative_to(repo_root))
        for entry in _tool_entries(run_cmd, rel):
            if entry.startswith("mcp__") or entry.startswith("mcp_") or "_mcp_" in entry:
                continue
            if f" {entry} " not in KNOWN_BUILTINS:
                bad += f"{rel}: {entry}\n"
    assert bad == "", f"unknown built-in tool names:\n{bad}"


def test_t002221_bp_db_infra_security_declare_no_tools_key(run_cmd, repo_root):
    # Regression pin: dropping the key is the deliberate fix (they inherit all tools).
    for agent in DOMAIN_AGENTS:
        entries = [e for e in _tool_entries(run_cmd, f".claude/agents/{agent}.md") if e]
        assert len(entries) == 0, f"{agent} declares {len(entries)} tools entries — expected none"


def test_t002221_an_agent_that_declares_tools_resolves_to_a_non_empty_list(run_cmd, repo_root):
    for agent in _agent_files(repo_root):
        rel = str(Path(agent).relative_to(repo_root))
        text = Path(agent).read_text(encoding="utf-8")
        if re.search(r"^tools:( *$| *\[)", text, re.M):
            entries = [e for e in _tool_entries(run_cmd, rel) if e]
            assert len(entries) > 0, f"{rel} has a tools key that resolves to zero entries"
