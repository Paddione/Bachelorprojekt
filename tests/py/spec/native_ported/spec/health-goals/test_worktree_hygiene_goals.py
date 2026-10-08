"""Native migration of tests/spec/health-goals/worktree-hygiene-goals.bats."""

import json
import os
import re
import subprocess
import time

import pytest


class Hygiene:
    """Python counterpart of the BATS fixture helpers (mk_repo, mk_lock, dead_pid)."""

    def __init__(self, fix, repo_root, run_cmd, monkeypatch):
        self.FIX = fix
        self.measure_sh = repo_root / "scripts" / "lib" / "wt-hygiene-measure.sh"
        self.run_cmd = run_cmd
        self.mp = monkeypatch
        self.R = None

    def measure(self, sub):
        return self.run_cmd(["bash", str(self.measure_sh), sub])

    def git(self, *args, cwd=None):
        target = ["-C", str(cwd or self.R)]
        return subprocess.run(
            ["git", *target, *args], check=True, capture_output=True, text=True
        )

    def mk_repo(self):
        self.R = self.FIX / "repo"
        self.R.mkdir(parents=True, exist_ok=True)
        self.git("init", "-q", "-b", "main")
        self.git("config", "user.email", "t@example.invalid")
        self.git("config", "user.name", "t")
        (self.R / "seed.txt").write_text("seed\n", encoding="utf-8")
        self.git("add", "seed.txt")
        self.git("commit", "-qm", "init")
        self.git("update-ref", "refs/remotes/origin/main", "HEAD")
        (self.R / ".git" / "FETCH_HEAD").touch()
        self.mp.setenv("HG_REPO_ROOT", str(self.R))
        self.mp.setenv("AGENT_LOCK_DIR", str(self.FIX / "locks"))

    def lock_dir(self):
        return self.FIX / "locks"

    def mk_lock(self, name, scope, pid, age, wt=None):
        worktree = wt if wt is not None else str(self.FIX / "kein-worktree")
        ts = str(int(time.time()) - age)
        self.lock_dir().mkdir(parents=True, exist_ok=True)
        payload = {
            "scope": scope,
            "id": name,
            "owner_sid": f"sid-{name}",
            "owner_pid": str(pid),
            "tool": "claude",
            "label": "test",
            "worktree": worktree,
            "branch": "main",
            "ticket": "",
            "host": "testhost",
            "created_at": ts,
            "heartbeat_at": ts,
        }
        (self.lock_dir() / f"{name}.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def rm_locks(self):
        for path in self.lock_dir().glob("*.json"):
            path.unlink()

    @staticmethod
    def dead_pid():
        proc = subprocess.Popen(["true"])
        proc.wait()
        return proc.pid


@pytest.fixture
def hy(tmp_path, repo_root, run_cmd, monkeypatch):
    monkeypatch.setenv("AGENT_LOCK_TTL", "1800")
    monkeypatch.delenv("CI", raising=False)
    return Hygiene(tmp_path, repo_root, run_cmd, monkeypatch)


def _num(output):
    return re.fullmatch(r"[0-9]+", output) is not None


# ── G-WT01 ──────────────────────────────────────────────────────────────────

def test_g_wt01_ohne_aufloesbaren_hauptcheckout_meldet_main_checkout_n_a_nicht_0(hy, monkeypatch):
    hy.mk_repo()
    result = hy.measure("main-checkout")
    assert result.returncode == 0
    assert result.output == "0"

    kein_repo = hy.FIX / "kein-repo"
    kein_repo.mkdir()
    monkeypatch.setenv("HG_REPO_ROOT", str(kein_repo))
    result = hy.measure("main-checkout")
    assert result.returncode == 0
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_wt01_main_checkout_zaehlt_fremden_branch_und_dirty_tree_als_verletzung(hy):
    hy.mk_repo()
    assert hy.measure("main-checkout").output == "0"

    hy.git("checkout", "-q", "-b", "chore/abweichung")
    assert hy.measure("main-checkout").output == "1"

    hy.git("checkout", "-q", "main")
    (hy.R / "dirty.txt").write_text("dirty\n", encoding="utf-8")
    assert hy.measure("main-checkout").output == "1"


# ── G-WT02 ──────────────────────────────────────────────────────────────────

def test_g_wt02_ohne_registrierten_worktree_meldet_stale_worktrees_n_a_nicht_0(hy):
    hy.mk_repo()
    hy.git("worktree", "add", "-q", "-b", "wt-anker", str(hy.FIX / "wt-anker"))
    result = hy.measure("stale-worktrees")
    assert result.returncode == 0
    assert _num(result.output)

    hy.git("worktree", "remove", "--force", str(hy.FIX / "wt-anker"))
    result = hy.measure("stale-worktrees")
    assert result.returncode == 0
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_wt02_stale_worktrees_zaehlt_gemergten_worktree_nicht_den_aktiven_nachbarn(hy):
    hy.mk_repo()
    hy.git("worktree", "add", "-q", "-b", "wt-merged", str(hy.FIX / "wt-merged"))
    active = hy.FIX / "wt-active"
    hy.git("worktree", "add", "-q", "-b", "wt-active", str(active))
    (active / "neu.txt").write_text("neu\n", encoding="utf-8")
    hy.git("add", "neu.txt", cwd=active)
    hy.git("commit", "-qm", "aktive arbeit", cwd=active)

    result = hy.measure("stale-worktrees")
    assert result.returncode == 0
    assert result.output == "1"


# ── G-WT03 ──────────────────────────────────────────────────────────────────

def test_g_wt03_ohne_lock_datei_meldet_orphan_locks_n_a_nicht_0(hy):
    hy.mk_repo()
    hy.mk_lock("ticket__T000001", "ticket", os.getpid(), 10)
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert _num(result.output)

    hy.rm_locks()
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_wt03_orphan_locks_zaehlt_toten_lock_nicht_den_lebenden_nachbarn(hy):
    hy.mk_repo()
    hy.mk_lock("ticket__T000dead", "ticket", hy.dead_pid(), 60)
    hy.mk_lock("ticket__T000live", "ticket", os.getpid(), 10)
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert result.output == "1"


def test_g_wt03_vorfall_t002570_toter_pid_mit_nie_fortgeschriebenem_heartbeat_bei_existierendem_worktree_wird_gezaehlt(hy):
    hy.mk_repo()
    dead = hy.dead_pid()
    hy.mk_lock("ticket__T002570live", "ticket", os.getpid(), 10)
    assert hy.measure("orphan-locks").output == "0"

    hy.mk_lock("ticket__T002570", "ticket", dead, 7200, os.environ["HG_REPO_ROOT"])
    assert hy.R.is_dir()
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert result.output == "1"


def test_g_wt03_staerkster_anker_der_lock_der_laufenden_session_gilt_als_lebendig_obwohl_seine_owner_pid_tot_ist(hy):
    hy.mk_repo()
    dead = hy.dead_pid()
    hy.mk_lock("ticket__T000weg", "ticket", dead, 60)
    assert hy.measure("orphan-locks").output == "1"

    hy.mk_lock("ticket__T002443", "ticket", dead, 300, os.environ["HG_REPO_ROOT"])
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert result.output == "1"


def test_g_wt03_gegenprobe_lock_mit_lebender_owner_pid_und_frischem_heartbeat_wird_nicht_gezaehlt(hy):
    hy.mk_repo()
    hy.mk_lock("ticket__T000tot", "ticket", hy.dead_pid(), 60)
    assert hy.measure("orphan-locks").output == "1"

    hy.mk_lock("ticket__T002443", "ticket", os.getpid(), 10)
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert result.output == "1"


def test_g_wt03_abgelaufener_heartbeat_wird_auch_ohne_tote_pid_gezaehlt(hy):
    hy.mk_repo()
    hy.mk_lock("ticket__T000fresh", "ticket", os.getpid(), 10)
    assert hy.measure("orphan-locks").output == "0"

    hy.mk_lock("ticket__T000stale", "ticket", os.getpid(), 7200)
    result = hy.measure("orphan-locks")
    assert result.returncode == 0
    assert result.output == "1"


# ── G-WT04 ──────────────────────────────────────────────────────────────────

def test_g_wt04_ohne_registrierten_worktree_meldet_unsafe_worktrees_n_a_nicht_0(hy):
    hy.mk_repo()
    hy.git("worktree", "add", "-q", "-b", "wt-anker4", str(hy.FIX / "wt-anker4"))
    result = hy.measure("unsafe-worktrees")
    assert result.returncode == 0
    assert _num(result.output)

    hy.git("worktree", "remove", "--force", str(hy.FIX / "wt-anker4"))
    result = hy.measure("unsafe-worktrees")
    assert result.returncode == 0
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_wt04_unsafe_worktrees_zaehlt_nur_die_schnittmenge_aus_loeschbereit_und_dirty(hy):
    hy.mk_repo()
    gefahr = hy.FIX / "wt-gefahr"
    hy.git("worktree", "add", "-q", "-b", "wt-gefahr", str(gefahr))
    (gefahr / "ungesichert.txt").write_text("ungesichert\n", encoding="utf-8")

    hy.git("worktree", "add", "-q", "-b", "wt-sauber", str(hy.FIX / "wt-sauber"))

    aktiv = hy.FIX / "wt-aktiv"
    hy.git("worktree", "add", "-q", "-b", "wt-aktiv", str(aktiv))
    (aktiv / "neu.txt").write_text("neu\n", encoding="utf-8")
    hy.git("add", "neu.txt", cwd=aktiv)
    hy.git("commit", "-qm", "aktive arbeit", cwd=aktiv)
    (aktiv / "dirty.txt").write_text("auch-dirty\n", encoding="utf-8")

    result = hy.measure("unsafe-worktrees")
    assert result.returncode == 0
    assert result.output == "1"


# ── G-WT05 ──────────────────────────────────────────────────────────────────

def test_g_wt05_ohne_origin_main_referenz_meldet_main_divergence_n_a_nicht_0(hy):
    hy.mk_repo()
    result = hy.measure("main-divergence")
    assert result.returncode == 0
    assert result.output == "0"

    hy.git("update-ref", "-d", "refs/remotes/origin/main")
    result = hy.measure("main-divergence")
    assert result.returncode == 0
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_wt05_main_divergence_zaehlt_commits_in_main_origin_main(hy):
    hy.mk_repo()
    assert hy.measure("main-divergence").output == "0"

    hy.git("checkout", "-q", "-b", "tmp-remote")
    for name in ("a", "b"):
        (hy.R / f"{name}.txt").write_text(f"{name}\n", encoding="utf-8")
        hy.git("add", f"{name}.txt")
        hy.git("commit", "-qm", name)
    hy.git("update-ref", "refs/remotes/origin/main", "HEAD")
    hy.git("checkout", "-q", "main")

    result = hy.measure("main-divergence")
    assert result.returncode == 0
    assert result.output == "2"


# ── G-WT06 ──────────────────────────────────────────────────────────────────

def test_g_wt06_ohne_lock_datei_meldet_phantom_scope_locks_n_a_nicht_0(hy):
    hy.mk_repo()
    hy.mk_lock("ticket__T000002", "ticket", os.getpid(), 10)
    result = hy.measure("phantom-scope-locks")
    assert result.returncode == 0
    assert _num(result.output)

    hy.rm_locks()
    result = hy.measure("phantom-scope-locks")
    assert result.returncode == 0
    assert result.output == "n/a"
    assert result.output != "0"


def test_g_wt06_phantom_scope_locks_zaehlt_flag_als_scope_neben_gueltigem_ticket_scope(hy):
    hy.mk_repo()
    hy.mk_lock("ticket__T000gut", "ticket", os.getpid(), 10)
    hy.mk_lock("phantom__flag", "--label", os.getpid(), 10)
    result = hy.measure("phantom-scope-locks")
    assert result.returncode == 0
    assert result.output == "1"


def test_g_wt06_leerer_scope_zaehlt_wohlgeformter_scope_nicht(hy):
    hy.mk_repo()
    hy.mk_lock("branch__ok", "branch", os.getpid(), 10)
    assert hy.measure("phantom-scope-locks").output == "0"

    hy.mk_lock("phantom__leer", "", os.getpid(), 10)
    result = hy.measure("phantom-scope-locks")
    assert result.returncode == 0
    assert result.output == "1"


# ── Querschnitt ──────────────────────────────────────────────────────────────

def test_wt_hygiene_measure_unbekanntes_subkommando_bricht_ab_statt_n_a_zu_melden(hy):
    hy.mk_repo()
    result = hy.measure("main-checkout")
    assert result.returncode == 0

    result = hy.measure("gibt-es-nicht")
    assert result.returncode != 0
    assert result.output != "n/a"
