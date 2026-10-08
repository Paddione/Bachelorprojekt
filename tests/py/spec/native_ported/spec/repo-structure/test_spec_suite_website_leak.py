"""Native migration of tests/spec/repo-structure/spec-suite-website-leak.bats."""
# Der Guard-Lauf (website-moved) wird gegen einen Fake-Repo-Baum in einem Temp-Verzeichnis
# ausgefuehrt: dort liegt eine Kopie der Guard-Datei, eine Kopie der conftest.py und ein

# package.json-Anker. Der innere pytest-Lauf prueft den Exit-Status des Guards.

import shutil
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.fixture
def fake_root(repo_root, tmp_path):
    fake = tmp_path / "fake"
    py_dir = fake / "tests" / "py"
    guard_dir = py_dir / "spec" / "native_ported" / "spec" / "repo-structure"
    guard_dir.mkdir(parents=True)
    (fake / "components" / "website").mkdir(parents=True)
    shutil.copy(repo_root / "tests" / "py" / "conftest.py", py_dir / "conftest.py")
    shutil.copy(repo_root / "tests" / "py" / "pytest.ini", py_dir / "pytest.ini")
    shutil.copy(
        repo_root / "tests" / "py" / "spec" / "native_ported" / "spec" / "repo-structure" / "test_website_moved.py",
        guard_dir / "test_website_moved.py",
    )
    (fake / "components" / "website" / "package.json").write_text('{"name":"fake-package"}\n')
    return fake


def _run_guard(fake: Path) -> int:
    py_dir = fake / "tests" / "py"
    module = py_dir / "spec" / "native_ported" / "spec" / "repo-structure" / "test_website_moved.py"
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", "-c", str(py_dir / "pytest.ini"), "-p", "no:cacheprovider", "-q", str(module)],
        cwd=str(py_dir), capture_output=True, text=True, timeout=300,
    )
    return proc.returncode


def test_t011792_nicht_leeres_website_bleibt_rot_positiv_anker(fake_root):
    (fake_root / "website").mkdir()
    (fake_root / "website" / "keep.txt").write_text("x\n")
    status = _run_guard(fake_root)
    assert status == 1, "Anker: Guard war gruen trotz nicht-leerem website/ — Cleanup zu aggressiv"
    # Der Guard darf ein echtes website/ NICHT wegraeumen.
    assert (fake_root / "website").is_dir(), "Anker: nicht-leeres website/ wurde entfernt — Datenverlust-Gefahr"


def test_t011792_leeres_website_wird_weggeraeumt_guard_bleibt_gruen(fake_root):
    (fake_root / "website").mkdir()
    status = _run_guard(fake_root)
    assert status == 0, "Guard rot trotz leerem website/ (Suite-Leak)"
    assert not (fake_root / "website").exists(), "website/ wurde nicht weggeraeumt"
