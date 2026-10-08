"""Native migration of tests/spec/ci-cd/changed-tests-uncommitted-diff.bats."""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT_REL = "scripts/find-changed-tests.sh"
PROBE_REL = "tests/spec/ci-cd/spec-dir-convention.bats"
PROBE_LINE_RE = "# T002713 probe edit"


def _git(cwd: Path, *args):
    return subprocess.run(["git", *args], cwd=str(cwd), capture_output=True, text=True)


@pytest.fixture
def probe_repo(repo_root, tmp_path):
    """Wegwerf-Repo mit einer Kopie der Probe-Datei: die getrackte Repo-Datei bleibt unangetastet."""
    src = repo_root / PROBE_REL
    if not src.is_file():
        pytest.fail(f"Fixture-Voraussetzung fehlt: {PROBE_REL} existiert nicht")
    work = tmp_path / "probe-repo"
    (work / Path(PROBE_REL).parent).mkdir(parents=True)
    shutil.copy2(src, work / PROBE_REL)
    _git(work, "init", "--quiet")
    _git(work, "config", "user.email", "t@example.com")
    _git(work, "config", "user.name", "Test")
    _git(work, "add", "-A")
    _git(work, "commit", "--quiet", "-m", "probe base")
    return work


def _edit(path: Path, pid: int):
    with open(path, "a") as fh:
        fh.write(f"# T002713 probe edit {pid}\n")


def test_t002713_uncommitted_edit_to_a_tracked_spec_bats_file_is_detected_as_a_candidate(run_cmd, repo_root, probe_repo):
    _edit(probe_repo / PROBE_REL, os.getpid())
    # Positiv-Anker: git sieht die Aenderung.
    st = _git(probe_repo, "status", "--porcelain", "--", PROBE_REL).stdout
    assert st.strip() != "", "Fixture ungueltig: git sieht die Testaenderung nicht als geaendert"

    res = run_cmd(["bash", str(repo_root / SCRIPT_REL), "spec"], cwd=probe_repo)
    assert res.returncode == 0
    assert PROBE_REL in res.output, f"uncommitted edit an {PROBE_REL} fehlt in der Auswahl:\n{res.output}"


def test_t002713_stderr_always_names_the_diff_source_and_raw_file_count(run_cmd, repo_root, probe_repo):
    _edit(probe_repo / PROBE_REL, os.getpid())
    res = run_cmd(["bash", "-c", f"bash '{repo_root / SCRIPT_REL}' spec 2>&1 >/dev/null"], cwd=probe_repo)
    assert res.returncode == 0
    assert re.search(r"diff-source=(origin/main|HEAD|override)[ \t]+files=[0-9]+", res.output), \
        f"keine Provenance-Zeile (diff-source=... files=<n>) auf stderr:\n{res.output}"


def test_t002713_with_no_uncommitted_or_committed_drift_provenance_still_reports_the_source(run_cmd, repo_root):
    res = run_cmd(["bash", "-c", f"bash '{repo_root / SCRIPT_REL}' spec 2>&1 >/dev/null"], cwd=repo_root)
    assert res.returncode == 0
    assert "diff-source=" in res.output, \
        "keine diff-source-Zeile auf stderr - 'nichts geaendert' waere von 'Quelle fehlgeschlagen' nicht unterscheidbar"


def test_t002713_override_is_labeled_override_and_bypasses_git_diff(run_cmd, repo_root):
    res = run_cmd(["bash", "-c", f"bash '{repo_root / SCRIPT_REL}' spec 2>&1 >/dev/null"],
                  cwd=repo_root, env={"FIND_CHANGED_TESTS_FILES": PROBE_REL})
    assert res.returncode == 0
    assert re.search(r"diff-source=override[ \t]+files=1", res.output), \
        f"Override-Provenance fehlt oder falsch gezaehlt:\n{res.output}"
