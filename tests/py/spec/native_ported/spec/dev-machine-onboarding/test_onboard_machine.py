"""Native migration of tests/spec/dev-machine-onboarding/onboard-machine.bats."""

import os
import shutil
import stat
import subprocess
import time
from pathlib import Path

import pytest


def _stub(stubs: Path, name: str, body: str):
    p = stubs / name
    p.write_text("#!/usr/bin/env bash\n" + body + "\n")
    p.chmod(p.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _snapshot(roots):
    """find <roots> -printf '%p %T@\\n' | sort (Pfad + mtime)."""
    rows = []
    for root in roots:
        if not root.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            for name in dirnames + filenames:
                p = Path(dirpath) / name
                rows.append(f"{p} {p.lstat().st_mtime_ns}")
            rows.append(f"{dirpath} {Path(dirpath).lstat().st_mtime_ns}")
    return sorted(set(rows))


@pytest.fixture
def ob(repo_root, tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    (home / ".config/git-crypt").mkdir(parents=True)
    key = home / ".config/git-crypt/bachelorprojekt.key"
    key.write_bytes(b"k")
    key.chmod(0o600)
    clone = home / "Bachelorprojekt"

    origin = tmp_path / "origin"
    (origin / "scripts").mkdir(parents=True)
    (origin / "environments/.secrets").mkdir(parents=True)
    (origin / ".githooks").mkdir(parents=True)
    shutil.copy(repo_root / "scripts/git-crypt-guard.sh", origin / "scripts/")
    shutil.copy(repo_root / "scripts/check-hooks-path.sh", origin / "scripts/")
    (origin / ".githooks/pre-commit").write_text("#!/bin/sh\nexit 0\n")
    (origin / "environments/.secrets/dev.yaml").write_bytes(b"\x00GITCRYPT\x00ciphertext")
    env = dict(os.environ, HOME=str(home), GIT_CONFIG_NOSYSTEM="1")
    subprocess.run(["git", "-C", str(origin), "init", "-q", "-b", "main"], check=True, env=env)
    subprocess.run(["git", "-C", str(origin), "add", "-A"], check=True, env=env)
    subprocess.run(["git", "-C", str(origin), "-c", "user.name=t", "-c", "user.email=t@example.invalid",
                    "commit", "-q", "-m", "init"], check=True, env=env)

    stubs = tmp_path / "stubs"
    stubs.mkdir()
    _stub(stubs, "wslinfo", "echo mirrored")
    _stub(stubs, "gh", "exit 0")
    _stub(stubs, "git-crypt", "exit 0")
    _stub(stubs, "sudo", 'echo "sudo $*" >> "$HOME/sudo.log"; exit 0')
    _stub(stubs, "task",
          'if [ "$1" = "-d" ]; then cd "$2" || exit 1; shift 2; fi\n'
          'case "$1" in secrets:install-hooks) git config core.hooksPath .githooks && git config merge.ours.driver true ;; esac')
    for t in ("node", "pnpm", "kubectl"):
        _stub(stubs, t, "exit 0")

    return {
        "repo": repo_root,
        "script": repo_root / "scripts/devmesh/onboard-machine.sh",
        "home": home,
        "key": key,
        "clone": clone,
        "origin": origin,
        "stubs": stubs,
        "env": {
            "HOME": str(home),
            "GIT_CONFIG_NOSYSTEM": "1",
            "PATH": f"{stubs}{os.pathsep}{os.environ.get('PATH', '')}",
        },
    }


def _run(run_cmd, o, *args, extra_env=None):
    env = dict(o["env"])
    if extra_env:
        env.update(extra_env)
    return run_cmd(["bash", str(o["script"]), *args], cwd=o["repo"], env=env)


def _snap(o):
    return _snapshot([o["clone"], o["home"] / ".config/git-crypt"])


def test_onboard_fehlende_keydatei_endet_mit_exit_2_und_nennt_die_datei(run_cmd, ob):
    missing = ob["home"] / "fehlt.key"
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]), "--key-file", str(missing))
    assert res.returncode == 2
    assert str(missing) in res.output


def test_onboard_keydatei_mit_modus_644_wird_auf_600_gesetzt_und_die_korrektur_gemeldet(run_cmd, ob):
    ob["key"].chmod(0o644)
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]), "--name", "t", "--email", "t@example.invalid")
    assert stat.S_IMODE(ob["key"].stat().st_mode) == 0o600
    assert any("key-mode" in ln and "644" in ln for ln in res.output.splitlines())


def test_onboard_keydatei_eines_fremden_benutzers_endet_mit_exit_1_ohne_aenderung(run_cmd, ob):
    ob["key"].chmod(0o644)
    id_bin = shutil.which("id")
    _stub(ob["stubs"], "id", '[ "$1" = "-u" ] && { echo 4242; exit 0; }\nexec ' + id_bin + ' "$@"')
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]))
    assert res.returncode == 1
    assert "key-owner" in res.output
    assert stat.S_IMODE(ob["key"].stat().st_mode) == 0o644


def test_onboard_unlock_ohne_wirkung_endet_mit_exit_1_und_nennt_nur_die_pruefung_decryption(run_cmd, ob):
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]), "--name", "t", "--email", "t@example.invalid")
    assert res.returncode == 1
    assert (ob["clone"] / ".git").is_dir()
    fails = [ln for ln in res.output.splitlines() if "FAIL " in ln]
    assert len(fails) == 1
    assert any("decryption" in ln for ln in fails)


def test_onboard_verify_auf_onboardeter_maschine_endet_mit_0_und_aendert_keine_mtime(run_cmd, ob):
    _stub(ob["stubs"], "git-crypt", 'printf "plain: true\\n" > environments/.secrets/dev.yaml')
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]), "--name", "t", "--email", "t@example.invalid")
    assert res.returncode == 0
    assert (ob["clone"] / ".git").is_dir()
    before = _snap(ob)
    time.sleep(1)
    res = _run(run_cmd, ob, "--verify", "--repo-url", str(ob["origin"]), "--name", "t", "--email", "t@example.invalid")
    assert res.returncode == 0
    assert _snap(ob) == before


def test_onboard_wiederholter_lauf_auf_onboardeter_maschine_aendert_nichts(run_cmd, ob):
    _stub(ob["stubs"], "git-crypt", 'printf "plain: true\\n" > environments/.secrets/dev.yaml')
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]), "--name", "t", "--email", "t@example.invalid")
    assert res.returncode == 0
    assert (ob["clone"] / ".git").is_dir()
    before = _snap(ob)
    time.sleep(1)
    res = _run(run_cmd, ob, "--repo-url", str(ob["origin"]), "--name", "t", "--email", "t@example.invalid")
    assert res.returncode == 0
    assert _snap(ob) == before
    assert not (ob["home"] / "sudo.log").exists()
