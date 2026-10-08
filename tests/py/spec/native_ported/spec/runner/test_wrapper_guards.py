"""Native migration of tests/spec/runner/wrapper-guards.bats."""
# Guards for the BATS runner wrapper tests/bats (UTF-8 locale, vendored BATS-core call, ASCII-only
# @test names). Source-text checks on the wrapper and on test names are a documented exception

# (T002448-M4): the object under test is a convention present only in the source text.

import re
from pathlib import Path

import pytest


@pytest.fixture
def wrapper(repo_root):
    return repo_root / "tests" / "bats"


def _find_bats(root: Path, recursive: bool):
    if recursive:
        return sorted(p for p in root.rglob("*.bats") if p.is_file())
    return sorted(p for p in root.glob("*.bats") if p.is_file())


def _umlaut_test_names(repo_root: Path, base: str, recursive: bool):
    pattern = re.compile(r'@test\s+"[^"]*[\x80-\xff]')
    hits = []
    for f in _find_bats(repo_root / base, recursive):
        for lineno, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if pattern.search(line):
                hits.append(f"{f.relative_to(repo_root)}:{lineno}:{line}")
    return hits


def test_tests_bats_ist_ausfuehrbar(run_cmd, repo_root):
    res = run_cmd(["ls", "-l", "tests/bats"], cwd=repo_root)
    assert res.returncode == 0
    assert "-rwx" in res.output or "x" in res.output


def test_tests_bats_ist_ein_shell_skript_shebang(run_cmd, repo_root):
    res = run_cmd(["head", "-1", "tests/bats"], cwd=repo_root)
    assert res.output.startswith("#!")


def test_tests_bats_setzt_lc_all_c_utf_8_auf_windows_git_bash_erkennung(wrapper):
    lines = [l for l in wrapper.read_text(encoding="utf-8").splitlines() if "LC_ALL" in l]
    assert lines, "grep -q 'LC_ALL' tests/bats fehlgeschlagen"
    output = "\n".join(lines)
    assert any(tok in output for tok in ("C.UTF-8", '"C.UTF-8"', "utf-8", '"utf-8"'))


def test_tests_bats_ruft_den_vendorten_bats_core_direkt_auf_kein_npm_npx_binary(wrapper):
    text = wrapper.read_text(encoding="utf-8")
    assert "unit/lib/bats-core/bin/bats" in text
    assert not re.search(r"^[^#\n]*(npm|npx)[ \t]+(exec[ \t]+)?bats", text, re.MULTILINE)


def test_keine_test_namen_mit_umlauten_in_tests_spec(repo_root):
    hits = _umlaut_test_names(repo_root, "tests/spec", recursive=True)
    assert not hits, "Nicht-ASCII @test-Namen gefunden:\n" + "\n".join(hits)


def test_keine_test_namen_mit_umlauten_in_tests_unit(repo_root):
    hits = _umlaut_test_names(repo_root, "tests/unit", recursive=True)
    assert not hits, "Nicht-ASCII @test-Namen gefunden:\n" + "\n".join(hits)


def test_keine_test_namen_mit_umlauten_in_tests_root(repo_root):
    hits = _umlaut_test_names(repo_root, "tests", recursive=False)
    assert not hits, "Nicht-ASCII @test-Namen gefunden:\n" + "\n".join(hits)
