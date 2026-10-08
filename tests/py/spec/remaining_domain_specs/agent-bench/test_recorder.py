"""Native migration of tests/spec/agent-bench/recorder.bats (3 cases)."""
import base64
import hashlib
import json
import os
import re
import subprocess
import time
import pytest


@pytest.fixture
def fake_server(repo_root, tmp_path):
    fixtures = repo_root / 'tests/spec/agent-bench/fixtures'
    logfile = tmp_path / 'server.log'
    env = os.environ.copy()
    env.update({'FAKE_OPENAI_SCRIPT': '', 'FAKE_OPENAI_LOG': ''})
    with logfile.open('w') as output:
        process = subprocess.Popen(['node', str(fixtures / 'fake-openai.mjs')], env=env, stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 5
            port = None
            while time.monotonic() < deadline:
                match = re.search(r'FAKE-OPENAI-PORT=([0-9]+)', logfile.read_text())
                if match:
                    port = match.group(1)
                    break
                if process.poll() is not None:
                    break
                time.sleep(0.05)
            assert port, logfile.read_text()
            yield fixtures, f'http://127.0.0.1:{port}'
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def record(run_cmd, fake_server, tmp_path, role, content, name='trace'):
    fixtures, url = fake_server
    request = tmp_path / (name + '.json')
    trace = tmp_path / (name + '.jsonl')
    images = tmp_path / (name + '-images')
    request.write_text(json.dumps({'model': 'fake', 'messages': [{'role': 'user', 'content': content}]}))
    run_cmd(['node', str(fixtures / 'drive-recorder.mjs'), url, role, str(trace), str(images), str(request)]).check(0)
    return trace.read_text(), images


def test_secret_redacted(run_cmd, fake_server, tmp_path):
    secret = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'
    trace, _ = record(run_cmd, fake_server, tmp_path, 'code-worker', f'mein Token {secret} bitte nutzen')
    assert 'REDACTED:github-token' in trace
    assert secret not in trace


def test_image_content_hash(run_cmd, fake_server, tmp_path):
    encoded = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    digest = hashlib.sha256(base64.b64decode(encoded)).hexdigest()
    content = [{'type': 'text', 'text': 'was ist das?'}, {'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + encoded}}]
    trace, images = record(run_cmd, fake_server, tmp_path, 'vision-worker', content)
    assert (images / (digest + '.png')).is_file()
    assert digest in trace
    assert 'image_ref' in trace
    assert encoded not in trace


def test_role_attribution(run_cmd, fake_server, tmp_path):
    planner, _ = record(run_cmd, fake_server, tmp_path, 'planner', 'hallo', 'a')
    reviewer, _ = record(run_cmd, fake_server, tmp_path, 'reviewer', 'hallo', 'b')
    assert '"role":"planner"' in planner
    assert '"role":"reviewer"' in reviewer
    assert '"role":"reviewer"' not in planner
