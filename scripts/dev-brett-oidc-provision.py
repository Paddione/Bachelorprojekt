#!/usr/bin/env python3
"""Operator-only Fleet Dev OIDC provisioning; read-only unless --apply.

No automatic retry of writes. Private receipt is the recovery/secret SSOT.
Never delete the receipt or rotate an existing client to repair a lost response.
"""
import argparse
import base64
import fcntl
import http.client
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
KEYS = {'brett-dev': 'POCKET_ID_BRETT_DEV_SECRET',
        'workspace-dev': 'DEV_WORKSPACE_OIDC_SECRET'}
LIMIT = 2 * 1024 * 1024


class Failure(Exception):
    """Only fixed, non-sensitive error codes may cross the CLI boundary."""


def run(args, data=None):
    try:
        result = subprocess.run(args, input=data, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=30, check=True)
        if len(result.stdout) > LIMIT:
            raise Failure('subprocess_response_too_large')
        return result.stdout
    except (subprocess.SubprocessError, OSError):
        raise Failure('subprocess_failed') from None


def kube_secret(namespace, name):
    raw = run(['kubectl', '--context', 'fleet', '-n', namespace, 'get',
               'secret', name, '-o', 'json'])
    try:
        data = json.loads(raw)['data']
        return {key: base64.b64decode(value, validate=True).decode()
                for key, value in data.items()}
    except (ValueError, KeyError, UnicodeError):
        raise Failure('cluster_secret_invalid') from None


def scalar(path, key):
    # This helper accepts only simple scalar values; it never prints YAML data.
    try:
        text = path.read_text()
        matches = re.findall(r'^\s*' + re.escape(key) + r':\s*([^\n#]+)', text, re.M)
        if len(matches) != 1:
            raise Failure('configuration_missing_or_ambiguous')
        value = matches[0].strip()
        if value.startswith('"'):
            value = json.loads(value)
        elif value.startswith("'") and value.endswith("'"):
            value = value[1:-1].replace("''", "'")
        if not value or '\n' in value:
            raise Failure('configuration_invalid')
        return value
    except (OSError, ValueError, UnicodeError):
        raise Failure('configuration_unavailable') from None


def targets():
    config = ROOT / 'environments/dev-cluster.yaml'
    domain = scalar(config, 'PROD_DOMAIN')
    host = scalar(config, 'DEV_BRETT_HOST')
    gate = scalar(config, 'DEV_DOMAIN')
    for value in (domain, host, gate):
        if not re.fullmatch(r'[a-z0-9.-]+', value) or '..' in value:
            raise Failure('host_invalid')
    return 'https://auth.' + domain, {
        'brett-dev': 'https://' + host + '/auth/callback',
        'workspace-dev': 'https://' + gate + '/oauth2/callback'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise Failure('provider_redirect_refused')


class Provider:
    def __init__(self, url, key):
        parsed = urllib.parse.urlsplit(url)
        if (parsed.username or parsed.password or parsed.query or parsed.fragment
                or parsed.path not in ('', '/')
                or not (parsed.scheme == 'https' or
                        (parsed.scheme == 'http' and parsed.hostname == '127.0.0.1'
                         and parsed.port is not None))):
            raise Failure('provider_url_invalid')
        self.url, self.key = url.rstrip('/'), key
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, path, body=None, form=False):
        headers = {'Content-Type': 'application/x-www-form-urlencoded' if form
                   else 'application/json'}
        if not form:
            headers['X-API-KEY'] = self.key
        payload = None if body is None else (urllib.parse.urlencode(body).encode()
                   if form else json.dumps(body).encode())
        request = urllib.request.Request(self.url + path, data=payload,
                                         headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        except (urllib.error.URLError, TimeoutError, OSError):
            raise Failure('provider_request_ambiguous' if method != 'GET'
                          else 'provider_unreachable') from None
        try:
            with response:
                raw = response.read(LIMIT + 1)
                if len(raw) > LIMIT:
                    raise Failure('provider_response_too_large')
                body = json.loads(raw)
                if not isinstance(body, dict):
                    raise Failure('provider_response_invalid')
                return response.code, body
        except (ValueError, UnicodeError, OSError, TimeoutError, http.client.HTTPException):
            raise Failure('provider_response_ambiguous') from None

    def clients(self):
        found = {}
        page = 1
        while page <= 100:
            status, response = self.request('GET', f'/api/oidc/clients?pagination%5Bpage%5D={page}')
            try:
                total = response['pagination']['totalPages']
                current = response['pagination']['currentPage']
                data = response['data']
                if not isinstance(data, list):
                    raise Failure('provider_clients_invalid')
                if status != 200 or current != page or not isinstance(total, int) or not 1 <= total <= 100:
                    raise Failure('provider_pagination_invalid')
                for client in data:
                    identity = client['id']
                    if identity in found:
                        raise Failure('provider_clients_ambiguous')
                    found[identity] = client
            except (TypeError, KeyError):
                raise Failure('provider_clients_invalid') from None
            if page == total:
                return found
            page += 1
        raise Failure('provider_pagination_invalid')

    def validate_secret(self, identity, secret, callback):
        # A deliberately invalid code cannot issue a session. Pocket ID must
        # distinguish invalid_client from invalid_grant; unknown errors stop.
        status, body = self.request('POST', '/api/oidc/token', {
            'grant_type': 'authorization_code', 'code': 'dev-brett-invalid-code',
            'client_id': identity, 'client_secret': secret,
            'redirect_uri': callback}, form=True)
        if status != 400 or body.get('error') != 'invalid_grant':
            raise Failure('client_secret_unverified')


class Receipt:
    def __init__(self, directory, readonly=False):
        self.directory = Path(directory).absolute()
        # Reject symlinks in every ancestor before mkdir/open; directory is
        # owned exclusively by this uid and is never shared with other users.
        for path in (self.directory, *self.directory.parents):
            if path.is_symlink():
                raise Failure('receipt_symlink_refused')
        if self.directory == ROOT or ROOT in self.directory.parents:
            raise Failure('receipt_inside_repository')
        self.data = {'version': 1, 'clients': {}}
        if readonly and not self.directory.exists():
            return
        if not readonly:
            self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        info = self.directory.stat()
        if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise Failure('receipt_directory_insecure')
        self.path = self.directory / 'receipt.json'
        if not readonly:
            self.lock_fd = os.open(self.directory / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            lock_info = os.fstat(self.lock_fd)
            if lock_info.st_uid != os.getuid() or stat.S_IMODE(lock_info.st_mode) != 0o600:
                raise Failure('receipt_lock_insecure')
            try:
                fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Failure('receipt_busy') from None
        if self.path.exists() or self.path.is_symlink():
            fd = os.open(self.path, os.O_RDONLY | os.O_NOFOLLOW)
            info = os.fstat(fd)
            if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != 0o600 or not stat.S_ISREG(info.st_mode):
                os.close(fd)
                raise Failure('receipt_file_insecure')
            with os.fdopen(fd) as handle:
                self.data = json.load(handle)
            if not isinstance(self.data, dict) or self.data.get('version') != 1 or not isinstance(self.data.get('clients'), dict):
                raise Failure('receipt_invalid')

    def close(self):
        fd = getattr(self, 'lock_fd', None)
        if fd is not None:
            os.close(fd)
            self.lock_fd = None

    def save(self):
        if self.path.is_symlink():
            raise Failure('receipt_symlink_refused')
        fd, name = tempfile.mkstemp(dir=self.directory, prefix='.receipt-')
        try:
            with os.fdopen(fd, 'w') as handle:
                os.fchmod(handle.fileno(), 0o600)
                json.dump(self.data, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(name, self.path)
            directory_fd = os.open(self.directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if os.path.exists(name):
                os.unlink(name)


def provision(provider, callbacks, known, receipt=None, apply=False):
    if set(callbacks) != set(KEYS):
        raise Failure('client_allowlist_invalid')
    clients = provider.clients()
    for identity in callbacks:
        matching = [client for client in clients.values() if client.get('name') == identity]
        if any(client.get('id') != identity for client in matching) or len(matching) > 1:
            raise Failure('client_name_collision')
    # Preflight every client before any CREATE. Pending/ambiguous operations
    # never trigger a retry, including when a just-created client is absent.
    for identity, callback in callbacks.items():
        record = receipt.data['clients'].get(identity, {}) if receipt else {}
        if record and (record.get('callback') != callback or record.get('provider') != provider.url):
            raise Failure('receipt_binding_drift')
        if record.get('state') in ('create_pending', 'created', 'secret_pending'):
            raise Failure('operator_recovery_required')
        if identity in clients:
            client = clients[identity]
            if (client.get('name') != identity or client.get('callbackURLs') != [callback] or client.get('isPublic') is not False or
                    client.get('pkceEnabled') is not (identity == 'workspace-dev')):
                raise Failure('client_configuration_drift')
            secret = record.get('secret') or known.get(KEYS[identity])
            if not secret:
                raise Failure('existing_client_secret_missing')
            provider.validate_secret(identity, secret, callback)
            known[KEYS[identity]] = secret
        elif record:
            raise Failure('receipt_client_missing')
    if not apply:
        return {'check': True, 'ready': all(identity in clients for identity in callbacks)}
    if receipt is None:
        raise Failure('receipt_required')
    receipt.save()  # must succeed before first external mutation
    for identity, callback in callbacks.items():
        if identity in clients:
            continue
        record = {'provider': provider.url, 'callback': callback, 'state': 'create_pending'}
        receipt.data['clients'][identity] = record
        receipt.save()
        status, body = provider.request('POST', '/api/oidc/clients', {
            'id': identity, 'name': identity, 'callbackURLs': [callback],
            'logoutCallbackURLs': [], 'isPublic': False, 'pkceEnabled': identity == 'workspace-dev',
            'requiresReauthentication': False, 'requiresPushedAuthorizationRequests': False})
        if status not in (200, 201) or body.get('id') != identity:
            raise Failure('client_create_ambiguous')
        record['state'] = 'created'
        receipt.save()
        record['state'] = 'secret_pending'
        receipt.save()
        status, body = provider.request('POST', f'/api/oidc/clients/{identity}/secrets')
        secret = body.get('secret')
        if status not in (200, 201) or not isinstance(secret, str) or len(secret) < 8:
            raise Failure('client_secret_response_ambiguous')
        record.update(state='complete', secret=secret)
        receipt.save()
        provider.validate_secret(identity, secret, callback)
        known[KEYS[identity]] = secret
    return {'check': False, 'ready': True}


def fleet_cert():
    return run(['kubeseal', '--context', 'fleet', '--controller-namespace', 'sealed-secrets',
                '--controller-name', 'sealed-secrets', '--fetch-cert'])


def seal(known, session, cert):
    data = {key: known[key] for key in KEYS.values()}
    data['BRETT_SESSION_SECRET'] = session
    secret = {'apiVersion': 'v1', 'kind': 'Secret', 'metadata': {
        'name': 'dev-oidc-secrets', 'namespace': 'workspace-dev'}, 'type': 'Opaque',
        'data': {key: base64.b64encode(value.encode()).decode() for key, value in data.items()}}
    with tempfile.NamedTemporaryFile() as handle:
        handle.write(cert)
        handle.flush()
        encrypted = run(['kubeseal', '--cert', handle.name, '--scope', 'strict',
                         '--format', 'json'], json.dumps(secret).encode())
    try:
        document = json.loads(encrypted)
        spec = document['spec']
        for part in (document, spec, spec.get('template', {})):
            if 'data' in part or 'stringData' in part:
                raise Failure('ciphertext_contains_plaintext')
        annotations = document.get('metadata', {}).get('annotations', {})
        if any(annotations.get(key) == 'true' for key in (
                'sealedsecrets.bitnami.com/cluster-wide', 'sealedsecrets.bitnami.com/namespace-wide')):
            raise Failure('ciphertext_scope_invalid')
        if (document['kind'] != 'SealedSecret' or
                document.get('metadata', {}).get('name') != 'dev-oidc-secrets' or
                document.get('metadata', {}).get('namespace') != 'workspace-dev' or
                spec['template']['metadata']['namespace'] != 'workspace-dev' or
                spec['template']['metadata']['name'] != 'dev-oidc-secrets' or
                set(spec['encryptedData']) != set(data) or
                not all(isinstance(value, str) and len(value) > 100 for value in spec['encryptedData'].values())):
            raise Failure('ciphertext_invalid')
    except (KeyError, TypeError, ValueError):
        raise Failure('ciphertext_invalid') from None
    output = ROOT / 'k3d/dev-stack/dev-oidc-secrets.yaml'
    if output.is_symlink():
        raise Failure('ciphertext_symlink_refused')
    output.write_text(json.dumps(document, indent=2) + '\n')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--apply', action='store_true', help='requires explicit operator approval')
    parser.add_argument('--provider-url', help='HTTPS origin or http://127.0.0.1:PORT port-forward')
    parser.add_argument('--receipt-dir', default=str(Path.home() / '.local/state/dev-brett-auth'))
    args = parser.parse_args(argv)
    receipt = None
    try:
        url, callbacks = targets()
        # Check does not create receipt/lock or write any local/provider state.
        receipt = Receipt(args.receipt_dir, readonly=not args.apply)
        key = kube_secret('workspace', 'workspace-secrets').get('POCKET_ID_API_KEY')
        if not key:
            raise Failure('provider_credential_missing')
        image = run(['kubectl', '--context', 'fleet', '-n', 'workspace', 'get',
                     'deployment', 'pocket-id', '-o',
                     'jsonpath={.spec.template.spec.containers[0].image}']).decode()
        if not image.startswith('ghcr.io/pocket-id/pocket-id:v2.14.0@sha256:'):
            raise Failure('provider_version_unverified')
        if args.provider_url and args.provider_url != url:
            parsed = urllib.parse.urlsplit(args.provider_url)
            if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1':
                raise Failure('provider_origin_refused')
        provider = Provider(args.provider_url or url, key)
        known = {}
        if args.apply:
            session = scalar(ROOT / 'environments/.secrets/dev.yaml', 'BRETT_OIDC_SECRET')
            cert = fleet_cert()
            if not cert.startswith(b'-----BEGIN CERTIFICATE-----'):
                raise Failure('fleet_certificate_invalid')
        result = provision(provider, callbacks, known, receipt, args.apply)
        if args.apply:
            seal(known, session, cert)
        print(json.dumps(result))
        return 0
    except (Failure, OSError, ValueError, KeyError, TypeError) as error:
        code = str(error) if isinstance(error, Failure) else 'operation_failed'
        print(json.dumps({'ok': False, 'error': code}), file=sys.stderr)
        return 1
    finally:
        if receipt is not None:
            receipt.close()


if __name__ == '__main__':
    sys.exit(main())
