"""Native migration of tests/spec/brain-auto-memory.bats."""

import hashlib
import json
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.fixture
def env(repo_root: Path, tmp_path: Path, monkeypatch):
    work = tmp_path / "work"
    work.mkdir()
    root = work / "projects"
    state = work / "state.json"
    candidates = work / "candidates.json"
    (root / "demoproj" / "memory").mkdir(parents=True)
    monkeypatch.setenv("AUTO_MEMORY_ROOT", str(root))
    monkeypatch.setenv("AUTO_MEMORY_STATE", str(state))
    monkeypatch.setenv("AUTO_MEMORY_CANDIDATES", str(candidates))
    monkeypatch.delenv("BRAIN_REPO_PATH", raising=False)
    monkeypatch.delenv("AUTO_MEMORY_ASSUME", raising=False)
    return {
        "work": work,
        "root": root,
        "state": state,
        "candidates": candidates,
        "scan": repo_root / "scripts" / "brain-auto-memory-scan.sh",
        "export": repo_root / "scripts" / "brain-auto-memory-export.sh",
    }


def _page(env, project: str, filename: str, mtype: str, body: str = "just some prose body") -> Path:
    d = env["root"] / project / "memory"
    d.mkdir(parents=True, exist_ok=True)
    p = d / filename
    p.write_text(
        "---\n"
        f"name: {filename}\n"
        f"description: demo page {filename}\n"
        "metadata:\n"
        f"  type: {mtype}\n"
        "---\n"
        f"{body}\n",
        encoding="utf-8",
    )
    return p


def _init_brain(env, monkeypatch) -> Path:
    brain = env["work"] / "brain"
    brain.mkdir()
    remote = env["work"] / "remote.git"
    subprocess.run(["git", "-C", str(brain), "init", "-q"], check=True)
    subprocess.run(["git", "-C", str(brain), "config", "user.email", "t@t"], check=True)
    subprocess.run(["git", "-C", str(brain), "config", "user.name", "t"], check=True)
    subprocess.run(["git", "init", "-q", "--bare", str(remote)], check=True)
    subprocess.run(["git", "-C", str(brain), "remote", "add", "origin", str(remote)], check=True)
    monkeypatch.setenv("BRAIN_REPO_PATH", str(brain))
    return brain


def _answers(env, monkeypatch, text: str) -> None:
    answers = env["work"] / "answers"
    answers.write_text(text, encoding="utf-8")
    monkeypatch.setenv("AUTO_MEMORY_ASSUME", str(answers))


def _jq(expr: str, path: Path, run_cmd):
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")
    return run_cmd(["jq", "-e", expr, str(path)])


def test_scan_reports_a_new_memory_page_as_candidate(run_cmd, env):
    _page(env, "demoproj", "feedback_thing.md", "feedback")
    res = run_cmd(["bash", str(env["scan"])])
    assert res.returncode == 0, res.output
    check = _jq('.[0].file == "feedback_thing.md" and .[0].metadata_type == "feedback"', env["candidates"], run_cmd)
    assert check.returncode == 0, f"candidate not emitted: {env['candidates'].read_text()}"


def test_scan_does_not_re_report_an_unchanged_page(run_cmd, env):
    page = _page(env, "demoproj", "note1.md", "project")
    run_cmd(["bash", str(env["scan"])])
    h = hashlib.sha256(page.read_bytes()).hexdigest()
    env["state"].write_text(
        json.dumps({"demoproj/note1.md": {"hash": h, "last_export": "2026-07-04T00:00:00Z"}}),
        encoding="utf-8",
    )
    res = run_cmd(["bash", str(env["scan"])])
    assert res.returncode == 0, res.output
    check = _jq("length == 0", env["candidates"], run_cmd)
    assert check.returncode == 0, f"unchanged page re-reported: {env['candidates'].read_text()}"


def test_scan_skips_a_page_without_parsable_frontmatter_and_warns(run_cmd, env):
    (env["root"] / "demoproj" / "memory" / "bare.md").write_text(
        "no frontmatter here\njust text\n", encoding="utf-8"
    )
    res = run_cmd(["bash", str(env["scan"])])
    assert res.returncode == 0, res.output
    assert "bare.md" in res.output, "no warning for bare.md"
    check = _jq("length == 0", env["candidates"], run_cmd)
    assert check.returncode == 0, "bare page became candidate"


def test_scan_skips_a_page_containing_a_secret_pattern(run_cmd, env):
    _page(env, "demoproj", "secret.md", "reference", "-----BEGIN " + "PRIVATE KEY-----")
    res = run_cmd(["bash", str(env["scan"])])
    assert res.returncode == 0, res.output
    assert "secret.md" in res.output, "no secret warning"
    check = _jq("length == 0", env["candidates"], run_cmd)
    assert check.returncode == 0, "secret page became candidate"


def test_scan_skips_memory_md_index_files(run_cmd, env):
    _page(env, "demoproj", "MEMORY.md", "project")
    res = run_cmd(["bash", str(env["scan"])])
    assert res.returncode == 0
    check = _jq("length == 0", env["candidates"], run_cmd)
    assert check.returncode == 0, "MEMORY.md became candidate"


def test_export_maps_feedback_to_decision_and_writes_converted_page(run_cmd, env, monkeypatch):
    _page(env, "demoproj", "feedback_conv.md", "feedback")
    brain = _init_brain(env, monkeypatch)
    _answers(env, monkeypatch, "y\n")
    res = run_cmd(["bash", str(env["export"])])
    assert res.returncode == 0, res.output
    outs = sorted((brain / "raw" / "auto-memory" / "demoproj").rglob("*.md"))
    assert outs, "no page written"
    text = outs[0].read_text(encoding="utf-8")
    assert "type: decision" in text, f"type not decision: {text}"
    assert "auto-memory" in text, "missing auto-memory tag"


def test_export_aborts_when_brain_repo_path_is_unset_and_leaves_state_untouched(run_cmd, env, monkeypatch):
    _page(env, "demoproj", "x.md", "project")
    env["state"].write_text('{"pre":"existing"}\n', encoding="utf-8")
    before = env["state"].read_text(encoding="utf-8")
    _answers(env, monkeypatch, "y\n")
    res = run_cmd(["bash", str(env["export"])])
    assert res.returncode != 0, "export did not abort"
    assert env["state"].read_text(encoding="utf-8") == before, "state mutated on abort"


def test_export_updates_state_only_for_approved_not_rejected(run_cmd, env, monkeypatch):
    _page(env, "demoproj", "keep.md", "project")
    _page(env, "demoproj", "drop.md", "project")
    _init_brain(env, monkeypatch)
    _answers(env, monkeypatch, "y\nn\n")
    res = run_cmd(["bash", str(env["export"])])
    assert res.returncode == 0, res.output
    check = _jq(
        '[to_entries[] | select(.key | startswith("demoproj/"))] | length == 1',
        env["state"],
        run_cmd,
    )
    assert check.returncode == 0, f"state count wrong: {env['state'].read_text()}"
