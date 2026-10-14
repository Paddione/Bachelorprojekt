"""Execute nightly workflow shell steps with isolated scanner, network and DB edges."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[4]
WORKFLOW = yaml.safe_load((ROOT / '.github/workflows/health-goals.yml').read_text())


def step(name):
    return next(item['run'] for item in WORKFLOW['jobs']['measure']['steps'] if item.get('name') == name)


@pytest.fixture
def nightly(tmp_path):
    artifact = tmp_path / 'components/website/src/lib/sdlc'
    artifact.mkdir(parents=True)
    shutil.copy2(ROOT / 'components/website/src/lib/sdlc/goals-data.generated.json', artifact)
    (artifact / 'goals-data.snapshot.json').write_text('historical snapshot')
    for file in ['sdlc/seed-quality-goals.py', 'sdlc/health-goals-daemon.sh',
                 'health-goals-scan.sh', 'lib/health-goals-record.py',
                 'migrations/2026-10-12-quality-schema-T016507.sql']:
        target = tmp_path / 'scripts' / file
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / 'scripts' / file, target)
    shutil.copy2(ROOT / 'Taskfile.yml', tmp_path)
    checker = tmp_path / 'scripts/health-goals-check.sh'
    checker.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$SCAN_LOG"
printf 'G-RH01 5 le 0\\n' > "$HG_VALUES_FILE"
printf 'complete\\n' > "$HG_RUN_COMPLETE_FILE"
exit 1
''')
    binary = tmp_path / 'bin'
    binary.mkdir()
    def executable(name, body):
        path = binary / name
        path.write_text('#!/bin/bash\n' + body)
        path.chmod(0o755)
    executable('kubectl', '''if [[ "$*" == *"port-forward"* ]]; then exec sleep 60
elif [[ "$*" == *"get pod"* ]]; then echo fixture-db
elif [[ "$*" == *"exec"* ]]; then cat >> "$SQL_LOG"
else exit 2; fi
''')
    executable('curl', 'exit 0\n')
    executable('task', '''[[ -s "$HG_VALUES_FILE" ]] || exit 9
printf '%s\\n' "$*" >> "$UPDATE_LOG"
''')
    subprocess.run(['git', 'init', '-q', str(tmp_path)], check=True)
    runner = tmp_path / 'runner'
    (runner / 'health-goals').mkdir(parents=True)
    env = {**os.environ, 'PATH': f'{binary}:{os.environ["PATH"]}', 'CI': 'true',
           'RUNNER_TEMP': str(runner), 'GITHUB_OUTPUT': str(tmp_path / 'output'),
           'SCAN_LOG': str(tmp_path / 'scan.log'), 'SQL_LOG': str(tmp_path / 'sql.log'),
           'UPDATE_LOG': str(tmp_path / 'update.log'), 'TICKET_CTX': 'fleet', 'TICKET_NS': 'workspace'}
    def run_step(name, dry='0'):
        return subprocess.run(['bash', '-euo', 'pipefail', '-c', step(name)],
            cwd=tmp_path, env={**env, 'DRY_RUN': dry}, text=True, capture_output=True, timeout=20)
    return tmp_path, run_step, executable


def test_nightly_measures_once_then_persists_fresh_packet(nightly):
    root, run_step, _ = nightly
    measured = run_step('Measure health goals')
    assert measured.returncode == 0, measured.stderr
    stored = run_step('Persist fresh measurements to the website database')
    assert stored.returncode == 0, stored.stderr
    scans = (root / 'scan.log').read_text().splitlines()
    assert len(scans) == 1
    assert 'G-WT01' not in scans[0] and 'G-LLM01' not in scans[0]
    sql = (root / 'sql.log').read_text()
    assert 'CREATE TABLE IF NOT EXISTS quality.repo_health_goals' in sql
    assert sql.count('INSERT INTO quality.repo_health_measurements') == 111
    assert "VALUES ('G-RH01', 5, 'at_risk'" in sql
    assert "'historical_seed'" not in sql
    measurements = sql.split('INSERT INTO quality.repo_health_measurements', 1)[1]
    assert "VALUES ('G-WT01'" not in measurements
    assert (root / 'components/website/src/lib/sdlc/goals-data.snapshot.json').read_text() == 'historical snapshot'


def test_nightly_dry_run_cannot_write_database_even_if_persistence_step_is_called(nightly):
    root, run_step, _ = nightly
    assert run_step('Measure health goals', '1').returncode == 0
    result = run_step('Persist fresh measurements to the website database', '1')
    assert result.returncode == 0, result.stderr
    assert not (root / 'sql.log').exists()
    assert (root / 'update.log').read_text().strip().endswith('--full --dry-run')


def test_invalid_completion_packet_is_not_recorded(nightly):
    root, run_step, _ = nightly
    assert run_step('Measure health goals').returncode == 0
    (root / 'runner/health-goals/complete.txt').write_text('partial')
    result = run_step('Persist fresh measurements to the website database')
    assert result.returncode != 0
    assert not (root / 'sql.log').exists()


def test_optional_audit_failure_removes_partial_results_and_keeps_other_measurements(nightly):
    root, run_step, executable = nightly
    executable('node', 'printf invalid > "$2"\nexit 1\n')
    executable('npx', '''for arg in "$@"; do
  if [[ "$arg" == --output-path=* ]]; then printf invalid > "${arg#*=}"; fi
done
exit 1
''')
    result = run_step('Collect machine-readable browser measurements')
    assert result.returncode == 0, result.stderr
    assert '::warning::' in result.stdout
    reports = root / 'runner/health-goals'
    assert not (reports / 'axe.json').exists()
    assert not (reports / 'lighthouse.json').exists()
    assert not list(reports.glob('lh-*.json'))


def test_missing_prometheus_does_not_abort_unrelated_goal_measurements(nightly):
    root, run_step, executable = nightly
    executable('curl', 'exit 1\n')
    executable('sleep', 'exit 0\n')
    result = run_step('Measure health goals')
    assert result.returncode == 0, result.stderr
    assert '::warning::Prometheus is unavailable' in result.stdout
    assert len((root / 'scan.log').read_text().splitlines()) == 1


def test_ci_id_selection_requires_a_real_local_only_registry(tmp_path):
    artifact = ROOT / 'components/website/src/lib/sdlc/goals-data.generated.json'
    broken = tmp_path / 'Taskfile.yml'
    broken.write_text('vars: {}\n')
    result = subprocess.run(['python3', str(ROOT / 'scripts/lib/health-goals-record.py'),
                             '--ids', str(artifact), str(broken)], text=True, capture_output=True)
    assert result.returncode != 0
    assert result.stdout == ''


def test_reused_packet_keeps_its_observation_time(nightly):
    root, run_step, _ = nightly
    assert run_step('Measure health goals').returncode == 0
    completion = root / 'runner/health-goals/complete.txt'
    from datetime import datetime, timezone
    observed = datetime(2026, 10, 8, 12, 30, tzinfo=timezone.utc).timestamp()
    os.utime(completion, (observed, observed))
    result = run_step('Persist fresh measurements to the website database')
    assert result.returncode == 0, result.stderr
    sql = (root / 'sql.log').read_text()
    assert "'2026-10-08T12:30:00+00:00'::timestamptz" in sql
