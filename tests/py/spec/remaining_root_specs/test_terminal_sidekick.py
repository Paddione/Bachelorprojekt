"""Native migration of tests/spec/terminal-sidekick.bats; structural guards."""
import os
import re
import pytest

@pytest.mark.parametrize(('path', 'patterns'), [
    ('k3d/terminal-sidekick.yaml', [r'ip:\s*"\$\{TERMINAL_OVERLAY_IP\}"']),
    ('k3d/oauth2-proxy-terminal.yaml', ['client-id=terminal-sidekick', 'allowed-group=terminal-admins', 'oidc-groups-claim=groups', 'upstream=http://terminal-bridge:7681']),
    ('k3d/ingress.yaml', [r'host:\s*terminal\.localhost']),
    ('k3d/kustomization.yaml', [r'terminal-sidekick\.yaml', r'oauth2-proxy-terminal\.yaml']),
    ('k3d/pocket-id-client-seed.yaml', [r'terminal-sidekick\|SECRET_terminal\|POCKET_ID_TERMINAL_SECRET\|\$\$\{SCHEME\}://terminal\.\$\$\{SUFFIX\}/oauth2/callback']),
    ('prod/patch-oauth2-proxy-terminal.yaml', ['cookie-samesite=none', 'cookie-secure=true', 'allowed-group=terminal-admins', r'redirect-url=https://terminal\.\$\{PROD_DOMAIN\}/oauth2/callback']),
])
def test_manifest_configuration(repo_root, path, patterns):
    text = (repo_root / path).read_text()
    for pattern in patterns:
        assert re.search(pattern, text)

def test_selectorless_bridge(repo_root):
    text = (repo_root / 'k3d/terminal-sidekick.yaml').read_text()
    assert re.search(r'name:\s*terminal-bridge', text)
    assert re.search(r'port:\s*7681', text)
    assert not re.search(r'^\s*selector:', text, re.M)

def test_domain_keys(repo_root):
    assert re.search(r'TERMINAL_HOST:\s*"terminal\.localhost"', (repo_root / 'k3d/configmap-domains.yaml').read_text())
    assert re.search(r'TERMINAL_HOST:\s*"terminal\.\$\{PROD_DOMAIN\}"', (repo_root / 'prod/configmap-domains.yaml').read_text())

def test_no_brand_domains(repo_root):
    for path in ['k3d/terminal-sidekick.yaml', 'k3d/oauth2-proxy-terminal.yaml']:
        text = (repo_root / path).read_text()
        assert text
        assert not re.search(r'terminal\.(mentolder|korczewski)\.de', text)

def test_overlay_registered(repo_root):
    assert re.search(r'wg_ip:\s*"10\.20\.0\.10"', (repo_root / 'wireguard/wg-mesh-nodes.yaml').read_text())
    assert re.search(r'name:\s*TERMINAL_OVERLAY_IP', (repo_root / 'environments/schema.yaml').read_text())

def test_prod_ingress_and_patch(repo_root):
    assert re.search(r'host:\s*terminal\.\$\{PROD_DOMAIN\}', (repo_root / 'prod/ingress.yaml').read_text())
    assert 'patch-oauth2-proxy-terminal.yaml' in (repo_root / 'prod/kustomization.yaml').read_text()

def test_host_script(repo_root):
    path = repo_root / 'scripts/terminal-sidekick-host.sh'
    assert path.is_file()
    assert os.access(path, os.X_OK)
    text = path.read_text()
    for expected in ['ttyd', '--writable', '--interface', 'opencode', 'hermes', 'claude', 'agy', 'has-session']:
        assert expected in text
    assert not re.search(r'interface[= ]0\.0\.0\.0', text)
