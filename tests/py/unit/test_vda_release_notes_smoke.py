"""tests/py/unit/test_vda_release_notes_smoke.py — Migration of tests/unit/vda-release-notes-smoke.bats."""
import os
from pathlib import Path
import pytest


@pytest.fixture
def rn_sh(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda" / "release-notes.sh"


@pytest.fixture
def vda_sh(repo_root: Path) -> Path:
    return repo_root / "scripts" / "vda.sh"


@pytest.fixture
def gh_stubs(tmp_path: Path):
    bin_dir = tmp_path / "bin"
    work_dir = tmp_path / "work"
    bin_dir.mkdir()
    work_dir.mkdir()

    def _stub(empty: bool = False):
        gh = bin_dir / "gh"
        if empty:
            gh.write_text("#!/usr/bin/env bash\necho '[]'\nexit 0\n", encoding="utf-8")
        else:
            gh.write_text("""#!/usr/bin/env bash
if [[ "$*" =~ pr[[:space:]]list ]]; then
  echo '[{"number":42,"title":"feat: add dark mode","labels":[],"mergedAt":"2026-06-17T00:00:00Z"},{"number":43,"title":"fix: login redirect loop","labels":[],"mergedAt":"2026-06-17T01:00:00Z"}]'
  exit 0
fi
echo "gh stub: $*" >&2
exit 0
""", encoding="utf-8")
        gh.chmod(0o755)
        return bin_dir, work_dir

    return _stub


def test_release_notes_help_exits_0(run_cmd, rn_sh: Path):
    res = run_cmd(["bash", str(rn_sh), "help"])
    res.check(0)
    for sub in ["generate", "publish-github", "publish-changelog"]:
        assert sub in res.output


def test_release_notes_without_args_shows_help(run_cmd, rn_sh: Path):
    res = run_cmd(["bash", str(rn_sh)])
    res.check(0)
    assert "Usage" in res.output


def test_release_notes_unknown_subcommand_exits_2(run_cmd, rn_sh: Path):
    res = run_cmd(["bash", str(rn_sh), "nonexistent"])
    assert res.returncode == 2
    assert "Unknown subcommand" in res.output


def test_vda_release_notes_help_exits_0(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "release-notes", "help"])
    res.check(0)
    assert "generate" in res.output


def test_vda_help_lists_release_notes(run_cmd, vda_sh: Path):
    res = run_cmd(["bash", str(vda_sh), "help"])
    res.check(0)
    assert "release-notes" in res.output


def test_generate_without_gh_fallback(run_cmd, rn_sh: Path, tmp_path: Path):
    bin_dir = tmp_path / "bin_fail"
    bin_dir.mkdir()
    gh = bin_dir / "gh"
    gh.write_text("#!/usr/bin/env bash\nexit 1\n", encoding="utf-8")
    gh.chmod(0o755)
    env = {"PATH": f"{bin_dir}:{os.environ.get('PATH', '')}"}
    res = run_cmd(["bash", str(rn_sh), "generate"], env=env)
    res.check(0)
    assert "# Release Notes" in res.output


def test_generate_with_stubbed_gh(run_cmd, rn_sh: Path, gh_stubs):
    bin_dir, _ = gh_stubs(empty=False)
    env = {"PATH": f"{bin_dir}:{os.environ.get('PATH', '')}"}
    res = run_cmd(["bash", str(rn_sh), "generate", "--since", "v1.0.0"], env=env)
    res.check(0)
    assert "# Release Notes" in res.output
    assert "dark mode" in res.output
    assert "login redirect" in res.output


def test_generate_out_writes_to_file(run_cmd, rn_sh: Path, gh_stubs):
    bin_dir, work_dir = gh_stubs(empty=False)
    out = work_dir / "notes.md"
    env = {"PATH": f"{bin_dir}:{os.environ.get('PATH', '')}"}
    res = run_cmd(["bash", str(rn_sh), "generate", "--since", "v1.0.0", "--out", str(out)], env=env)
    res.check(0)
    assert out.is_file()
    assert "dark mode" in out.read_text(encoding="utf-8")


def test_publish_github_dry_run(run_cmd, rn_sh: Path, gh_stubs):
    bin_dir, work_dir = gh_stubs(empty=False)
    notes = work_dir / "notes.md"
    notes.write_text("# Test notes\n", encoding="utf-8")
    env = {"PATH": f"{bin_dir}:{os.environ.get('PATH', '')}"}
    res = run_cmd(["bash", str(rn_sh), "publish-github", "--tag", "v1.0.0", "--notes-file", str(notes), "--dry-run"], env=env)
    res.check(0)
    assert "DRY_RUN" in res.output
    assert "gh release edit" in res.output


def test_publish_github_requires_notes_file(run_cmd, rn_sh: Path):
    res = run_cmd(["bash", str(rn_sh), "publish-github", "--tag", "v1.0.0"])
    assert res.returncode == 2
    assert "--notes-file is required" in res.output


def test_publish_changelog_dry_run(run_cmd, rn_sh: Path, tmp_path: Path):
    notes = tmp_path / "notes.md"
    notes.write_text("# Test changelog entry\n", encoding="utf-8")
    res = run_cmd(["bash", str(rn_sh), "publish-changelog", "--notes-file", str(notes), "--dry-run"])
    res.check(0)
    assert "DRY_RUN" in res.output


def test_publish_changelog_requires_notes_file(run_cmd, rn_sh: Path):
    res = run_cmd(["bash", str(rn_sh), "publish-changelog"])
    assert res.returncode == 2
    assert "--notes-file is required" in res.output


def test_publish_changelog_missing_file_exits_2(run_cmd, rn_sh: Path):
    res = run_cmd(["bash", str(rn_sh), "publish-changelog", "--notes-file", "/nonexistent/file.md"])
    assert res.returncode == 2
    assert "Notes file not found" in res.output


def test_generate_with_empty_gh_fallback(run_cmd, rn_sh: Path, gh_stubs):
    bin_dir, _ = gh_stubs(empty=True)
    env = {"PATH": f"{bin_dir}:{os.environ.get('PATH', '')}"}
    res = run_cmd(["bash", str(rn_sh), "generate", "--since", "HEAD~10"], env=env)
    res.check(0)
    assert "# Release Notes" in res.output
