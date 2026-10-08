"""Native migration of tests/spec/agent-skills/check-pr-automerge-fail-closed.bats."""

import os
from pathlib import Path

import pytest


@pytest.fixture
def bin_dir(tmp_path):
    """BATS setup: private BIN_DIR prepended to PATH for the gh stub."""
    d = tmp_path / "amfc-bin"
    d.mkdir()
    return d


def _env(bin_dir: Path) -> dict:
    return {"PATH": f"{bin_dir}:{os.environ.get('PATH', '')}"}


def _stub_gh(bin_dir: Path, mode: str) -> None:
    """gh-Stub fuer `pr view`; Mode: AM_ACTIVE | AM_NONE | NO_PR."""
    if mode == "AM_ACTIVE":
        pr_view = (
            "printf '%s\\n' '{\"number\":42,\"autoMergeRequest\":{\"enabledAt\":"
            "\"2026-08-15T00:00:00Z\",\"mergeMethod\":\"SQUASH\"}}'; exit 0 ;;"
        )
    elif mode == "AM_NONE":
        pr_view = "printf '%s\\n' '{\"number\":42,\"autoMergeRequest\":null}'; exit 0 ;;"
    elif mode == "NO_PR":
        pr_view = "echo 'no pull requests found for branch \"main\"' >&2; exit 1 ;;"
    else:
        raise ValueError(mode)
    script = (
        "#!/usr/bin/env bash\n"
        'case "$*" in\n'
        '  *"pr view"*)\n'
        f"    {pr_view}\n"
        "  *) exit 0 ;;\n"
        "esac\n"
    )
    gh = bin_dir / "gh"
    gh.write_text(script, encoding="utf-8")
    gh.chmod(0o755)


def _section(text: str, heading_re: str) -> str:
    """Emuliert: awk '/<heading>/{flag=1; next} /^## /&&flag{exit} flag'."""
    import re

    out = []
    flag = False
    for line in text.splitlines():
        if not flag:
            if re.search(heading_re, line):
                flag = True
            continue
        if line.startswith("## "):
            break
        out.append(line)
    return "\n".join(out)


def test_t900043_expliziter_pr_mit_aktivem_auto_merge_rc1_nennt_pr_nummer(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "AM_ACTIVE")
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh"), "--pr", "42"], env=_env(bin_dir))
    assert r.returncode == 1
    assert "42" in r.stdout


def test_t900043_explizites_branch_ohne_pr_rc0_expliziter_kontext_bleibt_gruen(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "NO_PR")
    r = run_cmd(
        ["bash", str(repo_root / "scripts/check-pr-automerge.sh"), "--branch", "fix/x-T900043"],
        env=_env(bin_dir),
    )
    assert r.returncode == 0


def test_t900043_barer_call_ohne_pr_kontext_rc2_statt_ok_rc0(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "NO_PR")
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh")], env=_env(bin_dir))
    assert r.returncode == 2


def test_t900043_barer_call_nennt_den_fehlenden_kontext_branch_pr(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "NO_PR")
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh")], env=_env(bin_dir))
    assert r.returncode == 2
    assert "--branch" in r.output


def test_t900043_pre_flight_phases_md_1_4_7_uebergibt_branch_statt_barem_call(repo_root):
    phases = repo_root / ".claude/skills/references/dev-flow-execute-phases.md"
    section = _section(phases.read_text(encoding="utf-8"), r"^### Schritt 1\.4\.7")
    assert "check-pr-automerge.sh --branch" in section
