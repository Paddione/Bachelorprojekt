"""Native migration of tests/unit/shared-db-initdb-selfheal.bats."""
import re
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    return {
        "manifest": repo_root / "k3d" / "shared-db.yaml",
        "taskfile": repo_root / "Taskfile.yml",
        "taskfiles": repo_root / "taskfiles",
    }


def _taskfile_sources(paths) -> list[Path]:
    return [paths["taskfile"]] + sorted(p for p in paths["taskfiles"].rglob("*") if p.is_file())


def test_shared_db_yaml_exists(paths):
    assert paths["manifest"].is_file()


def test_post_start_self_heals_databases_create_database_loop(paths):
    text = paths["manifest"].read_text(encoding="utf-8")
    assert re.search(r"for db in nextcloud vaultwarden website pentest videovault pocket_id; do", text)
    assert re.search(r"CREATE DATABASE", text)


def test_post_start_self_heals_roles_create_user_guarded_by_not_exists(paths):
    text = paths["manifest"].read_text(encoding="utf-8")
    for role in ["nextcloud", "vaultwarden", "website", "pentest", "videovault"]:
        first = re.search(rf"rolname='{role}'.*CREATE USER {role}", text)
        second = re.search(rf"rolname='{role}'\)    THEN CREATE USER {role}", text)
        assert first or second, f"role {role} not self-healed"


def test_self_heal_db_existence_check_precedes_create_database(paths):
    text = paths["manifest"].read_text(encoding="utf-8")
    assert re.search(re.escape("SELECT 1 FROM pg_database WHERE datname='$$db'"), text)


def test_t001673_every_raw_apply_pipes_through_collapse_sed(paths):
    # Kein direktes 'kubectl apply -f k3d/shared-db.yaml' mehr (ohne Collapse-Pipe).
    pattern = re.compile(r"kubectl[^|]*apply -f k3d/shared-db\.yaml")
    hits = []
    for source in _taskfile_sources(paths):
        for num, line in enumerate(source.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            if pattern.search(line):
                hits.append(f"{source}:{num}:{line}")
    assert not hits, "\n".join(hits)

    # Collapse-Regex muss fuer alle vier Pfade vorhanden sein (dev-apply, dev-kustomize,
    # prod-early-apply, prod-kustomize).
    literal = r"s/\$\$([a-zA-Z0-9_({!?])/$\1/g"
    count = 0
    for source in _taskfile_sources(paths):
        count += sum(
            1 for line in source.read_text(encoding="utf-8", errors="ignore").splitlines() if literal in line
        )
    assert count >= 4, f"collapse sed found on {count} lines, expected >= 4"
