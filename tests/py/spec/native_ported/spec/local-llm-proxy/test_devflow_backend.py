"""Devflow-Backend: CLI-Verben, Sandbox-Manifest, Turbolint, ci-map (T901630).

Pruefmodus: command output verification — `python3 -m devflow <verb>` wird
AUSGEFUEHRT und Exit-Code plus stdout/stderr werden geprueft; Stub-Linter im
PATH legen Turbolint-Antworten vor. Kein Source-Grep. Schreibt nur unter
tmp_path (kein Repo-Lock noetig); DEVFLOW_DIR haelt den Turbolint-Cache aus
dem Repo-Root fern.
"""

import importlib.util
import json
import os
import shlex
import shutil
from pathlib import Path

EXPECTED_JOBS = {"test-bats", "test-manifests", "brett-typescript", "vitest-website"}


def _env(repo_root, extra=None):
    env = {"PYTHONPATH": str(repo_root / "scripts")}
    if extra:
        env.update(extra)
    return env


def _payload(tmp_path, name, data):
    target = tmp_path / name
    target.write_text(json.dumps(data), encoding="utf-8")
    return target


def _load_instaci(repo_root):
    spec = importlib.util.spec_from_file_location(
        "devflow_instaci", repo_root / "scripts/devflow/instaci.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_devflow_cli_lists_all_verbs(repo_root, run_cmd):
    res = run_cmd(
        ["python3", "scripts/devflow/cli.py", "--help"],
        cwd=repo_root,
        env=_env(repo_root),
    )
    # Direktskript kennt kein Verb — der Anker prueft den Paket-Einstieg:
    via_package = run_cmd(
        "PYTHONPATH=scripts python3 -m devflow --help",
        cwd=repo_root,
    )
    assert via_package.returncode == 0
    for verb in ("sandbox", "turbolint", "insta_ci"):
        assert verb in via_package.stdout
    assert res.returncode == 0  # cli.py --help laeuft auch standalone


def test_devflow_sandbox_lifecycle(repo_root, run_cmd, tmp_path):
    worktree = tmp_path / "wt"
    worktree.mkdir()
    base = {"worktree": str(worktree)}

    create = _payload(tmp_path, "create.json", {
        **base, "action": "create", "ticket": "T901630",
        "branch": "feature/x", "plan": "tasks.md", "intel-snapshot": "s123",
    })
    res = run_cmd(
        f"PYTHONPATH=scripts python3 -m devflow sandbox < {create}",
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
    manifest_file = worktree / ".devflow" / "sandbox.json"
    assert manifest_file.is_file()
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    assert set(manifest) == {"ticket", "branch", "plan", "intel-snapshot"}

    activate = _payload(tmp_path, "activate.json", {**base, "action": "activate"})
    res = run_cmd(
        f"PYTHONPATH=scripts python3 -m devflow sandbox < {activate}",
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
    assert json.loads(res.stdout)["manifest"]["ticket"] == "T901630"

    destroy = _payload(tmp_path, "destroy.json", {**base, "action": "destroy"})
    res = run_cmd(
        f"PYTHONPATH=scripts python3 -m devflow sandbox < {destroy}",
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
    assert not manifest_file.exists()

    # Negativfall mit Positiv-Anker oben: activate nach destroy -> Exit 2.
    res = run_cmd(
        f"PYTHONPATH=scripts python3 -m devflow sandbox < {activate}",
        cwd=repo_root,
    )
    assert res.returncode == 2
    assert json.loads(res.stderr)["error"]["code"] == "devflow_env"


def test_devflow_sandbox_missing_fields_exit_2(repo_root, run_cmd, tmp_path):
    worktree = tmp_path / "wt"
    worktree.mkdir()
    bad = _payload(tmp_path, "bad.json", {})
    res = run_cmd(
        f"PYTHONPATH=scripts python3 -m devflow sandbox < {bad}",
        cwd=repo_root,
    )
    assert res.returncode == 2
    assert json.loads(res.stderr)["error"]["code"] == "devflow_env"

    # Positiv-Anker im selben Test: gueltiges create bleibt Exit 0.
    good = _payload(tmp_path, "good.json", {
        "worktree": str(worktree), "action": "create", "ticket": "T901630",
        "branch": "b", "plan": "p", "intel-snapshot": "i",
    })
    res = run_cmd(
        f"PYTHONPATH=scripts python3 -m devflow sandbox < {good}",
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output


def _write_stub(path, body):
    path.write_text(f"#!/bin/sh\n{body}\n", encoding="utf-8")
    path.chmod(0o755)


def test_devflow_turbolint_aggregates_stub_linters(repo_root, run_cmd, tmp_path):
    stubs = tmp_path / "bin"
    stubs.mkdir()
    _write_stub(stubs / "plan-lint.sh",
                "echo '{\"verdict\":\"FAIL\",\"hard\":[\"H1: stub finding\"],\"warn\":[]}'\nexit 1")
    _write_stub(stubs / "ruff", "exit 0")
    _write_stub(stubs / "tsc", "echo 'src/a.ts(1,1): error TS0000: stub'\nexit 1")
    plan = tmp_path / "tasks.md"
    plan.write_text("# dummy plan\n", encoding="utf-8")
    env = _env(repo_root, {
        "PATH": f"{stubs}{os.pathsep}{os.environ['PATH']}",
        "DEVFLOW_PLAN_LINT": "plan-lint.sh",
        "DEVFLOW_TSC_CMD": "tsc",
        "DEVFLOW_DIR": str(tmp_path / "devflow"),
    })
    res = run_cmd(
        ["python3", "scripts/devflow/turbolint.py", "--format", "json",
         "--plan", str(plan)],
        cwd=repo_root,
        env=env,
        timeout=120,
    )
    assert res.returncode == 1, res.output  # gemischt gruen/rot -> Hard-Fail
    report = json.loads(res.stdout)
    assert set(report) >= {"results", "summary"}
    by_name = {r["name"]: r for r in report["results"]}
    assert set(by_name) == {"plan-lint", "ruff", "tsc"}
    assert by_name["plan-lint"]["status"] == "fail"
    assert by_name["plan-lint"]["findings"] == ["H1: stub finding"]
    assert by_name["ruff"]["status"] == "ok"  # Positiv-Anker: gruen bleibt gruen
    assert by_name["tsc"]["status"] == "fail"
    assert any("TS0000" in f for f in by_name["tsc"]["findings"])
    assert report["summary"]["failed"] == 2
    assert report["summary"]["ok"] == 1


def test_devflow_instaci_list_and_unknown_job(repo_root, run_cmd):
    res = run_cmd(
        ["python3", "scripts/devflow/instaci.py", "--list"],
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
    assert set(res.stdout.split()) == EXPECTED_JOBS

    # Negativfall mit Positiv-Anker (--list oben): unbekannter Job -> Exit 2.
    res = run_cmd(
        ["python3", "scripts/devflow/instaci.py", "kein-job"],
        cwd=repo_root,
    )
    assert res.returncode == 2
    assert json.loads(res.stderr)["error"]["code"] == "devflow_env"


def test_devflow_ci_map_entries_name_runnable_commands(repo_root):
    instaci = _load_instaci(repo_root)
    text = (repo_root / "docs/code-quality/ci-map.yaml").read_text(encoding="utf-8")
    checks = instaci.parse_ci_map(text)
    assert set(checks) == EXPECTED_JOBS  # Positiv-Anker: Map ist nicht leer
    ci_text = (repo_root / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    for name, spec in checks.items():
        assert f"  {name}:" in ci_text  # Job-ID wortgleich aus ci.yml
        assert spec["timeout"] > 0
        command = spec["command"]
        assert command in ci_text  # Kommando wortgleich aus run:-Zeile
        if command.startswith("cd "):
            workdir, _, rest = command.partition("&&")
            target = workdir.replace("cd", "", 1).strip()
            assert (repo_root / target).is_dir(), name
            command = rest.strip()
        binary = shlex.split(command)[0]
        assert shutil.which(binary) or (repo_root / binary).exists(), name


def test_devflow_turbolint_ohne_plan_flag_verlangt_plan(repo_root, run_cmd, tmp_path):
    # T901749(A): DEFAULT_PLAN zeigt auf geloschten Pfad — ohne --plan und
    # ohne stdin-Plan verlangt turbolint explizit --plan (statt stale
    # "plan file missing"-Meldung auf toten Default).
    env = _env(repo_root, {"DEVFLOW_DIR": str(tmp_path / "devflow")})
    res = run_cmd(
        ["python3", "scripts/devflow/turbolint.py", "--format", "json"],
        cwd=repo_root,
        env=env,
        timeout=120,
    )
    assert res.returncode == 2, res.output
    assert "--plan is required" in res.output
