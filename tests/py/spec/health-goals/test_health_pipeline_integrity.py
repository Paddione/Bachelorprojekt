"""Execute the daemon with isolated scanner and database command boundaries."""
import json
import os
from pathlib import Path
import shutil
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture
def daemon(tmp_path):
    scripts = tmp_path / 'scripts'
    (scripts / 'sdlc').mkdir(parents=True)
    artifact = tmp_path / 'components/website/src/lib/sdlc'
    artifact.mkdir(parents=True)
    (artifact / 'goals-data.generated.json').write_text(json.dumps([{'id': f'G-TEST{i}'} for i in range(122)]))
    shutil.copy2(ROOT / 'scripts/sdlc/health-goals-daemon.sh', scripts / 'sdlc')
    # Copy optional extracted helpers as the implementation evolves.
    if (ROOT / 'scripts/lib').exists():
        shutil.copytree(ROOT / 'scripts/lib', scripts / 'lib')
    scanner = scripts / 'health-goals-scan.sh'
    scanner.write_text('''#!/bin/bash
printf '%s\\n' "$@" > "$SCAN_ARGS"
cat "$SCAN_PAYLOAD"
echo scanner-diagnostic >&2
exit "${SCAN_EXIT:-0}"
''')
    bin_dir = tmp_path / 'bin'
    bin_dir.mkdir()
    kubectl = bin_dir / 'kubectl'
    kubectl.write_text('''#!/bin/bash
if [[ " $* " == *" get pod "* ]]; then
  echo shared-db-test
else
  cat > "$SQL_CAPTURE"
  exit "${DB_EXIT:-0}"
fi
''')
    kubectl.chmod(0o755)
    payload = tmp_path / 'payload.json'
    sql = tmp_path / 'sql'
    args = tmp_path / 'args'

    def run(items, ids=(), **overrides):
        payload.write_text(json.dumps(items))
        env = dict(os.environ, PATH=f'{bin_dir}:{os.environ["PATH"]}',
                   SCAN_PAYLOAD=str(payload), SQL_CAPTURE=str(sql), SCAN_ARGS=str(args))
        env.update({k: str(v) for k, v in overrides.items()})
        result = subprocess.run(['bash', str(scripts / 'sdlc/health-goals-daemon.sh'), *ids],
                                env=env, text=True, capture_output=True, timeout=15)
        return result, sql.read_text() if sql.exists() else '', args.read_text()
    return run


@pytest.mark.parametrize(('cmp', 'actual', 'target', 'achieved'), [
    ('le', 5, 0, False), ('le', 0, 0, True),
    ('ge', 2, 5, False), ('ge', 7, 5, True),
    ('eq', 2, 5, False), ('eq', 7, 5, False), ('eq', 5, 5, True),
])
def test_daemon_records_comparison_truth(daemon, cmp, actual, target, achieved):
    result, sql, _ = daemon([dict(id='G-TEST', measurable=True, actual=actual,
                                  target=target, cmp=cmp)], ids=['G-TEST'])
    assert result.returncode == 0, result.stderr
    assert 'INSERT INTO quality.repo_health_measurements' in sql
    assert ("'achieved'" in sql) is achieved, sql


@pytest.mark.parametrize(('failure', 'code'), [('SCAN_EXIT', 1), ('DB_EXIT', 1)])
def test_daemon_propagates_external_failure(daemon, failure, code):
    result, _, _ = daemon([dict(id='G-TEST', measurable=True, actual=0, target=0, cmp='le')],
                          ids=['G-TEST'], **{failure: code})
    assert result.returncode != 0
    assert 'measurements recorded' not in result.stdout


def test_default_scan_does_not_hardcode_four_anchor_ids(daemon):
    result, _, args = daemon([])
    assert result.returncode == 0, result.stderr
    assert len(args.splitlines()) == 122


def test_unmeasurable_sample_never_records_numeric_green(daemon):
    result, sql, _ = daemon([dict(id='G-TEST', measurable=False, actual=0, target=0, cmp='le')],
                            ids=['G-TEST'])
    assert result.returncode == 0, result.stderr
    assert "'achieved'" not in sql

@pytest.mark.parametrize('bad_value', [float('nan'), float('inf'), True])
def test_daemon_rejects_nonfinite_or_boolean_measurements(daemon, bad_value):
    result, _, _ = daemon([dict(id='G-TEST', measurable=True, actual=bad_value,
                                target=0, cmp='le')], ids=['G-TEST'])
    assert result.returncode != 0
    assert 'measurements recorded' not in result.stdout
