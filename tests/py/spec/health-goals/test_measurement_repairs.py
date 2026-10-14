"""Exercise corrected measurements at their CLI/file boundaries, without live services."""
import json
import os
from pathlib import Path
import subprocess

import pytest

ROOT = Path(__file__).resolve().parents[4]


def run(args, env=None):
    return subprocess.run(args, cwd=ROOT, env={**os.environ, **(env or {})},
                          text=True, capture_output=True, timeout=20)


@pytest.mark.parametrize(('code', 'count'), [
    ('try {} catch (e) { throw e; }', 0),
    ('try {} catch { if (true) { throw new Error("failed"); } }', 0),
    ('try {} catch (e) { logger.error({ detail: { value: e } }); }', 0),
    ('try {} catch (e) { return { result: null }; }', 1),
    ('try {} catch (e) { const ignored = () => { throw e; }; }', 1),
    ('try {} catch { const text = "throw fake"; /* logger.error() */ }', 1),
])
def test_interface_rethrows_are_visible(tmp_path, code, count):
    source = tmp_path / 'interface.ts'
    source.write_text(code)
    result = run(['node', 'scripts/lib/interface-catch-check.mjs', str(source)])
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(count)


def cli(tmp_path, name, body):
    executable = tmp_path / name
    executable.write_text('#!/bin/bash\n' + body)
    executable.chmod(0o755)
    return {'PATH': f'{tmp_path}:{os.environ["PATH"]}'}


@pytest.mark.parametrize(('items', 'expected'), [
    ([{'spec': {'suspend': True}, 'status': {'lastScheduleTime': '2026-10-01T00:00:00Z'}}], '0'),
    ([{'metadata': {'creationTimestamp': '2026-10-14T00:00:00Z'}, 'spec': {'schedule': '0 0 1 1 *'}, 'status': {}}], '0'),
    ([{'metadata': {'creationTimestamp': '2026-10-13T00:00:00Z'}, 'spec': {'schedule': '0 1 * * *'}, 'status': {}}], '1'),
    ([{'spec': {'schedule': '0 0 1 1 *'}, 'status': {}}], '-'),
    ([{'status': {'lastScheduleTime': '2026-10-01T00:00:00Z'}}], '1'),
    ([{'status': {'lastScheduleTime': '2026-10-01T00:00:00Z', 'lastSuccessfulTime': '2026-10-01T00:00:01Z'}}], '0'),
    ([{'status': {'lastScheduleTime': '2026-10-01T00:00:00Z', 'active': [{'name': 'running'}]}}], '-'),
])
def test_cronjobs_count_terminal_failures(tmp_path, items, expected):
    payload = tmp_path / 'jobs.json'
    payload.write_text(json.dumps({'items': items}))
    env = cli(tmp_path, 'kubectl', 'cat "$JOBS"\n')
    result = run(['bash', 'scripts/lib/cronjob-check.sh'], {**env, 'JOBS': str(payload), 'HG_CRON_NOW': '2026-10-14T12:00:00Z'})
    assert result.stdout.strip() == expected


@pytest.mark.parametrize(('state', 'expected'), [('enabled', '0'), ('disabled', '1'), ('', 'n/a')])
def test_autostart_missing_bus_is_unknown(tmp_path, state, expected):
    units = tmp_path / 'units'
    units.mkdir()
    (units / 'test-llm.service').write_text('[Unit]\n')
    command = tmp_path / 'state'
    command.write_text('#!/bin/bash\nprintf "%s" "$UNIT_STATE"\n')
    command.chmod(0o755)
    result = run(['bash', 'scripts/lib/llm-stack-measure.sh', 'autostart-coverage'], {
        'LLM_MEASURE_UNIT_DIRS': str(units), 'LLM_MEASURE_UNIT_STATE_CMD': str(command),
        'UNIT_STATE': state,
    })
    assert result.stdout.strip() == expected


@pytest.mark.parametrize(('output', 'expected'), [
    ('{"status":"ready","nodes":10,"edges":20}', '1'),
    ('{"status":"ready","nodes":0,"edges":20}', '0'),
    ('not json', '-'),
])
def test_project_status_requests_json_format(tmp_path, output, expected):
    env = cli(tmp_path, 'codebase-memory-mcp', '[[ "$*" == *"--format json"* ]] || exit 3\nprintf "%s" "$INDEX_JSON"\n')
    result = run(['bash', '-c', 'source scripts/lib/health-goals-measure.sh; k3_project_flag'],
                 {**env, 'INDEX_JSON': output})
    assert result.stdout.strip() == expected


def test_drift_matches_rendered_namespace_not_bare_base_name(tmp_path):
    live = tmp_path / 'live.json'
    live.write_text(json.dumps({'items': [{'metadata': {'name': 'brett', 'namespace': 'workspace'},
        'spec': {'template': {'spec': {'containers': [{'name': 'brett', 'readinessProbe': {}}]}}}}]}))
    manifest = tmp_path / 'rendered.yaml'
    manifest.write_text('''kind: Deployment
metadata: {name: brett, namespace: workspace}
spec:
  template:
    spec:
      containers: [{name: brett, readinessProbe: {httpGet: {path: /ready}}}]
---
kind: Deployment
metadata: {name: brett, namespace: workspace-dev}
spec:
  template:
    spec:
      containers: [{name: brett}]
''')
    result = run(['bash', 'scripts/lib/manifest-drift-check.sh', 'probes'], {
        'HG_DRIFT_INPUT': str(live), 'HG_DRIFT_MANIFEST': str(manifest),
    })
    assert result.stdout.strip() == '1'

@pytest.mark.parametrize(('status', 'completed', 'expected'), [(1, True, 0), (1, False, 1), (2, True, 1)])
def test_scan_distinguishes_goal_violation_from_process_failure(tmp_path, status, completed, expected):
    import shutil
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    shutil.copy2(ROOT / 'scripts/health-goals-scan.sh', scripts)
    artifacts = tmp_path / 'components/website/src/lib/sdlc'
    artifacts.mkdir(parents=True)
    (artifacts / 'goals-data.generated.json').write_text('[{"id":"G-TEST"}]')
    checker = scripts / 'health-goals-check.sh'
    checker.write_text('''#!/bin/bash
printf 'G-TEST 5 le 0\\n' > "$HG_VALUES_FILE"
''' + ('printf "complete\\n" > "$HG_RUN_COMPLETE_FILE"\n' if completed else '') + f'exit {status}\n')
    subprocess.run(['git', 'init', '-q', str(tmp_path)], check=True)
    result = subprocess.run(['bash', str(scripts / 'health-goals-scan.sh'), 'G-TEST'],
                            cwd=tmp_path, capture_output=True, text=True, timeout=20)
    assert result.returncode == expected
    if expected == 0:
        assert json.loads(result.stdout)[0]['actual'] == 5
    else:
        assert result.stdout == ''


def test_proxy_503_health_body_is_measured_as_degraded():
    from http.server import BaseHTTPRequestHandler, HTTPServer
    import threading

    class Health(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(503)
            self.end_headers()
            self.wfile.write(b'{"ready":false,"checked":2,"degraded":["local"]}')

        def log_message(self, *args):
            pass

    with HTTPServer(('127.0.0.1', 0), Health) as server:
        worker = threading.Thread(target=server.serve_forever)
        worker.start()
        try:
            result = run(['bash', 'scripts/lib/llm-stack-measure.sh', 'proxy-readiness'], {
                'LLM_PROXY_URL': f'http://127.0.0.1:{server.server_port}',
            })
            assert result.stdout.strip() == '2'
        finally:
            server.shutdown()
            worker.join()


def test_invalid_interface_source_does_not_report_green(tmp_path):
    source = tmp_path / 'broken.ts'
    source.write_text('try { catch (')
    result = run(['node', 'scripts/lib/interface-catch-check.mjs', str(source)])
    assert result.returncode != 0
    assert result.stdout == ''
