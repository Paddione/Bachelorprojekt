"""Native migration of tests/spec/toolset-registry/harness-specialization.bats."""
# [T900791]
# Harness guards and adapter dry-run. Command output verification [T002448-M4]: runs

# scripts/toolset/check.mjs and scripts/toolset/sync.mjs against fixture registries under tmp_path.

import hashlib

import pytest


def write_harness_fixture(out_dir, registry, provider, roles, enabled):
    """Fixture registry with canonical mcp:a, an opencode harness block and forbidden provider deepseek,
    plus the matching .opencode/opencode.jsonc under out_dir."""
    registry.write_text(
        "capabilities:\n"
        "  demo-cap:\n"
        "    mcp:a:\n"
        "      state: canonical\n"
        '      use_when: "Fixture-Zweck"\n'
        "      roles: [orchestrator]\n"
        "harnesses:\n"
        "  opencode:\n"
        '    job: "Fixture-Harness"\n'
        f"    provider: {provider}\n"
        "    default_model: fixture-model\n"
        f"    roles: [{roles}]\n"
        "    config: .opencode/opencode.jsonc\n"
        "forbidden_providers: [deepseek]\n",
        encoding="utf-8",
    )
    (out_dir / ".opencode" / "opencode.jsonc").write_text(
        "{\n"
        "  // keep me\n"
        '  "mcp": {\n'
        '    "a": {\n'
        '      "type": "local",\n'
        '      "command": ["echo", "a"],\n'
        f'      "enabled": {enabled}\n'
        "    }\n"
        "  }\n"
        "}\n",
        encoding="utf-8",
    )


@pytest.fixture
def hf(repo_root, tmp_path, run_cmd):
    out_dir = tmp_path / "out"
    (out_dir / ".opencode").mkdir(parents=True)
    registry = tmp_path / "capabilities.yaml"

    def _check(**env_extra):
        env = {"TOOLSET_REGISTRY": str(registry), "TOOLSET_OUT_DIR": str(out_dir)}
        return run_cmd(["node", str(repo_root / "scripts" / "toolset" / "check.mjs")],
                       cwd=repo_root, env=env)

    return {"out": out_dir, "registry": registry, "check": _check, "repo": repo_root, "run_cmd": run_cmd}


def test_check_forbidden_provider_fails(hf):
    write_harness_fixture(hf["out"], hf["registry"], "deepseek", "orchestrator", "true")
    res = hf["check"]()
    assert res.returncode == 1
    assert "forbidden provider deepseek" in res.output


def test_check_unknown_harness_role_fails(hf):
    write_harness_fixture(hf["out"], hf["registry"], "local", "orchestrater", "true")
    res = hf["check"]()
    assert res.returncode == 1
    assert "unknown role 'orchestrater'" in res.output


def test_check_drift_fails(hf):
    write_harness_fixture(hf["out"], hf["registry"], "local", "orchestrator", "false")
    res = hf["check"]()
    assert res.returncode == 1
    assert "DRIFT opencode" in res.output


def test_check_clean_fixture_passes(hf):
    write_harness_fixture(hf["out"], hf["registry"], "local", "orchestrator", "true")
    res = hf["check"]()
    assert res.returncode == 0, res.output


def test_sync_dry_run_writes_nothing(hf):
    write_harness_fixture(hf["out"], hf["registry"], "local", "orchestrator", "false")
    target = hf["out"] / ".opencode" / "opencode.jsonc"
    before = hashlib.sha256(target.read_bytes()).hexdigest()
    res = hf["run_cmd"](["node", str(hf["repo"] / "scripts" / "toolset" / "sync.mjs"), "--dry-run"],
                        cwd=hf["repo"],
                        env={"TOOLSET_REGISTRY": str(hf["registry"]), "TOOLSET_OUT_DIR": str(hf["out"])})
    assert res.returncode == 0
    after = hashlib.sha256(target.read_bytes()).hexdigest()
    assert before == after, "dry-run must not write"
    assert '"enabled": true' in res.output
