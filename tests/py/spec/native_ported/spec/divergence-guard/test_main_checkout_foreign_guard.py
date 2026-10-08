"""Native migration of tests/spec/divergence-guard/main-checkout-foreign-guard.bats."""

import os
import shutil
import subprocess
import time

import pytest


@pytest.fixture
def foreign(repo_root):
    """Tracks a simulated foreign 'claude' process; teardown() kills it."""
    holder = {"proc": None}
    yield holder, repo_root
    proc = holder["proc"]
    if proc is not None and proc.poll() is None:
        proc.kill()
        proc.wait()


def _spawn_foreign(holder, cwd):
    """`( cd cwd && exec -a claude sleep 30 ) &` and wait until cwd is visible in /proc."""
    proc = subprocess.Popen(["bash", "-c", "exec -a claude sleep 30"], cwd=str(cwd))
    holder["proc"] = proc
    for _ in range(10):
        try:
            if os.readlink(f"/proc/{proc.pid}/cwd") == str(cwd):
                break
        except OSError:
            pass
        time.sleep(0.1)
    return proc


def _init_repo(path, dirty=False):
    path.mkdir(parents=True)
    for args in (["init", "-q"], ["config", "user.email", "t@example.invalid"], ["config", "user.name", "Test"]):
        subprocess.run(["git", "-C", str(path), *args], check=True)
    (path / "f.txt").write_text("x\n")
    subprocess.run(["git", "-C", str(path), "add", "f.txt"], check=True)
    subprocess.run(["git", "-C", str(path), "commit", "-qm", "base"], check=True)
    if dirty:
        with open(path / "f.txt", "a") as fh:
            fh.write("uncommitted change\n")
    return path


def _detected(run_cmd, lib, d):
    return run_cmd(["bash", "-c", f"source '{lib}'; mc_foreign_activity_detected '{d}'"])


def test_mc_foreign_activity_detected_positiver_anker_sauberer_fremdprozessfreier_checkout_meldet_false(run_cmd, foreign, tmp_path):
    _, root = foreign
    d = _init_repo(tmp_path / "clean-repo")
    r = _detected(run_cmd, root / "scripts/lib/main-checkout-foreign-guard.sh", d)
    assert r.returncode != 0


def test_mc_foreign_activity_detected_dirty_checkout_mit_fremdem_claude_prozess_cwd_match_meldet_true(run_cmd, foreign, tmp_path):
    holder, root = foreign
    d = _init_repo(tmp_path / "dirty-repo", dirty=True)
    _spawn_foreign(holder, d)
    r = _detected(run_cmd, root / "scripts/lib/main-checkout-foreign-guard.sh", d)
    assert r.returncode == 0


def test_mc_foreign_activity_detected_dirty_checkout_ohne_fremden_prozess_meldet_false_regressionsschutz(run_cmd, foreign, tmp_path):
    _, root = foreign
    d = _init_repo(tmp_path / "dirty-alone-repo", dirty=True)
    r = _detected(run_cmd, root / "scripts/lib/main-checkout-foreign-guard.sh", d)
    assert r.returncode != 0


def test_mc_foreign_activity_detected_erkennt_den_fremdprozess_auch_bei_gepolsterter_ps_spalte_t003078(run_cmd, foreign, tmp_path, monkeypatch):
    holder, root = foreign
    d = _init_repo(tmp_path / "padded-repo", dirty=True)

    # ps stub: pads only the `-eo pid=` form and delegates everything else to the real ps.
    real_ps = shutil.which("ps")
    assert real_ps, "ps nicht verfuegbar"
    stub_dir = tmp_path / "stub-bin"
    stub_dir.mkdir()
    stub = stub_dir / "ps"
    stub.write_text(
        "#!/usr/bin/env bash\n"
        'if [ "$1" = "-eo" ] && [ "$2" = "pid=" ]; then\n'
        f"  \"{real_ps}\" -eo pid= | awk '{{printf \"%12s\\n\", $1}}'\n"
        "  exit 0\n"
        "fi\n"
        f'exec "{real_ps}" "$@"\n'
    )
    stub.chmod(0o755)
    monkeypatch.setenv("PATH", f"{stub_dir}:" + os.environ["PATH"])

    # Anchor 1: the stub is really active.
    r = run_cmd(["bash", "-c", "ps -eo pid= | head -1"])
    assert r.returncode == 0
    assert r.stdout.startswith(" " * 9)

    _spawn_foreign(holder, d)
    # Anchor 2: the actual assertion, detection despite padding.
    r = _detected(run_cmd, root / "scripts/lib/main-checkout-foreign-guard.sh", d)
    assert r.returncode == 0


def test_worktree_create_sh_haupt_checkout_bleibt_unveraendert_wenn_dirty_und_fremder_claude_prozess_dort_aktiv_ist(run_cmd, foreign, tmp_path, monkeypatch):
    holder, root = foreign
    origin = tmp_path / "origin.git"
    clone = tmp_path / "clone"
    subprocess.run(["git", "init", "-q", "--bare", "-b", "main", str(origin)], check=True)
    subprocess.run(["git", "clone", "-q", str(origin), str(clone)], check=True)
    for args in (["config", "user.email", "t@example.invalid"], ["config", "user.name", "Test"],
                 ["config", "commit.gpgsign", "false"]):
        subprocess.run(["git", "-C", str(clone), *args], check=True)
    (clone / "shared.txt").write_text("zeile-eins\n")
    subprocess.run(["git", "-C", str(clone), "add", "shared.txt"], check=True)
    subprocess.run(["git", "-C", str(clone), "commit", "-qm", "base"], check=True)
    subprocess.run(["git", "-C", str(clone), "branch", "-M", "main"], check=True)
    subprocess.run(["git", "-C", str(clone), "push", "-q", "origin", "main"], check=True)

    # origin gets one more commit, so local main in CLONE falls behind.
    upstream = tmp_path / "upstream"
    subprocess.run(["git", "clone", "-q", "-b", "main", str(origin), str(upstream)], check=True)
    for args in (["config", "user.email", "t@example.invalid"], ["config", "user.name", "Test"],
                 ["config", "commit.gpgsign", "false"]):
        subprocess.run(["git", "-C", str(upstream), *args], check=True)
    with open(upstream / "shared.txt", "a") as fh:
        fh.write("zeile-zwei\n")
    subprocess.run(["git", "-C", str(upstream), "commit", "-qam", "remote-commit"], check=True)
    subprocess.run(["git", "-C", str(upstream), "push", "-q", "origin", "main"], check=True)
    subprocess.run(["git", "-C", str(clone), "fetch", "-q", "origin"], check=True)

    # Dirty main checkout.
    with open(clone / "shared.txt", "a") as fh:
        fh.write("uncommittete-lokale-aenderung\n")
    dirty_before = subprocess.run(["git", "-C", str(clone), "status", "--porcelain"],
                                  capture_output=True, text=True, check=True).stdout
    content_before = (clone / "shared.txt").read_text()

    _spawn_foreign(holder, clone)

    wt = tmp_path / "wt-probe"
    script = root / "scripts" / "worktree-create.sh"
    r = run_cmd(["bash", "-c", f"cd '{clone}' && bash '{script}' fix/probe-T009999 '{wt}'"],
                env={"WT_SKIP_NAME_CHECK": "1"})
    assert r.returncode == 0
    assert "ready on" in r.output

    dirty_after = subprocess.run(["git", "-C", str(clone), "status", "--porcelain"],
                                 capture_output=True, text=True, check=True).stdout
    assert dirty_after == dirty_before
    assert (clone / "shared.txt").read_text() == content_before
    stash = run_cmd(["git", "-C", str(clone), "stash", "list"])
    assert stash.output == ""
