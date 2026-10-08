"""Native migration of tests/spec/local-llm-proxy/proxy-tests-registered.bats."""

# [T002638]

import re
from pathlib import Path

PROXY_TEST_RX = re.compile(r"scripts/llm-proxy/[a-z0-9-]*\.test\.mjs")


def _runner_lines(repo_root: Path):
    lines = []
    for path in (repo_root / "taskfiles/Taskfile.test.yml", repo_root / ".github/workflows/ci.yml"):
        for line in path.read_text(encoding="utf-8").splitlines():
            if PROXY_TEST_RX.search(line):
                lines.append(line)
    return lines


def test_proxy_tests_registered_beide_runner_dateien_existieren_und_nennen_ueberhaupt_proxy_tests(repo_root):
    task = repo_root / "taskfiles/Taskfile.test.yml"
    ci = repo_root / ".github/workflows/ci.yml"
    assert task.is_file()
    assert ci.is_file()
    assert sum(1 for l in task.read_text(encoding="utf-8").splitlines() if PROXY_TEST_RX.search(l)) > 0
    assert sum(1 for l in ci.read_text(encoding="utf-8").splitlines() if PROXY_TEST_RX.search(l)) > 0


def test_proxy_tests_registered_eine_bekannt_registrierte_datei_wird_als_registriert_erkannt(repo_root):
    assert sum(1 for l in _runner_lines(repo_root) if "server.test.mjs" in l) > 0


def test_proxy_tests_registered_jede_scripts_llm_proxy_test_mjs_steht_in_taskfile_und_ci_yml(repo_root):
    task_text = (repo_root / "taskfiles/Taskfile.test.yml").read_text(encoding="utf-8")
    ci_text = (repo_root / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    files = sorted((repo_root / "scripts/llm-proxy").glob("*.test.mjs"))
    assert len(files) > 0
    missing_task = [f.name for f in files if not re.search(f.name, task_text)]
    missing_ci = [f.name for f in files if not re.search(f.name, ci_text)]
    if missing_task:
        print("Nicht in Taskfile.yml (Target test:llm-proxy): " + " ".join(missing_task))
    if missing_ci:
        print("Nicht in .github/workflows/ci.yml (Schritt 'llm-proxy routing + readiness'): " + " ".join(missing_ci))
    assert not missing_task
    assert not missing_ci
