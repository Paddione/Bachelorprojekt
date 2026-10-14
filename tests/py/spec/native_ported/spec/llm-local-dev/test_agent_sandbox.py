"""Sandbox fuer unbeaufsichtigte Coding-Agenten (scripts/lib/agent-sandbox.sh).

Pruefmodus: Ausfuehrung. Jeder Test ruft agent_sandbox_run bzw.
agent_sandbox_check wirklich auf und prueft, was der Befehl in der Sandbox
sehen und veraendern konnte. Die Isolationstests brauchen ein lauffaehiges
bwrap; ohne bwrap pruefen die Abbruch-Tests, dass kein Agent startet.
"""
import shutil
import subprocess
from pathlib import Path

import pytest

HELPER = "scripts/lib/agent-sandbox.sh"


def _bwrap_works() -> bool:
    if not shutil.which("bwrap"):
        return False
    r = subprocess.run(
        ["bwrap", "--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "true"],
        capture_output=True,
    )
    return r.returncode == 0


needs_bwrap = pytest.mark.skipif(not _bwrap_works(), reason="bwrap fehlt oder darf keine Namespaces anlegen")


@pytest.fixture
def box(tmp_path):
    """Git-Repo mit Worktree, ein HOME mit Fake-Secret und ein Pfad ausserhalb."""
    home = tmp_path / "home"
    (home / ".ssh").mkdir(parents=True)
    (home / ".ssh" / "id").write_text("topsecret\n")
    repo = tmp_path / "repo"
    subprocess.run(["git", "init", "-q", str(repo)], check=True)
    subprocess.run(["git", "-C", str(repo), "-c", "user.name=t", "-c", "user.email=t@t",
                    "commit", "-q", "--allow-empty", "-m", "init"], check=True)
    wt = tmp_path / "wt"
    subprocess.run(["git", "-C", str(repo), "worktree", "add", "-q", "--detach", str(wt)], check=True)
    outside = tmp_path / "outside"
    outside.mkdir()
    return {"home": home, "wt": wt, "outside": outside}


def _run(run_cmd, repo_root, call, env):
    script = f'. "{repo_root / HELPER}"; {call}'
    return run_cmd(["bash", "-c", script], cwd=repo_root, env=env, timeout=60)


def _env(box, **extra):
    import os
    return {**os.environ, "HOME": str(box["home"]), **extra}


@needs_bwrap
def test_agent_writes_only_inside_its_worktree(run_cmd, repo_root, box):
    inner = f'echo ok > inside.txt; echo leak > "{box["outside"]}/f" 2>/dev/null; true'
    r = _run(run_cmd, repo_root, f'agent_sandbox_run "{box["wt"]}" -- bash -c \'{inner}\'', _env(box))
    assert r.returncode == 0, r.output
    assert (box["wt"] / "inside.txt").read_text() == "ok\n"
    assert not (box["outside"] / "f").exists()


@needs_bwrap
def test_operator_home_and_env_secrets_are_invisible(run_cmd, repo_root, box):
    inner = 'cat "$HOME/.ssh/id" 2>/dev/null || echo NO-SSH; echo "token=${SECRET_TOKEN:-unset}"; echo "pi=${PI_OFFLINE:-unset}"'
    r = _run(run_cmd, repo_root,
             f'PI_OFFLINE=1 agent_sandbox_run "{box["wt"]}" --env PI_OFFLINE -- bash -c \'{inner}\'',
             _env(box, SECRET_TOKEN="abc123"))
    assert r.returncode == 0, r.output
    assert "topsecret" not in r.stdout and "NO-SSH" in r.stdout
    assert "token=unset" in r.stdout
    # Positiv-Anker: ausdruecklich durchgereichte Variablen kommen an.
    assert "pi=1" in r.stdout


@needs_bwrap
def test_git_works_in_the_sandboxed_worktree(run_cmd, repo_root, box):
    r = _run(run_cmd, repo_root,
             f'agent_sandbox_run "{box["wt"]}" -- bash -c \'echo x > new.txt; git status --porcelain\'', _env(box))
    assert r.returncode == 0, r.output
    assert "?? new.txt" in r.stdout


@needs_bwrap
def test_timeout_limits_the_agent(run_cmd, repo_root, box):
    r = _run(run_cmd, repo_root, f'agent_sandbox_run "{box["wt"]}" --timeout 1 -- sleep 30', _env(box))
    assert r.returncode == 124, r.output


def test_missing_bwrap_refuses_to_start_the_agent(run_cmd, repo_root, box, tmp_path):
    fakebin = tmp_path / "fakebin"
    fakebin.mkdir()
    (fakebin / "bwrap").write_text("#!/bin/sh\nexit 1\n")
    (fakebin / "bwrap").chmod(0o755)
    env = _env(box, PATH=f"{fakebin}:/usr/bin:/bin")
    marker = box["wt"] / "ran"
    r = _run(run_cmd, repo_root, f'agent_sandbox_run "{box["wt"]}" -- touch "{marker}"', env)
    assert r.returncode == 3, r.output
    assert "bwrap" in r.stderr
    assert not marker.exists()


def test_explicit_opt_out_runs_unsandboxed_with_a_warning(run_cmd, repo_root, box, tmp_path):
    fakebin = tmp_path / "fakebin"
    fakebin.mkdir()
    (fakebin / "bwrap").write_text("#!/bin/sh\nexit 1\n")
    (fakebin / "bwrap").chmod(0o755)
    env = _env(box, PATH=f"{fakebin}:/usr/bin:/bin", AGENT_SANDBOX="off")
    r = _run(run_cmd, repo_root, f'agent_sandbox_run "{box["wt"]}" -- touch ran', env)
    assert r.returncode == 0, r.output
    assert "AGENT_SANDBOX=off" in r.stderr
    assert (box["wt"] / "ran").exists()


def test_pi_swarm_aborts_before_any_agent_without_bwrap(run_cmd, repo_root, tmp_path):
    fakebin = tmp_path / "fakebin"
    fakebin.mkdir()
    for name, body in {"bwrap": "exit 1", "pi": "touch \"$PI_MARKER\"; exit 0"}.items():
        (fakebin / name).write_text(f"#!/bin/sh\n{body}\n")
        (fakebin / name).chmod(0o755)
    import os
    marker = tmp_path / "pi-ran"
    env = {**os.environ, "PATH": f"{fakebin}:{os.environ['PATH']}", "PI_MARKER": str(marker)}
    r = run_cmd(["bash", "scripts/llm/pi-swarm.sh", "--n", "1", "--out", str(tmp_path / "out")],
                cwd=repo_root, env=env, timeout=60)
    assert r.returncode == 3, r.output
    assert "bwrap" in r.stderr
    assert not marker.exists()
