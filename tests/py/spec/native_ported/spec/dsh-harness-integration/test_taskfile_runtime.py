"""Native migration of tests/spec/dsh-harness-integration/taskfile-runtime.bats."""

import re
from pathlib import Path

import pytest


def _code_lines(path: Path) -> str:
    """grep -vE '^[[:space:]]*#' — Kommentarzeilen entfernen, Code-Zeilen behalten."""
    return "\n".join(line for line in path.read_text(encoding="utf-8").splitlines() if not re.match(r"^[ \t]*#", line))


def _count_lines(text: str, needle: str) -> int:
    """grep -c -- <literal>: Anzahl Zeilen, die den Teilstring enthalten."""
    return len([line for line in text.splitlines() if needle in line])


def _grep_count_regex(path: Path, pattern: str) -> int:
    return len([line for line in path.read_text(encoding="utf-8").splitlines() if re.search(pattern, line)])


def test_dsh_doctor_findet_den_klon_und_endet_mit_exit_0(run_cmd, repo_root):
    if not (repo_root / "deepseek-harness" / "node_modules").is_dir():
        pytest.skip("deepseek-harness checkout not built")
    r = run_cmd(["bash", "-c", f"cd '{repo_root}' && task dsh:dsh:doctor 2>&1"])
    assert r.returncode == 0, r.output
    # Positiv-Anker: der Lauf muss den Abschluss melden.
    assert "All checks passed" in r.output
    # Der leere-Variable-Fehler darf nicht zurueckkommen.
    assert "not found at /deepseek-harness" not in r.output


def test_taskfile_dsh_yml_benutzt_keine_leere_task_variable(repo_root):
    path = repo_root / "taskfiles" / "Taskfile.dsh.yml"
    assert _count_lines(_code_lines(path), "{{.ROOT}}") == 0
    # Positiv-Anker: die korrekte Variable wird tatsaechlich benutzt.
    assert _count_lines(path.read_text(encoding="utf-8"), "{{.ROOT_DIR}}") >= 1


def test_web_up_sh_ruft_dsh_mit_dem_existierenden_patch_overlay_auf(repo_root):
    code = _code_lines(repo_root / "scripts" / "dsh" / "web-up.sh")
    assert _count_lines(code, "--bundle") == 0
    assert _count_lines(code, "--patch") >= 1


def test_web_up_sh_registriert_mit_den_flags_die_session_hub_sh_kennt(repo_root):
    code = _code_lines(repo_root / "scripts" / "dsh" / "web-up.sh")
    assert _count_lines(code, "--slug") == 0
    assert _count_lines(code, "--name") >= 1


def test_web_up_sh_bricht_ohne_gebauten_klon_mit_exit_2_und_genannter_ursache_ab(run_cmd, repo_root):
    r = run_cmd(["bash", str(repo_root / "scripts" / "dsh" / "web-up.sh"), "3099"],
                env={"DSH_DIR": "/nonexistent-dsh-checkout"})
    assert r.returncode == 2, r.output
    assert "not built" in r.output or "nicht gebaut" in r.output


def test_resolve_clone_findet_den_klon_aus_einem_worktree_heraus(run_cmd, repo_root):
    if not ((repo_root / ".." / ".." / "deepseek-harness" / "package.json").is_file()
            or (repo_root / "deepseek-harness" / "package.json").is_file()):
        pytest.skip("no deepseek-harness clone on this host")
    r = run_cmd(["bash", str(repo_root / "scripts" / "dsh" / "resolve-clone.sh"), str(repo_root)])
    assert r.returncode == 0, r.output
    assert (Path(r.output) / "package.json").is_file()


def test_ein_ungueltiges_dsh_dir_wird_gemeldet_statt_still_ersetzt(run_cmd, repo_root):
    r = run_cmd(["bash", str(repo_root / "scripts" / "dsh" / "resolve-clone.sh"), str(repo_root)],
                env={"DSH_DIR": "/nonexistent-dsh"})
    assert r.returncode == 2, r.output
    assert "/deepseek-harness" not in r.output or "no deepseek-harness checkout" in r.output


def test_plugins_exportieren_apply_nicht_setup_sonst_lehnt_cordis_sie_ab(repo_root):
    files = sorted((repo_root / "tools" / "dsh" / "plugins").glob("*.mjs")) + [repo_root / "tools" / "dsh" / "index.js"]
    for f in files:
        text = f.read_text(encoding="utf-8")
        assert len(re.findall(r"^export (async )?function apply\(", text, re.MULTILINE)) >= 1, str(f)
        assert len(re.findall(r"^export (async )?function setup\(", text, re.MULTILINE)) == 0, str(f)


def test_die_patch_vorlage_traegt_platzhalter_keine_unaufloesbaren_paketnamen(repo_root):
    path = repo_root / "tools" / "dsh" / "cordis.patch.yml"
    assert _grep_count_regex(path, r"@@REPO@@|@@DSH_CLONE@@") >= 1
    # Der frueher eingecheckte, nicht aufloesbare Kurzname darf weg sein.
    code = _code_lines(path)
    assert _count_lines(code, "name: dsh-hooks-claude-code") == 0
