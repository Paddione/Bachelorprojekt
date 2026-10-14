"""Spec tests for quality DB schema, migration and offline fallback (T016507)."""

from pathlib import Path
import json
import pytest
import subprocess


@pytest.fixture
def repo_root():
    return Path(__file__).resolve().parents[4]


def test_quality_schema_migration_file_exists(repo_root):
    migration = repo_root / "scripts/migrations/2026-10-12-quality-schema-T016507.sql"
    assert migration.is_file(), f"Migration file missing: {migration}"
    sql = migration.read_text(encoding="utf-8")
    assert "CREATE SCHEMA IF NOT EXISTS quality;" in sql
    assert "quality.repo_health_goals" in sql
    assert "quality.repo_health_measurements" in sql


def test_seed_quality_goals_script_exists_and_functional(repo_root):
    seed_script = repo_root / "scripts/sdlc/seed-quality-goals.py"
    assert seed_script.is_file(), f"Seed script missing: {seed_script}"


def test_offline_fallback_snapshot_exists(repo_root):
    snapshot = repo_root / "components/website/src/lib/sdlc/goals-data.snapshot.json"
    assert snapshot.is_file(), f"Fallback snapshot missing: {snapshot}"
    data = json.loads(snapshot.read_text(encoding="utf-8"))
    assert isinstance(data, list)
    assert len(data) >= 100
    ids = {item["id"] for item in data}
    assert "G-RH01" in ids


def test_health_goals_daemon_script_exists(repo_root):
    daemon = repo_root / "scripts/sdlc/health-goals-daemon.sh"
    assert daemon.is_file(), f"Daemon script missing: {daemon}"


def test_health_goals_daemon_help_options(repo_root):
    daemon = repo_root / "scripts/sdlc/health-goals-daemon.sh"
    res = subprocess.run(["bash", str(daemon), "--help"], capture_output=True, text=True)
    assert res.returncode == 0
    assert "--all" in res.stdout
    assert "--no-ticket" in res.stdout
    assert "--no-wake" in res.stdout
    assert "--dry-run" in res.stdout


def test_dataset_generator_contains_repohealth_facts(repo_root):
    gen = repo_root / ".agents/training/generate_dataset.py"
    assert gen.is_file()
    content = gen.read_text(encoding="utf-8")
    assert "quality.repo_health_goals" in content
    assert "health-goals-daemon.sh" in content
    assert "plan-worker-qwen35" in content
