"""Tests for agent library and tool definitions (migrated from tests/spec/agent-library.bats)."""

from pathlib import Path
import re
import subprocess
import pytest


def test_behavior_and_prompt_fragments_exist(repo_root: Path):
    for f in [
        ".claude/lib/behaviors/never-push-main.md",
        ".claude/lib/behaviors/inject-plan-context.md",
        ".claude/lib/behaviors/tool-use-safety.md",
        ".claude/lib/behaviors/commit-conventions.md",
        ".claude/lib/prompts/review-lens-format.md",
        ".claude/lib/prompts/diff-analysis-context.md",
        ".claude/lib/prompts/review-coordinator.md",
    ]:
        p = repo_root / f
        assert p.is_file(), f"MISSING: {f}"

    readme = repo_root / ".claude" / "lib" / "README.md"
    assert readme.is_file()
    readme_text = readme.read_text()
    for entry in [
        "behaviors/never-push-main.md",
        "behaviors/inject-plan-context.md",
        "behaviors/tool-use-safety.md",
        "behaviors/commit-conventions.md",
        "prompts/review-lens-format.md",
        "prompts/diff-analysis-context.md",
        "prompts/review-coordinator.md",
    ]:
        assert entry in readme_text, f"README missing entry: {entry}"


def test_agents_have_library_section_and_valid_links(repo_root: Path):
    agents_dir = repo_root / ".agents" / "agents"
    if not agents_dir.is_dir():
        agents_dir = repo_root / ".claude" / "agents"

    agents = list(agents_dir.glob("bachelorprojekt-*.md")) + list(agents_dir.glob("bp-*.md"))
    for agent in agents:
        content = agent.read_text()
        assert re.search(r"^## Library", content, re.M), f"MISSING Library section in: {agent.name}"

        for line in content.splitlines():
            if line.startswith("- .claude/lib/"):
                ref = repo_root / line[2:].strip()
                assert ref.is_file(), f"DEAD LINK in {agent.name}: {ref}"


def _get_agent_tools(repo_root: Path, agent_file: Path) -> list[str]:
    helper = repo_root / "tests" / "spec" / "helpers" / "agent-tools.py"
    res = subprocess.run(["python3", str(helper), str(agent_file)], capture_output=True, text=True, check=True)
    return [line.strip() for line in res.stdout.splitlines() if line.strip()]


def test_t002221_agent_tools_validity(repo_root: Path):
    agents_dir = repo_root / ".claude" / "agents"
    known_builtin = {
        "Agent",
        "Artifact",
        "Bash",
        "BashOutput",
        "Edit",
        "ExitPlanMode",
        "Glob",
        "Grep",
        "KillShell",
        "LS",
        "NotebookEdit",
        "NotebookRead",
        "Read",
        "Skill",
        "Task",
        "TodoWrite",
        "ToolSearch",
        "WebFetch",
        "WebSearch",
        "Write",
    }

    for agent in agents_dir.glob("*.md"):
        tools = _get_agent_tools(repo_root, agent)
        for tool in tools:
            assert "*" not in tool, f"Wildcard tool name in {agent.name}: {tool}"
            if tool.startswith("mcp_") or "_mcp_" in tool:
                assert re.match(r"^mcp__[a-z0-9-]+__[a-z0-9_]+$", tool), (
                    f"Malformed MCP tool name in {agent.name}: {tool}"
                )
            elif not tool.startswith("mcp__"):
                assert tool in known_builtin, f"Unknown built-in tool in {agent.name}: {tool}"

        content = agent.read_text()
        if re.search(r"^tools:( *$| *\[)", content, re.M):
            assert len(tools) > 0, f"{agent.name} has tools key that resolves to 0 entries"
