"""Native migration of tests/spec/agent-skills/worktree-mid-rebase-guard.bats."""

import os
import re

import pytest


class Fixture:
    """BATS-_make_fixture-Nachbau: Repo mit linked worktree, optional mitten im Rebase."""

    def __init__(self, run_cmd, repo_root, tmp_path):
        self.run_cmd = run_cmd
        self.repo = repo_root
        self.guard = repo_root / "scripts/worktree-git-op-guard.sh"
        self.base = tmp_path / "fixture"
        self.wt = tmp_path / "wt"

    def git(self, *args, check=False):
        r = self.run_cmd(["git", *args])
        if check:
            r.check()
        return r

    def build(self, mode="clean"):
        self.base.mkdir(parents=True)
        self.git("-C", str(self.base), "init", "-q", "-b", "main", ".", check=True)
        self.git("-C", str(self.base), "config", "user.email", "t@example.invalid", check=True)
        self.git("-C", str(self.base), "config", "user.name", "T", check=True)
        data = self.base / "components/website/src/data"
        data.mkdir(parents=True)
        (data / "test-inventory.json").write_text("base\n", encoding="utf-8")
        self.git("-C", str(self.base), "add", "-A", check=True)
        self.git("-C", str(self.base), "commit", "-qm", "base", check=True)
        self.git("-C", str(self.base), "branch", "feat", check=True)
        (data / "test-inventory.json").write_text("mainside\n", encoding="utf-8")
        self.git("-C", str(self.base), "commit", "-qam", "mainside", check=True)
        self.git("-C", str(self.base), "worktree", "add", "-q", str(self.wt), "feat", check=True)

        if mode != "--mid-rebase":
            return
        wt_file = self.wt / "components/website/src/data/test-inventory.json"
        wt_file.write_text("feat\n", encoding="utf-8")
        self.git("-C", str(self.wt), "commit", "-qam", "feat", check=True)
        # Plain, nicht-interaktiver Rebase (Merge-Backend).
        self.git("-C", str(self.wt), "rebase", "main")
        # Konflikt aufloesen und stagen, dann NICHT --continue: die Unterbrechung.
        wt_file.write_text("resolved\n", encoding="utf-8")
        self.git("-C", str(self.wt), "add", "components/website/src/data/test-inventory.json", check=True)

    def rebase_dir(self):
        return self.git("-C", str(self.wt), "rev-parse", "--git-path", "rebase-merge").stdout.strip()

    def run_guard(self, *args):
        return self.run_cmd(["bash", str(self.guard), *args])


@pytest.fixture
def fx(run_cmd, repo_root, tmp_path):
    return Fixture(run_cmd, repo_root, tmp_path)


def _awk_range(lines, start_re, end_re):
    """awk '/start/,/end/': Bereich inkl. Start- und Endzeile (Ende ab Folgezeile geprueft)."""
    out = []
    active = False
    for line in lines:
        if not active:
            if re.search(start_re, line):
                active = True
                out.append(line)
            continue
        out.append(line)
        if re.search(end_re, line):
            active = False
    return out


def test_positiv_anker_der_guard_laeuft_und_meldet_ein_fixture_ohne_unterbrochene_operation_mit_exit_0(fx):
    fx.build()
    r = fx.run_guard(str(fx.base))
    assert r.returncode == 0, r.output


def test_befund_ein_worktree_mitten_im_rebase_fuehrt_zu_exit_ungleich_0_und_wird_im_output_benannt(fx):
    fx.build("--mid-rebase")
    r = fx.run_guard(str(fx.base))
    assert r.returncode != 0
    # Semantik statt Darstellung (T002716): geprueft wird nur, dass der Worktree genannt wird.
    assert str(fx.wt) in r.output


def test_der_guard_repariert_nicht_das_rebase_zustandsverzeichnis_besteht_nach_dem_lauf_fort(fx):
    fx.build("--mid-rebase")
    state = fx.rebase_dir()
    assert os.path.isdir(state)
    r = fx.run_guard(str(fx.base))
    # Positiv-Anker: ein nicht ausgefuehrtes Skript (127) repariert trivial nichts.
    assert r.returncode != 127
    assert os.path.isdir(state)


def test_reproduktion_des_befunds_der_allowlist_gefilterte_porcelain_vorcheck_haelt_den_kaputten_worktree_fuer_sauber(
    fx, run_cmd
):
    fx.build("--mid-rebase")
    # Genau der Ausdruck aus repo-hygiene-ops.md Abschnitt 1 (cut -c4- + zwei grep -Ev).
    status = fx.git("-C", str(fx.wt), "status", "--porcelain").stdout.splitlines()
    filtered = [line[3:] for line in status]
    filtered = [
        line for line in filtered
        if not re.search(r"^(.agents/plans/|docs/code-quality/|components/website/src/data/)", line)
    ]
    filtered = [
        line for line in filtered
        if not re.search(
            r"^(\.release-please-manifest\.json|components/website/CHANGELOG\.md|components/website/package\.json)$",
            line,
        )
    ]
    # Leer heisst nach dem Runbook "sauber", obwohl der Worktree mitten im Rebase steht.
    assert filtered == []
    # Positiv-Anker: der Zustand, den der Vorcheck uebersieht, ist real vorhanden.
    assert os.path.isdir(fx.rebase_dir())


def test_repo_hygiene_ops_md_ruft_den_guard_vor_dem_allowlist_gefilterten_vorcheck_auf(repo_root):
    ops = repo_root / ".claude/skills/references/repo-hygiene-ops.md"
    assert ops.is_file()
    lines = ops.read_text(encoding="utf-8").splitlines()
    section_lines = _awk_range(lines, r"^## 1\. Stale Git Worktrees", r"^## 2\.")
    section = "\n".join(section_lines)
    # Positiv-Anker: der Abschnitt und sein Vorcheck existieren weiterhin.
    assert "git worktree remove" in section
    assert "worktree-git-op-guard.sh" in section
    guard_line = next((i for i, l in enumerate(section_lines, 1) if "worktree-git-op-guard.sh" in l), None)
    porcelain_line = next((i for i, l in enumerate(section_lines, 1) if "status --porcelain | cut -c4-" in l), None)
    assert guard_line is not None
    assert porcelain_line is not None
    assert guard_line < porcelain_line
