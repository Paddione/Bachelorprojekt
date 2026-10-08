"""Native migration of tests/unit/collabora-wopi-single-brand-guard.bats."""
import re
from pathlib import Path

TASKFILE_PLATFORM = "taskfiles/Taskfile.platform.yml"
TASKFILE_WORKSPACE = "taskfiles/Taskfile.workspace.yml"


def _grep_a(lines, pattern, after):
    """Emulate `grep -A<after> PATTERN`: matching lines plus the N lines following each match."""
    keep = set()
    for idx, line in enumerate(lines):
        if re.search(pattern, line):
            keep.update(range(idx, min(len(lines), idx + after + 1)))
    return [lines[i] for i in sorted(keep)]


def _suite_count(repo_root: Path, pattern: str) -> int:
    """Total matching lines across Taskfile.yml and taskfiles/ (grep -rhE ... | wc -l)."""
    files = [repo_root / "Taskfile.yml"]
    files += [p for p in (repo_root / "taskfiles").rglob("*") if p.is_file()]
    count = 0
    for f in files:
        if not f.is_file():
            continue
        for line in f.read_text(encoding="utf-8", errors="replace").splitlines():
            if re.search(pattern, line):
                count += 1
    return count


def test_t000478_fleet_shared_services_sets_collabora_host_2_to_a_non_empty_value(repo_root):
    lines = (repo_root / TASKFILE_PLATFORM).read_text(encoding="utf-8").splitlines()
    window = _grep_a(lines, r"^  fleet:shared-services:", 100)
    hits = [line for line in window if "COLLABORA_HOST_2=" in line]
    assert hits, "grep 'COLLABORA_HOST_2=' found no line"
    assert 'COLLABORA_HOST_2=""' not in "\n".join(hits)


def test_t000478_collabora_server_name_stays_empty_in_all_deploy_paths(repo_root):
    total = _suite_count(repo_root, r"export\s+COLLABORA_SERVER_NAME=")
    empty = _suite_count(repo_root, r'export\s+COLLABORA_SERVER_NAME=""')
    assert total >= 1
    assert total == empty


def test_t000478_workspace_office_deploy_has_a_prod_safety_guard_blocks_single_brand_deploy_on_fleet(repo_root):
    lines = (repo_root / TASKFILE_WORKSPACE).read_text(encoding="utf-8").splitlines()
    window = _grep_a(lines, "workspace:office:deploy:", 100)
    hits = [
        line for line in window
        if re.search(r"fleet|prod|shared|ENV.*dev|only.*dev|block", line, re.IGNORECASE)
    ]
    assert hits, (
        "FAIL: workspace:office:deploy has no prod guard.\n"
        "      On fleet, use fleet:deploy:shared-services instead."
    )
