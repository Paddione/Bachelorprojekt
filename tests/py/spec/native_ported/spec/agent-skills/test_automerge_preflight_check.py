"""Native migration of tests/spec/agent-skills/automerge-preflight-check.bats."""

import os
import re
from pathlib import Path

import pytest


@pytest.fixture
def bin_dir(tmp_path):
    """BATS setup: private BIN_DIR prepended to PATH for the gh stub."""
    d = tmp_path / "am-bin"
    d.mkdir()
    return d


def _path_env() -> str:
    return os.environ.get("PATH", "")


def _stub_gh(bin_dir: Path, mode: str) -> None:
    """Write a gh stub for `pr view`; mode: AM_ACTIVE | AM_NONE | NO_PR."""
    if mode == "AM_ACTIVE":
        pr_view = (
            "printf '%s\\n' '{\"number\":42,\"autoMergeRequest\":{\"enabledAt\":"
            "\"2026-08-15T00:00:00Z\",\"mergeMethod\":\"SQUASH\"}}'; exit 0 ;;"
        )
    elif mode == "AM_NONE":
        pr_view = "printf '%s\\n' '{\"number\":42,\"autoMergeRequest\":null}'; exit 0 ;;"
    elif mode == "NO_PR":
        pr_view = "echo 'no pull requests found for branch \"fix/x\"' >&2; exit 1 ;;"
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


def _env(bin_dir: Path) -> dict:
    return {"PATH": f"{bin_dir}:{_path_env()}"}


def test_t006366_auto_merge_aktiv_rc1_meldung_nennt_pr_nummer(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "AM_ACTIVE")
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh"), "--pr", "42"], env=_env(bin_dir))
    assert r.returncode == 1
    assert "42" in r.output


def test_t006366_kein_auto_merge_autoMergeRequest_null_rc0(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "AM_NONE")
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh"), "--pr", "42"], env=_env(bin_dir))
    assert r.returncode == 0


def test_t006366_kein_pr_fuer_den_branch_rc0_normalfall_im_pre_flight(run_cmd, repo_root, bin_dir):
    _stub_gh(bin_dir, "NO_PR")
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh"), "--branch", "fix/x"], env=_env(bin_dir))
    assert r.returncode == 0


def test_t006366_gh_fehlt_rc2_kein_freibrief_als_kein_auto_merge(run_cmd, repo_root, bin_dir):
    # gh-Stub simuliert 'command not found' (exit 127), deterministisch
    gh = bin_dir / "gh"
    gh.write_text("#!/usr/bin/env bash\nexit 127\n", encoding="utf-8")
    gh.chmod(0o755)
    r = run_cmd(["bash", str(repo_root / "scripts/check-pr-automerge.sh"), "--pr", "42"], env=_env(bin_dir))
    assert r.returncode == 2


def _section(text: str, heading_re: str) -> str:
    """Emulates: awk '/^<heading>/{flag=1; next} /^## /&&flag{exit} flag'."""
    out = []
    flag = False
    for line in text.splitlines():
        if not flag:
            if re.match(heading_re, line):
                flag = True
            continue
        if line.startswith("## "):
            break
        out.append(line)
    return "\n".join(out)


def test_t006366_merge_gate_schritt_3_8_fuehrt_auto_merge_check_aus(repo_root):
    skill = repo_root / ".claude/skills/dev-flow-execute/SKILL.md"
    gate = _section(skill.read_text(encoding="utf-8"), r"^## Schritt 3\.8: Merge-Gate")
    assert "check-pr-automerge.sh" in gate


def test_t006366_pre_flight_phases_md_fuehrt_auto_merge_check_nach_doppelarbeit_guard_aus(repo_root):
    phases = repo_root / ".claude/skills/references/dev-flow-execute-phases.md"
    assert "check-pr-automerge.sh" in phases.read_text(encoding="utf-8")
