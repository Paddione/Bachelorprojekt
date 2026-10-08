"""Native migration of tests/spec/agent-skills/executor-post-merge-death.bats."""
import shutil
from pathlib import Path

import pytest


def _post_merge_section(text: str) -> str:
    """Emulate awk '/^## Schritte 6\\.4/{flag=1; next} /^## /&&flag{exit} flag'."""
    out, flag = [], False
    for line in text.splitlines():
        if line.startswith("## Schritte 6.4"):
            flag = True
            continue
        if line.startswith("## ") and flag:
            break
        if flag:
            out.append(line)
    return "\n".join(out)


def _skill(repo_root: Path) -> Path:
    return repo_root / ".claude/skills/dev-flow-execute/SKILL.md"


def _finalize(repo_root: Path) -> Path:
    return repo_root / "scripts/devflow-post-merge-finalize.sh"


def test_t006284_post_merge_abschnitt_existiert_und_nennt_das_merge_wait_motiv(repo_root):
    section = _post_merge_section(_skill(repo_root).read_text(encoding="utf-8"))
    assert section
    assert "T001149" in section


def test_t006284_post_merge_abschnitt_weist_die_finalisierung_als_finalizer_delegation_aus(repo_root):
    section = _post_merge_section(_skill(repo_root).read_text(encoding="utf-8"))
    assert "Finalizer" in section
    assert "frischen" in section


def test_t006284_skill_referenziert_scripts_devflow_post_merge_finalize_sh(repo_root):
    assert "devflow-post-merge-finalize.sh" in _skill(repo_root).read_text(encoding="utf-8")


def test_t006284_finalize_skript_existiert_und_help_endet_mit_exit_0(run_cmd, repo_root):
    script = _finalize(repo_root)
    assert script.is_file()
    res = run_cmd(["bash", str(script), "--help"], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert res.output


def test_t006284_finalize_skript_ohne_ticket_id_endet_mit_exit_ungleich_0(run_cmd, repo_root):
    script = _finalize(repo_root)
    assert script.is_file()
    res = run_cmd(["bash", str(script)], cwd=repo_root)
    assert res.returncode != 0


def test_t006284_finalize_skript_hat_dokumentierten_offline_fehlerpfad(run_cmd, repo_root):
    script = _finalize(repo_root)
    assert script.is_file()
    res = run_cmd(["bash", str(script), "T006284"], cwd=repo_root, env={"TICKET_OFFLINE": "1"})
    assert res.returncode != 0
    assert res.output


def test_t006348_finalize_skript_funktioniert_unbeeinflusst_vom_arbeitsverzeichnis(run_cmd, repo_root):
    script = _finalize(repo_root)
    assert script.is_file()
    res = run_cmd(f"cd /tmp && bash '{script}' --help", cwd=repo_root, shell=True)
    assert res.returncode == 0, res.output
