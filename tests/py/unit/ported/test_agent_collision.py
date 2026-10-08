"""Native migration of tests/unit/agent-collision.bats."""
import json
import os
from pathlib import Path

import pytest


class Fixture:
    """Main checkout plus two linked worktrees and a claim store, all under tmp_path."""

    def __init__(self, repo_root: Path, tmp: Path, run_cmd):
        self.helper = repo_root / "scripts" / "agent-collision.sh"
        self.tmp = tmp
        self.home = tmp / "home"
        self.home.mkdir()
        self.git_config = self.home / ".gitconfig"
        self.git_config.write_text("")
        self.env = {
            "HOME": str(self.home),
            "GIT_CONFIG_GLOBAL": str(self.git_config),
            "AGENT_LOCK_DIR": str(tmp / "locks"),
            "AGENT_LOCK_SID": "1111",
            "AGENT_LOCK_FAKE_ALIVE": "1111 2222",
        }
        Path(self.env["AGENT_LOCK_DIR"]).mkdir()
        self.run = run_cmd

        self.main = tmp / "main"
        self.main.mkdir()
        self._git("init", "-q", "-b", "main", str(self.main), cwd=tmp)
        self._git("-C", str(self.main), "config", "user.email", "t@example.com")
        self._git("-C", str(self.main), "config", "user.name", "Tester")
        (self.main / "shared.txt").write_text("base\n")
        (self.main / "other.txt").write_text("base\n")
        self._git("-C", str(self.main), "add", "-A")
        self._git("-C", str(self.main), "commit", "-qm", "init")

        self.wt_a = tmp / "wt-a"
        self.wt_b = tmp / "wt-b"
        self._git("-C", str(self.main), "worktree", "add", "-q", "-b", "feat-a", str(self.wt_a), "HEAD")
        self._git("-C", str(self.main), "worktree", "add", "-q", "-b", "feat-b", str(self.wt_b), "HEAD")

    def _git(self, *args, cwd=None):
        result = self.run(["git", *args], cwd=cwd or self.tmp, env=self.env)
        result.check()
        return result

    def append(self, path: Path, text: str):
        with open(path, "a") as handle:
            handle.write(text)

    def stage(self, wt: Path):
        self._git("-C", str(wt), "add", "shared.txt")

    def peer_claim(self, name: str, sid: str, worktree: Path):
        claim = {
            "scope": "branch",
            "id": "feat-b",
            "owner_sid": sid,
            "tool": "gemini",
            "label": "dev-flow-execute",
            "worktree": str(worktree),
            "branch": "feat-b",
        }
        (Path(self.env["AGENT_LOCK_DIR"]) / name).write_text(
            json.dumps(claim, indent=2) + "\n"
        )

    def check(self, *flags, cwd: Path):
        return self.run(["bash", str(self.helper), "check", *flags], cwd=cwd, env=self.env)

    def cleanup(self):
        for wt in (self.wt_a, self.wt_b):
            self.run(["git", "-C", str(self.main), "worktree", "remove", "--force", str(wt)],
                     cwd=self.tmp, env=self.env)


@pytest.fixture
def fx(repo_root, tmp_path, run_cmd):
    fixture = Fixture(repo_root, tmp_path, run_cmd)
    yield fixture
    fixture.cleanup()


def test_overlapping_in_flight_file_exit_1_collision_line_naming_the_file(fx):
    fx.peer_claim("peer.json", "2222", fx.wt_b)
    fx.append(fx.wt_b / "shared.txt", "b-change\n")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", cwd=fx.wt_a)
    assert result.returncode == 1, result.output
    assert "COLLISION" in result.output
    assert "shared.txt" in result.output


def test_no_overlap_exit_0(fx):
    fx.peer_claim("peer.json", "2222", fx.wt_b)
    fx.append(fx.wt_b / "other.txt", "b-change\n")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", cwd=fx.wt_a)
    assert result.returncode == 0, result.output


def test_stale_dead_peer_is_ignored_exit_0(fx):
    fx.env["AGENT_LOCK_FAKE_ALIVE"] = "1111"
    fx.peer_claim("peer.json", "2222", fx.wt_b)
    fx.append(fx.wt_b / "shared.txt", "b-change\n")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", cwd=fx.wt_a)
    assert result.returncode == 0, result.output


def test_missing_peer_worktree_fail_open_exit_0(fx):
    fx.peer_claim("peer.json", "2222", fx.tmp / "gone")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", cwd=fx.wt_a)
    assert result.returncode == 0, result.output


def test_own_sid_is_excluded_not_a_self_collision_exit_0(fx):
    fx.peer_claim("mine.json", "1111", fx.wt_b)
    fx.append(fx.wt_b / "shared.txt", "b-change\n")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", cwd=fx.wt_a)
    assert result.returncode == 0, result.output


def test_all_includes_unstaged_own_files(fx):
    fx.peer_claim("peer.json", "2222", fx.wt_b)
    fx.append(fx.wt_b / "shared.txt", "b-change\n")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    result = fx.check("--all", cwd=fx.wt_a)
    assert result.returncode == 1, result.output
    assert "shared.txt" in result.output


def test_quiet_suppresses_the_warning_lines_but_keeps_the_exit_code(fx):
    fx.peer_claim("peer.json", "2222", fx.wt_b)
    fx.append(fx.wt_b / "shared.txt", "b-change\n")
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", "--quiet", cwd=fx.wt_a)
    assert result.returncode == 1, result.output
    assert result.output == ""


def test_no_peers_at_all_exit_0(fx):
    fx.append(fx.wt_a / "shared.txt", "a-change\n")
    fx.stage(fx.wt_a)
    result = fx.check("--staged", cwd=fx.wt_a)
    assert result.returncode == 0, result.output
