"""Native migration of tests/spec/toolset-registry/agentic-resource-lookup.bats."""
# Command output verification [T002448-M4]: each test runs `node scripts/agentic-lookup.mjs`

# and checks exit status and output.

import hashlib
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def env_ctx(repo_root, tmp_path):
    fixture_dir = repo_root / "tests" / "fixtures" / "agentic-lookup"
    reg_dir = tmp_path / "registry"
    reg_dir.mkdir()
    shutil.copyfile(repo_root / "docs" / "agent-guide" / "registry" / "capabilities.yaml",
                    reg_dir / "capabilities.yaml")
    return {"repo": repo_root, "fixture": fixture_dir, "reg_dir": reg_dir, "tmp": tmp_path}


@pytest.fixture
def lookup(run_cmd, env_ctx):
    def _run(verb, *args):
        return run_cmd(
            ["node", str(env_ctx["repo"] / "scripts" / "agentic-lookup.mjs"), verb, *args],
            cwd=env_ctx["repo"],
            env={
                "TOOLSET_REGISTRY": str(env_ctx["reg_dir"] / "capabilities.yaml"),
                "AGENTIC_REGISTRY_FIXTURE_DIR": str(env_ctx["fixture"]),
                "AGENTIC_TOOLS_FIXTURE": str(env_ctx["fixture"] / "tools-list.json"),
            },
        )

    return _run


def _write_registry(env_ctx, name, text):
    path = env_ctx["tmp"] / f"{name}.yaml"
    path.write_text(text, encoding="utf-8")
    return path


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_find_suppressed_entry_from_capabilities_yaml_is_annotated_with_state_and_reason(env_ctx, lookup):
    reg = _write_registry(env_ctx, "find-suppressed", """capabilities:
  browser-automation:
    mcp:com.pulsemcp/playwright-stealth:
      state: suppressed
      reason: "chrome-devtools-mcp deckt den Bedarf ab."
""")
    shutil.copyfile(reg, env_ctx["reg_dir"] / "capabilities.yaml")

    res = lookup("find", "browser automation")
    assert res.returncode == 0
    assert "com.pulsemcp/playwright-stealth" in res.output
    assert "suppressed" in res.output
    assert "chrome-devtools-mcp deckt den Bedarf" in res.output


def test_find_unreachable_registry_returns_local_hits_names_source_on_stderr_exits_0(env_ctx, run_cmd):
    reg = _write_registry(env_ctx, "find-netfail", """capabilities:
  filesystem:
    mcp:com.example/filesystem:
      state: canonical
      use_when: "Filesystem access"
      roles: [orchestrator]
""")
    shutil.copyfile(reg, env_ctx["reg_dir"] / "capabilities.yaml")

    res = run_cmd(
        ["node", str(env_ctx["repo"] / "scripts" / "agentic-lookup.mjs"), "find", "filesystem"],
        cwd=env_ctx["repo"],
        env={
            "TOOLSET_REGISTRY": str(env_ctx["reg_dir"] / "capabilities.yaml"),
            "AGENTIC_REGISTRY_BASE": "http://127.0.0.1:9",
        },
    )
    assert res.returncode == 0
    assert "com.example/filesystem" in res.output
    assert "canonical" in res.output


def test_inspect_server_with_remote_labels_output_as_schema(lookup):
    res = lookup("inspect", "com.pulsemcp/playwright-stealth")
    assert res.returncode == 0
    assert "schema" in res.output
    assert "browser_navigate" in res.output
    assert "browser_screenshot" in res.output


def test_inspect_server_without_remote_labels_output_as_readme_and_names_acquisition_path(lookup):
    res = lookup("inspect", "com.example/filesystem")
    assert res.returncode == 0
    assert "readme" in res.output


def test_record_without_reason_on_non_canonical_state_exits_1_before_touching_file(env_ctx, run_cmd):
    reg_file = env_ctx["reg_dir"] / "capabilities.yaml"
    reg = _write_registry(env_ctx, "record-test", "capabilities: {}\n")
    shutil.copyfile(reg, reg_file)
    before = _sha(reg_file)

    pos_reg = _write_registry(env_ctx, "record-positive", "capabilities: {}\n")
    shutil.copyfile(pos_reg, reg_file)
    record_env = {"TOOLSET_REGISTRY": str(reg_file)}
    script = str(env_ctx["repo"] / "scripts" / "agentic-lookup.mjs")

    res = run_cmd(["node", script, "record", "com.pulsemcp/test-server",
                   "--capability", "browser-automation", "--state", "suppressed",
                   "--reason", "test reason", "--source", "npm:@pulsemcp/test"],
                  cwd=env_ctx["repo"], env=record_env)
    assert res.returncode == 0

    shutil.copyfile(reg, reg_file)
    res = run_cmd(["node", script, "record", "com.pulsemcp/test-server",
                   "--capability", "browser-automation", "--state", "suppressed",
                   "--source", "npm:@pulsemcp/test"],
                  cwd=env_ctx["repo"], env=record_env)
    assert res.returncode == 1

    after = _sha(reg_file)
    assert before == after
