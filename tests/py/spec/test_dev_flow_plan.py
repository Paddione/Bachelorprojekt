"""Tests for dev-flow-plan and Plan Intel Bundle (migrated from tests/spec/dev-flow-plan.bats)."""

import json
import os
from pathlib import Path
import re
import subprocess
import pytest


@pytest.fixture(scope="module")
def pib_paths(repo_root: Path):
    schema = repo_root / ".claude" / "skills" / "references" / "schemas" / "plan-intel-bundle.schema.json"
    dts = repo_root / ".claude" / "skills" / "references" / "schemas" / "plan-intel-bundle.d.ts"
    example = repo_root / ".claude" / "skills" / "references" / "schemas" / "plan-intel-bundle.example.json"
    plan_skill = repo_root / ".agents" / "skills" / "dev-flow-plan" / "SKILL.md"
    exec_skill = repo_root / ".agents" / "skills" / "dev-flow-execute" / "SKILL.md"
    return schema, dts, example, plan_skill, exec_skill


def test_pib_schema_is_valid_json(pib_paths):
    schema, _, _, _, _ = pib_paths
    assert schema.is_file()
    data = json.loads(schema.read_text())
    assert "2020-12" in data.get("$schema", "")
    assert set(["meta", "impact_files", "symbols"]).issubset(set(data.get("required", [])))
    for s in [
        "meta",
        "impact_files",
        "symbols",
        "call_graph",
        "db_tables",
        "api_contracts",
        "external_types",
        "risks",
    ]:
        assert s in data.get("properties", {}), f"Missing schema section: {s}"


def test_pib_example_json_conforms(pib_paths):
    _, _, example, _, _ = pib_paths
    assert example.is_file()
    data = json.loads(example.read_text())

    for k in ["meta", "impact_files", "symbols"]:
        assert k in data, f"Missing top-level key: {k}"

    assert isinstance(data["meta"]["slug"], str)
    assert isinstance(data["meta"]["ticket_id"], str)

    assert isinstance(data["impact_files"], list) and len(data["impact_files"]) > 0
    for item in data["impact_files"]:
        for field in ["path", "language", "loc", "s1_limit", "s1_baseline", "s1_budget"]:
            assert field in item, f"Missing impact_files field: {field}"

    assert isinstance(data["symbols"], list) and len(data["symbols"]) > 0
    for sym in data["symbols"]:
        for field in ["qualified_name", "kind", "file", "signature", "type_text", "source"]:
            assert field in sym, f"Missing symbols field: {field}"


def test_pib_schema_and_dts_key_parity(pib_paths):
    schema, dts, _, _, _ = pib_paths
    assert dts.is_file()
    schema_data = json.loads(schema.read_text())
    schema_keys = sorted(schema_data.get("properties", {}).keys())

    dts_content = dts.read_text()
    dts_block = re.search(r"export interface PlanIntelBundle \{([^}]+)\}", dts_content, re.S)
    assert dts_block is not None
    dts_keys = sorted(
        re.findall(r"^\s+([a-zA-Z_]+)\??:", dts_block.group(1), re.M)
    )
    assert schema_keys == dts_keys, f"DRIFT: schema={schema_keys} dts={dts_keys}"


def test_dev_flow_plan_wiring(pib_paths):
    _, _, _, plan_skill, _ = pib_paths
    content = plan_skill.read_text()
    assert re.search(r"A\.1\.5|Intel-Gathering|Plan Intel Bundle", content)
    assert "intel.json" in content
    for src in ["codebase-memory", "mcp-postgres", "context7"]:
        assert src in content, f"Missing {src} in dev-flow-plan SKILL.md"
    assert re.search(r"\bLSP\b", content), "Missing LSP in dev-flow-plan SKILL.md"


def test_dev_flow_execute_step2_references_intel_json(pib_paths):
    _, _, _, _, exec_skill = pib_paths
    content = exec_skill.read_text()
    step2 = re.search(r"## Schritt 2:(.*?)(##|\Z)", content, re.S)
    assert step2 is not None
    assert "intel.json" in step2.group(1)


def test_gotchas_footguns_alt_worktrees(repo_root: Path):
    footguns = repo_root / "docs" / "superpowers" / "references" / "gotchas-footguns.md"
    content = footguns.read_text()
    assert "Alt-Worktrees nach T002135" in content
    assert ".git/worktrees/<name>/modules" in content


def test_dev_flow_plan_prose_and_hold_flags(repo_root: Path):
    plan_skill = repo_root / ".claude" / "skills" / "dev-flow-plan" / "SKILL.md"
    assert plan_skill.is_file()
    content = plan_skill.read_text()
    assert "plan-lint" in content
    assert "3.7" in content
    assert "frontmatter" in content

    stage_plan = (repo_root / "scripts" / "vda" / "ticket" / "stage-plan.sh").read_text()
    assert "--hold" in stage_plan

    ticket_sh = (repo_root / "scripts" / "ticket.sh").read_text()
    assert re.search(r"^\s+release-hold\)", ticket_sh, re.M)

    procedure = (repo_root / ".claude" / "skills" / "references" / "ticket-stage-procedure.md").read_text()
    assert re.search(r"stage-plan.*--hold", content)
    assert re.search(r"stage-plan.*--hold", procedure)

    exec_skill = (repo_root / ".agents" / "skills" / "dev-flow-execute" / "SKILL.md").read_text()
    assert "release-hold" in exec_skill


@pytest.fixture
def clean_fixture_dirs(repo_root: Path):
    yield
    main_root = Path(
        subprocess.check_output(
            ["git", "-C", str(repo_root), "rev-parse", "--git-common-dir"], text=True
        ).strip()
    ).parent
    for base in [repo_root, main_root]:
        for d in base.glob(".worktrees/t002375-p2-*"):
            if d.is_dir():
                try:
                    d.rmdir()
                except OSError:
                    pass
        for d in base.glob(".worktrees/t002412-*"):
            if d.is_dir():
                try:
                    d.rmdir()
                except OSError:
                    pass


def _write_lock(lock_dir: Path, name: str, owner_sid: str, worktree: str):
    (lock_dir / f"{name}.json").write_text(
        json.dumps(
            {
                "scope": "branch",
                "id": "probe",
                "owner_sid": owner_sid,
                "owner_pid": os.getpid(),
                "label": "probe",
                "branch": "probe",
                "worktree": worktree,
                "created_at": "2026-01-01T00:00:00Z",
                "heartbeat_at": "2026-01-01T00:00:00Z",
            }
        )
    )


def test_worktree_write_guard_guards(repo_root: Path, run_cmd, tmp_path: Path, clean_fixture_dirs):
    guard = repo_root / "scripts" / "hooks" / "worktree-write-guard.sh"
    assert guard.is_file()
    assert os.access(guard, os.X_OK)

    ld = tmp_path / "locks-a"
    ld.mkdir()
    mywt = repo_root / ".worktrees" / "t002375-p2-mine"
    mywt.mkdir(parents=True, exist_ok=True)
    _write_lock(ld, "branch__probe", "sid-mine", str(mywt))

    env = os.environ.copy()
    env["AGENT_LOCK_DIR"] = str(ld)
    env["CLAUDE_CODE_SESSION_ID"] = "sid-mine"

    # within own worktree allowed
    payload_ok = json.dumps({"tool_input": {"file_path": str(mywt / "datei.txt")}})
    res_ok = subprocess.run(
        ["bash", str(guard)], cwd=repo_root, env=env, input=payload_ok, text=True, capture_output=True
    )
    assert res_ok.returncode == 0

    # outside own worktree rejected
    payload_bad = json.dumps({"tool_input": {"file_path": str(repo_root / "scripts" / "irgendwas.sh")}})
    res_bad = subprocess.run(
        ["bash", str(guard)], cwd=repo_root, env=env, input=payload_bad, text=True, capture_output=True
    )
    assert res_bad.returncode != 0
    assert str(mywt) in res_bad.stdout or str(mywt) in res_bad.stderr
    assert "WORKTREE_GUARD_BYPASS" in res_bad.stdout or "WORKTREE_GUARD_BYPASS" in res_bad.stderr

    # bypass works
    env_bp = env.copy()
    env_bp["WORKTREE_GUARD_BYPASS"] = "1"
    res_bp = subprocess.run(
        ["bash", str(guard)], cwd=repo_root, env=env_bp, input=payload_bad, text=True, capture_output=True
    )
    assert res_bp.returncode == 0


def test_worktree_write_guard_settings_json_registration(repo_root: Path):
    settings_file = repo_root / ".claude" / "settings.json"
    data = json.loads(settings_file.read_text())
    pre = data.get("hooks", {}).get("PreToolUse", [])
    hits = [h for h in pre if "worktree-write-guard" in json.dumps(h)]
    assert hits, "kein PreToolUse-Eintrag fuer worktree-write-guard"
    matcher = hits[0].get("matcher", "")
    for tool in ["Write", "Edit"]:
        assert tool in matcher, f"{tool} fehlt im matcher: {matcher}"


def test_worktree_create_anchor_commit_only_on_new_branches(repo_root: Path):
    script = (repo_root / "scripts" / "worktree-create.sh").read_text()
    lines = script.splitlines()
    existing_line = next(i for i, line in enumerate(lines) if "ready on existing branch" in line)
    anchor_line = next(i for i, line in enumerate(lines) if "--allow-empty" in line)
    assert anchor_line > existing_line
