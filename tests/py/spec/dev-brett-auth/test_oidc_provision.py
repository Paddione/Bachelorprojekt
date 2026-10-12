"""Regression: Fleet Dev-Brett needs isolated OIDC and session configuration."""
import yaml


def test_dev_brett_has_isolated_oidc_client_and_session_secret(repo_root):
    documents = yaml.safe_load_all((repo_root / "k3d/dev-stack/brett-dev.yaml").read_text())
    deployment = next(doc for doc in documents if doc["kind"] == "Deployment")
    container = deployment["spec"]["template"]["spec"]["containers"][0]
    env = {entry["name"]: entry for entry in container["env"]}
    assert "BRETT_CLIENT_ID" in env, "Dev-Brett has no OIDC client configuration"
    assert env["BRETT_CLIENT_ID"]["value"] == "brett-dev"
    assert env["POCKET_ID_URL"]["value"] == "http://pocket-id.workspace.svc.cluster.local:1411"
    assert env["POCKET_ID_PUBLIC_URL"]["value"] == "https://auth.${PROD_DOMAIN}"
    assert env["BRETT_PUBLIC_URL"]["value"] == "https://${DEV_BRETT_HOST}"
    assert env["POCKET_ID_BRETT_SECRET"]["valueFrom"]["secretKeyRef"] == {
        "name": "dev-oidc-secrets", "key": "POCKET_ID_BRETT_DEV_SECRET"
    }
    assert env["BRETT_SESSION_SECRET"]["valueFrom"]["secretKeyRef"] == {
        "name": "dev-oidc-secrets", "key": "BRETT_SESSION_SECRET"
    }

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import pytest


@pytest.fixture
def helper(repo_root):
    spec = importlib.util.spec_from_file_location('dev_oidc', repo_root / 'scripts/dev-brett-oidc-provision.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def callbacks():
    return {'brett-dev': 'https://brett.dev.example.test/auth/callback',
            'workspace-dev': 'https://dev.example.test/oauth2/callback'}


class FakeProvider:
    url = 'https://auth.example.test'

    def __init__(self, callbacks, failure=None):
        self.callbacks = callbacks
        self.existing = {}
        self.calls = []
        self.failure = failure

    def clients(self):
        self.calls.append(('GET', '/api/oidc/clients'))
        return self.existing

    def request(self, method, path, body=None):
        self.calls.append((method, path))
        if path.endswith('/secrets'):
            identity = path.split('/')[-2]
            if self.failure == identity:
                return 201, {}  # mutation succeeded, response lost/ambiguous
            return 201, {'secret': f'private-{identity}-value'}
        self.existing[body['id']] = body
        return 201, body

    def validate_secret(self, identity, secret, callback):
        assert secret == f'private-{identity}-value'
        self.calls.append(('PROBE', identity))


def test_check_is_read_only_and_does_not_create_receipt(helper, callbacks, tmp_path):
    provider = FakeProvider(callbacks)
    directory = tmp_path / 'not-created'
    receipt = helper.Receipt(directory, readonly=True)
    assert helper.provision(provider, callbacks, {}, receipt) == {'check': True, 'ready': False}
    assert provider.calls == [('GET', '/api/oidc/clients')]
    assert not directory.exists()


def test_apply_creates_only_two_allowed_clients_and_is_idempotent(helper, callbacks, tmp_path):
    provider = FakeProvider(callbacks)
    receipt = helper.Receipt(tmp_path / 'private')
    known = {}
    assert helper.provision(provider, callbacks, known, receipt, apply=True)['ready']
    first = list(provider.calls)
    helper.provision(provider, callbacks, {}, receipt, apply=True)
    assert [call for call in provider.calls[len(first):] if call[0] == 'POST'] == []
    assert [call for call in first if call[0] == 'POST'] == [
        ('POST', '/api/oidc/clients'), ('POST', '/api/oidc/clients/brett-dev/secrets'),
        ('POST', '/api/oidc/clients'), ('POST', '/api/oidc/clients/workspace-dev/secrets')]
    assert receipt.path.stat().st_mode & 0o777 == 0o600
    assert receipt.directory.stat().st_mode & 0o777 == 0o700


@pytest.mark.parametrize('state', ['create_pending', 'created', 'secret_pending'])
def test_ambiguous_transition_never_retries(helper, callbacks, tmp_path, state):
    provider = FakeProvider(callbacks)
    receipt = helper.Receipt(tmp_path / 'private')
    receipt.data['clients']['brett-dev'] = {'state': state, 'callback': callbacks['brett-dev'], 'provider': provider.url}
    receipt.save()
    with pytest.raises(helper.Failure, match='operator_recovery_required'):
        helper.provision(provider, callbacks, {}, receipt, apply=True)
    assert all(call[0] == 'GET' for call in provider.calls)


def test_partial_failure_keeps_first_secret_and_never_reposts(helper, callbacks, tmp_path):
    provider = FakeProvider(callbacks, failure='workspace-dev')
    receipt = helper.Receipt(tmp_path / 'private')
    with pytest.raises(helper.Failure, match='client_secret_response_ambiguous'):
        helper.provision(provider, callbacks, {}, receipt, apply=True)
    saved = json.loads(receipt.path.read_text())['clients']
    assert saved['brett-dev']['secret'] == 'private-brett-dev-value'
    assert saved['workspace-dev']['state'] == 'secret_pending'
    before = len(provider.calls)
    with pytest.raises(helper.Failure, match='operator_recovery_required'):
        helper.provision(provider, callbacks, {}, receipt, apply=True)
    assert not any(call[0] == 'POST' for call in provider.calls[before:])


@pytest.mark.parametrize('drift', ['missing-secret', 'callback', 'public', 'pkce'])
def test_preflight_all_clients_prevents_any_create(helper, callbacks, tmp_path, drift):
    provider = FakeProvider(callbacks)
    client = {'id': 'workspace-dev', 'name': 'workspace-dev', 'callbackURLs': [callbacks['workspace-dev']], 'isPublic': False, 'pkceEnabled': True}
    if drift == 'callback':
        client['callbackURLs'] = ['https://prod.example.test/oauth2/callback']
    elif drift == 'public':
        client['isPublic'] = True
    elif drift == 'pkce':
        client['pkceEnabled'] = False
    provider.existing['workspace-dev'] = client
    receipt = helper.Receipt(tmp_path / 'private')
    expected = 'existing_client_secret_missing' if drift == 'missing-secret' else 'client_configuration_drift'
    with pytest.raises(helper.Failure, match=expected):
        helper.provision(provider, callbacks, {}, receipt, apply=True)
    assert not any(call[0] == 'POST' for call in provider.calls)


def test_allowlist_fails_before_provider_access(helper, tmp_path):
    provider = FakeProvider({})
    with pytest.raises(helper.Failure, match='allowlist'):
        helper.provision(provider, {'brett': 'https://prod.test/callback'}, {}, apply=True)
    assert provider.calls == []


@pytest.mark.parametrize('which', ['directory', 'file', 'lock'])
def test_receipt_symlinks_rejected(helper, tmp_path, which):
    directory = tmp_path / 'private'
    target = tmp_path / 'target'
    target.write_text('must not change')
    if which == 'directory':
        directory.symlink_to(tmp_path, target_is_directory=True)
    else:
        directory.mkdir(mode=0o700)
        (directory / ('receipt.json' if which == 'file' else 'lock')).symlink_to(target)
    with pytest.raises((helper.Failure, OSError)):
        helper.Receipt(directory)
    assert target.read_text() == 'must not change'


def test_insecure_receipt_file_refused(helper, tmp_path):
    directory = tmp_path / 'private'
    directory.mkdir(mode=0o700)
    file = directory / 'receipt.json'
    file.write_text('{}')
    file.chmod(0o644)
    with pytest.raises(helper.Failure, match='file_insecure'):
        helper.Receipt(directory, readonly=True)


def test_pagination_reads_every_page(helper, monkeypatch):
    provider = helper.Provider('https://auth.example.test', 'private-api-key')
    calls = []
    def request(method, path):
        calls.append((method, path))
        page = len(calls)
        return 200, {'data': [{'id': str(page)}], 'pagination': {'currentPage': page, 'totalPages': 2}}
    monkeypatch.setattr(provider, 'request', request)
    assert set(provider.clients()) == {'1', '2'}
    assert len(calls) == 2


def test_duplicate_paginated_clients_fail_closed(helper, monkeypatch):
    provider = helper.Provider('https://auth.example.test', 'private-api-key')
    monkeypatch.setattr(provider, 'request', lambda method, path: (200, {
        'data': [{'id': 'duplicate'}, {'id': 'duplicate'}], 'pagination': {'currentPage': 1, 'totalPages': 1}}))
    with pytest.raises(helper.Failure, match='ambiguous'):
        provider.clients()


@pytest.mark.parametrize('status,error', [(401, 'invalid_client'), (400, 'invalid_request'), (200, 'invalid_grant')])
def test_unverified_secret_fail_closed(helper, monkeypatch, status, error):
    provider = helper.Provider('https://auth.example.test', 'private-api-key')
    monkeypatch.setattr(provider, 'request', lambda *a, **k: (status, {'error': error}))
    with pytest.raises(helper.Failure, match='unverified'):
        provider.validate_secret('brett-dev', 'secret', 'https://dev.test/callback')


def test_invalid_grant_proves_client_auth_only_for_pinned_provider(helper, monkeypatch):
    provider = helper.Provider('https://auth.example.test', 'private-api-key')
    monkeypatch.setattr(provider, 'request', lambda *a, **k: (400, {'error': 'invalid_grant'}))
    provider.validate_secret('brett-dev', 'secret', 'https://dev.test/callback')


def test_no_redirect_or_non_loopback_http(helper):
    with pytest.raises(helper.Failure):
        helper.Provider('http://untrusted.test', 'secret')
    with pytest.raises(helper.Failure, match='redirect'):
        helper.NoRedirect().redirect_request(None, None, None, None, None, None)


def test_subprocess_timeout_error_is_redacted(helper, monkeypatch, capsys):
    def fail(*args, **kwargs):
        raise subprocess.TimeoutExpired('private-secret', 30, stderr=b'private-secret')
    monkeypatch.setattr(helper.subprocess, 'run', fail)
    monkeypatch.setattr(helper, 'targets', lambda: ('https://auth.test', {}))
    assert helper.main(['--check']) == 1
    output = capsys.readouterr().err
    assert 'subprocess_failed' in output
    assert 'private-secret' not in output


def test_cli_boundary_default_check_uses_only_get_and_does_not_echo_credentials(repo_root, tmp_path):
    fake = tmp_path / 'kubectl'
    fake.write_text('#!/usr/bin/env python3\nimport json,sys\nassert sys.argv[1:3] == ["--context", "fleet"]\nassert "get" in sys.argv and "apply" not in sys.argv\nprint(json.dumps({"data": {}}))\n')
    fake.chmod(0o700)
    env = dict(os.environ, PATH=str(tmp_path) + os.pathsep + os.environ['PATH'])
    result = subprocess.run([sys.executable, str(repo_root / 'scripts/dev-brett-oidc-provision.py'),
                             '--receipt-dir', str(tmp_path / 'receipt')], env=env, capture_output=True, text=True)
    assert result.returncode == 1
    assert json.loads(result.stderr)['error'] == 'provider_credential_missing'
    assert not (tmp_path / 'receipt').exists()


def test_strict_fleet_seal_does_not_pass_credentials_in_argv(helper, monkeypatch, tmp_path):
    calls = []
    document = {'kind': 'SealedSecret', 'metadata': {'name': 'dev-oidc-secrets', 'namespace': 'workspace-dev'}, 'spec': {'template': {'metadata': {
        'name': 'dev-oidc-secrets', 'namespace': 'workspace-dev'}}, 'encryptedData': {
        key: 'Ag' + 'x' * 128 for key in [*helper.KEYS.values(), 'BRETT_SESSION_SECRET']}}}
    def fake_run(args, data=None):
        calls.append((args, data))
        return json.dumps(document).encode()
    monkeypatch.setattr(helper, 'run', fake_run)
    monkeypatch.setattr(helper, 'ROOT', tmp_path)
    (tmp_path / 'k3d/dev-stack').mkdir(parents=True)
    helper.seal({key: 'private-secret' for key in helper.KEYS.values()}, 'private-session', b'cert')
    assert '--scope' in calls[0][0] and 'strict' in calls[0][0]
    assert 'private-secret' not in repr(calls[0][0])
    assert 'private-session' not in repr(calls[0][0])
    assert 'private-secret' not in (tmp_path / 'k3d/dev-stack/dev-oidc-secrets.yaml').read_text()


def test_live_http_boundary_apply_then_check_and_reseal_never_repeat_writes(helper, callbacks, tmp_path, monkeypatch, capsys):
    """Real urllib boundary against a fake provider, including token auth."""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import threading
    from urllib.parse import parse_qs, urlsplit
    clients, calls = {}, []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def reply(self, code, body):
            self.send_response(code)
            self.end_headers()
            self.wfile.write(json.dumps(body).encode())
        def do_GET(self):
            calls.append(('GET', self.path))
            assert self.headers['X-API-KEY'] == 'private-api-key'
            assert parse_qs(urlsplit(self.path).query)['pagination[page]'] == ['1']
            self.reply(200, {'data': list(clients.values()), 'pagination': {'totalPages': 1, 'currentPage': 1}})
        def do_POST(self):
            body = self.rfile.read(int(self.headers['Content-Length'])) if self.headers.get('Content-Length') else b''
            calls.append(('POST', self.path))
            if self.path.endswith('/token'):
                form = parse_qs(body.decode())
                assert form['code'] == ['dev-brett-invalid-code']
                identity = form['client_id'][0]
                correct = form['client_secret'] == [f'private-{identity}-value']
                self.reply(400 if correct else 401, {'error': 'invalid_grant' if correct else 'invalid_client'})
            elif self.path.endswith('/secrets'):
                identity = self.path.split('/')[-2]
                self.reply(201, {'secret': f'private-{identity}-value'})
            else:
                client = json.loads(body)
                clients[client['id']] = client
                self.reply(201, client)
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f'http://127.0.0.1:{server.server_port}'
    monkeypatch.setattr(helper, 'targets', lambda: ('https://auth.example.test', callbacks))
    monkeypatch.setattr(helper, 'kube_secret', lambda *a: {'POCKET_ID_API_KEY': 'private-api-key'})
    monkeypatch.setattr(helper, 'run', lambda args, data=None: b'ghcr.io/pocket-id/pocket-id:v2.14.0@sha256:pinned')
    monkeypatch.setattr(helper, 'scalar', lambda *a: 'private-session')
    monkeypatch.setattr(helper, 'fleet_cert', lambda: b'-----BEGIN CERTIFICATE-----\nverified')
    sealed = []
    monkeypatch.setattr(helper, 'seal', lambda known, session, cert: sealed.append(dict(known)))
    arguments = ['--provider-url', url, '--receipt-dir', str(tmp_path / 'private')]
    try:
        assert helper.main([*arguments, '--apply']) == 0
        mutations = [call for call in calls if call[0] == 'POST' and not call[1].endswith('/token')]
        assert len(mutations) == 4
        assert helper.main([*arguments, '--check']) == 0
        assert helper.main([*arguments, '--apply']) == 0
        assert [call for call in calls if call[0] == 'POST' and not call[1].endswith('/token')] == mutations
        assert len(sealed) == 2
        captured = capsys.readouterr()
        assert 'private-' not in captured.out + captured.err
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_same_name_different_server_id_fails_before_create(helper, callbacks, tmp_path):
    provider = FakeProvider(callbacks)
    provider.existing['server-uuid'] = {'id': 'server-uuid', 'name': 'brett-dev'}
    with pytest.raises(helper.Failure, match='name_collision'):
        helper.provision(provider, callbacks, {}, helper.Receipt(tmp_path / 'private'), apply=True)
    assert provider.calls == [('GET', '/api/oidc/clients')]


def test_pagination_query_matches_pinned_pocket_id_contract(helper, monkeypatch):
    provider = helper.Provider('https://auth.example.test', 'private-api-key')
    calls = []
    def request(method, path):
        calls.append(path)
        assert 'pagination%5Bpage%5D=' in path
        return 200, {'data': [], 'pagination': {'currentPage': 1, 'totalPages': 1}}
    monkeypatch.setattr(provider, 'request', request)
    assert provider.clients() == {}
    assert calls == ['/api/oidc/clients?pagination%5Bpage%5D=1']


def test_provider_upgrade_blocks_unverified_token_semantics(helper, monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(helper, 'targets', lambda: ('https://auth.test', {}))
    monkeypatch.setattr(helper, 'kube_secret', lambda *a: {'POCKET_ID_API_KEY': 'private-api-key'})
    monkeypatch.setattr(helper, 'run', lambda *a: b'ghcr.io/pocket-id/pocket-id:v2.15.0@sha256:new')
    assert helper.main(['--check', '--receipt-dir', str(tmp_path / 'absent')]) == 1
    assert json.loads(capsys.readouterr().err)['error'] == 'provider_version_unverified'
    assert not (tmp_path / 'absent').exists()
