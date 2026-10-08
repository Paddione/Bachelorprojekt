"""Native migration of tests/spec/agent-skills/harness-guard-registration-T900024.bats."""

import json
from pathlib import Path

import pytest

GUARD_REL = "scripts/hooks/worktree-write-guard.sh"


def _pretooluse_commands(path: Path):
    """Liefert 'matcher :: command' je PreToolUse-Hook (echtes JSON-Parsing)."""
    with open(path, encoding="utf-8") as fh:
        cfg = json.load(fh)
    hooks = cfg.get("hooks", cfg)
    lines = []
    for entry in hooks.get("PreToolUse", []):
        for hook in entry.get("hooks", []):
            lines.append(f"{entry.get('matcher', '')} :: {hook.get('command', '')}")
    return "\n".join(lines)


def test_guard_skript_existiert_unter_dem_geprueften_pfad(repo_root):
    assert (repo_root / GUARD_REL).is_file()


def test_claude_code_worktree_write_guard_als_pretooluse_auf_write_edit_registriert(repo_root):
    out = _pretooluse_commands(repo_root / ".claude/settings.json")
    assert GUARD_REL in out
    assert "Write" in out
    assert "Edit" in out


def test_agy_worktree_write_guard_als_pretooluse_auf_write_edit_registriert(repo_root):
    out = _pretooluse_commands(repo_root / ".agy/hooks.json")
    assert GUARD_REL in out
    assert "Write" in out
    assert "Edit" in out


def test_opencode_v2_plugin_registriert_den_guard_ueber_ctx_tool_hook(repo_root):
    plugin = repo_root / "scripts/opencode-plugins/worktree-write-guard.ts"
    assert plugin.is_file()
    text = plugin.read_text(encoding="utf-8")
    assert sum(1 for line in text.splitlines() if 'ctx.tool.hook("execute.before"' in line) >= 1
    assert sum(1 for line in text.splitlines() if GUARD_REL in line) >= 1


def test_codex_hooks_json_registriert_den_guard_sobald_die_datei_existiert(repo_root):
    hooks = repo_root / ".codex/hooks.json"
    if not hooks.is_file():
        pytest.skip("keine .codex/hooks.json im Repo")
    assert GUARD_REL in _pretooluse_commands(hooks)


def test_keine_weitere_harness_hooks_json_ohne_guard_registrierung(run_cmd, repo_root):
    r = run_cmd(["git", "ls-files", ".*/hooks.json"])
    missing = []
    for rel in r.stdout.splitlines():
        if not rel:
            continue
        if GUARD_REL not in (repo_root / rel).read_text(encoding="utf-8"):
            missing.append(rel)
    assert not missing, "hooks.json ohne worktree-write-guard-Registrierung: " + " ".join(missing)
