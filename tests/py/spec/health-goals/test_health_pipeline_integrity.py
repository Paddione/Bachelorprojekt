"""Execute the daemon with isolated scanner and database command boundaries."""
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture
def daemon(tmp_path):
    scripts = tmp_path / 'scripts'
    (scripts / 'sdlc').mkdir(parents=True)
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
                                env=env, text=True, capture_output=True, timeout=15, check=False)
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
    assert args.splitlines() != ['G-RH01', 'G-CQ02', 'G-GIT01', 'G-SIZE03']


def test_unmeasurable_sample_never_records_numeric_green(daemon):
    result, sql, _ = daemon([dict(id='G-TEST', measurable=False, actual=0, target=0, cmp='le')],
                            ids=['G-TEST'])
    assert result.returncode == 0, result.stderr
    assert "'achieved'" not in sql


def test_default_scan_requests_explicit_full_mode(daemon):
    result, _, args = daemon([])
    assert result.returncode == 0, result.stderr
    assert args.splitlines() == ['--all']


@pytest.mark.parametrize('payload', ['{"not": "a list"}', 'kein json'])
def test_daemon_rejects_unusable_scan_output(daemon, tmp_path, payload):
    daemon([])  # legt Scanner, kubectl-Stub und Payload-Datei an
    (tmp_path / 'payload.json').write_text(payload)
    result = subprocess.run(['bash', str(tmp_path / 'scripts/sdlc/health-goals-daemon.sh')],
                            env=dict(os.environ, PATH=f'{tmp_path / "bin"}:{os.environ["PATH"]}',
                                     SCAN_PAYLOAD=str(tmp_path / 'payload.json'),
                                     SQL_CAPTURE=str(tmp_path / 'sql2'), SCAN_ARGS=str(tmp_path / 'args')),
                            text=True, capture_output=True, timeout=15, check=False)
    assert result.returncode != 0
    assert 'measurements recorded' not in result.stdout
    assert not (tmp_path / 'sql2').exists()


def test_daemon_refuses_injected_goal_id(daemon):
    result, sql, _ = daemon([dict(id="G-X'); DROP TABLE x; --", measurable=True,
                                  actual=0, target=0, cmp='le')], ids=['G-X'])
    assert result.returncode != 0
    assert 'DROP TABLE' not in sql


def test_unmeasurable_sample_is_recorded_as_unknown_without_value(daemon):
    result, sql, _ = daemon([dict(id='G-TEST', measurable=False)], ids=['G-TEST'])
    assert result.returncode == 0, result.stderr
    assert "('G-TEST', NULL, 'unknown'" in sql


@pytest.fixture
def scan_repo(tmp_path):
    """Isoliertes git-Repo mit echtem Scanner und Checker als Prozessgrenze."""
    repo = tmp_path / 'repo'
    (repo / 'scripts').mkdir(parents=True)
    shutil.copy2(ROOT / 'scripts/health-goals-scan.sh', repo / 'scripts')
    data = repo / 'components/website/src/lib/sdlc'
    data.mkdir(parents=True)
    (data / 'goals-data.generated.json').write_text(json.dumps(
        [{'id': gid} for gid in ('G-AA01', 'G-BB02', 'G-CC03')]))
    (repo / 'scripts/health-goals-check.sh').write_text('''#!/bin/bash
for a in "$@"; do case "$a" in --only=*) echo "$a" > only.txt ;; esac; done
echo "G-AA01 0 le 0" > "$HG_VALUES_FILE"
echo "G-CC03 9 ge 5" >> "$HG_VALUES_FILE"
exit 1
''')
    subprocess.run(['git', 'init', '-q', str(repo)], check=True, capture_output=True)
    return repo


def test_full_scan_reports_every_defined_goal(scan_repo):
    result = subprocess.run(['bash', 'scripts/health-goals-scan.sh', '--all'], cwd=scan_repo,
                            text=True, capture_output=True, timeout=15, check=False)
    assert result.returncode == 0, result.stderr
    out = json.loads(result.stdout)
    assert [e['id'] for e in out] == ['G-AA01', 'G-BB02', 'G-CC03']
    assert out[1] == {'id': 'G-BB02', 'measurable': False}
    assert (scan_repo / 'only.txt').read_text().strip() == '--only=G-AA01,G-BB02,G-CC03'


def test_full_scan_and_explicit_ids_are_exclusive(scan_repo):
    result = subprocess.run(['bash', 'scripts/health-goals-scan.sh', '--all', 'G-AA01'], cwd=scan_repo,
                            text=True, capture_output=True, timeout=15, check=False)
    assert result.returncode == 2
    assert result.stdout == ''
