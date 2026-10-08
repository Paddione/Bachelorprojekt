"""Native migration of tests/spec/os-retirement-code.bats."""

import glob
import subprocess

EXACT_CI_LINE = "    name: Factory + OpenSpec + Guards"
OPSX_LINE = __import__("re").compile(r"openspec|opsx", __import__("re").IGNORECASE)


def _offenders(repo_root, list_file):
    """Python form of _offenders(): files with openspec/opsx refs beyond the one allowed line."""
    offenders = []
    for rel in list_file.read_text(encoding="utf-8").splitlines():
        if not rel or not (repo_root / rel).exists():
            continue
        matches = [
            line for line in (repo_root / rel).read_text(encoding="utf-8", errors="replace").splitlines()
            if OPSX_LINE.search(line)
        ]
        if any(line != EXACT_CI_LINE for line in matches):
            offenders.append(rel)
    return offenders


def test_t900725_code_dateien_der_liste_ohne_openspec_bezug(repo_root):
    offenders = _offenders(repo_root, repo_root / "tests" / "fixtures" / "os-retirement" / "code.txt")
    assert not offenders, "\n".join(offenders[:40])


def test_t900725_skill_command_dateien_der_liste_ohne_openspec_bezug(repo_root):
    offenders = _offenders(repo_root, repo_root / "tests" / "fixtures" / "os-retirement" / "skills.txt")
    assert not offenders, "\n".join(offenders[:40])


def test_t900725_openspec_skills_und_opsx_commands_sind_geloescht(run_cmd, repo_root):
    result = run_cmd(
        [
            "bash",
            "-c",
            f"cd '{repo_root}' && ls -d .opencode/skills/openspec-* .claude/skills/openspec-* "
            ".claude/commands/opsx .opencode/commands/opsx-* 2>/dev/null",
        ]
    )
    assert result.output == "", result.output
