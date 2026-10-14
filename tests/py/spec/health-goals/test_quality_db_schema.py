"""Spec tests for quality DB schema, migration and offline fallback (T016507)."""

import json
from pathlib import Path

import pytest


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


def test_health_goal_training_answers_match_retired_ticket_workflow(repo_root):
    """New health-goal examples must not teach removed daemon actions."""
    dataset = repo_root / ".agents/training/dataset.jsonl"
    answers = [row["messages"][-1]["content"]
               for line in dataset.read_text(encoding="utf-8").splitlines()
               if (row := json.loads(line))
               and "health-goals-daemon.sh" in row["messages"][-1]["content"]]
    assert answers
    assert any("quality.repo_health_measurements" in answer for answer in answers)
    for answer in answers:
        assert "scripts/ticket.sh create" not in answer
        assert "--no-wake" not in answer
        assert "--agent plan-worker-qwen35" not in answer


def test_seed_preserves_historical_measurement_timestamp(repo_root, tmp_path, monkeypatch):
    """Seeding metadata must not turn old evidence into today's observation."""
    import importlib.util
    spec = importlib.util.spec_from_file_location('quality_seed', repo_root / 'scripts/sdlc/seed-quality-goals.py')
    seed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed)
    data_dir = tmp_path / 'components/website/src/lib/sdlc'
    data_dir.mkdir(parents=True)
    goal = dict(id='G-TEST', title='History', category='Test', current=5,
                baseline=10, target=0, measured_at='2026-10-08', status='unknown')
    (data_dir / 'goals-data.generated.json').write_text(json.dumps([goal]))
    statements = []
    monkeypatch.setattr(seed, 'get_repo_root', lambda: tmp_path)
    monkeypatch.setattr(seed, 'run_psql', lambda sql: statements.append(sql) or True)

    seed.main()

    measurement_sql = statements[0].split('INSERT INTO quality.repo_health_measurements', 1)[1]
    assert 'measured_at' in measurement_sql
    assert '2026-10-08' in measurement_sql


def _load_seed(repo_root, tmp_path, monkeypatch, goals):
    import importlib.util
    spec = importlib.util.spec_from_file_location('quality_seed', repo_root / 'scripts/sdlc/seed-quality-goals.py')
    seed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed)
    data_dir = tmp_path / 'components/website/src/lib/sdlc'
    data_dir.mkdir(parents=True, exist_ok=True)
    (data_dir / 'goals-data.generated.json').write_text(json.dumps(goals))
    statements = []
    monkeypatch.setattr(seed, 'get_repo_root', lambda: tmp_path)
    monkeypatch.setattr(seed, 'run_psql', lambda sql: statements.append(sql) or True)
    return seed, statements


def test_seed_twice_does_not_duplicate_historical_evidence(repo_root, tmp_path, monkeypatch):
    goal = dict(id='G-TEST', title='History', category='Test', current=5, direction='lower',
                baseline=10, target=0, measured_at='2026-10-08', status='unknown')
    seed, statements = _load_seed(repo_root, tmp_path, monkeypatch, [goal])
    seed.main()
    seed.main()
    assert statements[0] == statements[1], 'Seed ist nicht deterministisch'
    measurement_sql = statements[0].split('INSERT INTO quality.repo_health_measurements', 1)[1]
    assert 'WHERE NOT EXISTS' in measurement_sql
    assert "measured_at = '2026-10-08'::timestamptz" in measurement_sql
    assert 'NOW()' not in measurement_sql


def test_seed_without_honest_timestamp_records_no_measurement(repo_root, tmp_path, monkeypatch):
    goals = [dict(id='G-NOTS', title='x', category='Test', current=5, target=0, measured_at=''),
             dict(id='G-NOVAL', title='y', category='Test', current=None, target=0, measured_at='2026-10-08')]
    seed, statements = _load_seed(repo_root, tmp_path, monkeypatch, goals)
    seed.main()
    assert 'INSERT INTO quality.repo_health_measurements' not in statements[0]
    assert statements[0].count('INSERT INTO quality.repo_health_goals') == 2


def test_seed_reports_failed_database_write(repo_root, tmp_path, monkeypatch):
    seed, _ = _load_seed(repo_root, tmp_path, monkeypatch, [dict(id='G-TEST', title='x', category='T')])
    monkeypatch.setattr(seed, 'run_psql', lambda sql: False)
    with pytest.raises(SystemExit) as exc:
        seed.main()
    assert exc.value.code == 1


def test_definitions_only_initializes_schema_without_importing_history(repo_root, tmp_path, monkeypatch):
    import importlib.util
    import shutil
    spec = importlib.util.spec_from_file_location('quality_seed_definitions', repo_root / 'scripts/sdlc/seed-quality-goals.py')
    seed = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(seed)
    data_dir = tmp_path / 'components/website/src/lib/sdlc'
    data_dir.mkdir(parents=True)
    (data_dir / 'goals-data.generated.json').write_text(json.dumps([dict(
        id='G-TEST', title='Definition', category='Test', current=5, baseline=10,
        target=0, measured_at='2026-10-14', status='achieved')]))
    snapshot = data_dir / 'goals-data.snapshot.json'
    snapshot.write_text('historical snapshot remains untouched')
    migrations = tmp_path / 'scripts/migrations'
    migrations.mkdir(parents=True)
    shutil.copy2(repo_root / 'scripts/migrations/2026-10-12-quality-schema-T016507.sql', migrations)
    statements = []
    monkeypatch.setattr(seed, 'get_repo_root', lambda: tmp_path)
    monkeypatch.setattr(seed, 'run_psql', lambda sql: statements.append(sql) or True)
    seed.main(['--definitions-only', '--initialize-schema'])
    assert 'CREATE TABLE IF NOT EXISTS quality.repo_health_measurements' in statements[0]
    assert 'INSERT INTO quality.repo_health_goals' in statements[0]
    assert 'INSERT INTO quality.repo_health_measurements' not in statements[0]
    assert snapshot.read_text() == 'historical snapshot remains untouched'
    monkeypatch.setenv('DRY_RUN', '1')
    seed.main(['--definitions-only', '--initialize-schema'])
    assert len(statements) == 1
