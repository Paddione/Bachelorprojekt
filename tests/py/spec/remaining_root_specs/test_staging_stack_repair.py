"""Native migration of tests/spec/staging-stack-repair.bats; structural guards."""
import re

def test_website_owner(repo_root):
    assert 'OWNER TO website' in (repo_root / 'k3d/shared-db.yaml').read_text()

def test_ensure_failure_not_swallowed(repo_root):
    text = (repo_root / 'k3d/shared-db.yaml').read_text()
    assert 'ensure-' in text
    assert not re.search(r'ensure-[a-z-]+-schema\.sh \|\| true', text)

def test_update_grant(repo_root):
    assert re.search(r'GRANT [A-Z, ]*UPDATE[A-Z, ]* ON tickets\.llm_proxy_request_log TO website', (repo_root / 'scripts/migrations/2026-08-10-llm-proxy-request-log.sql').read_text())

def test_staging_nextcloud_host(repo_root):
    lines = re.findall(r'^\s*NEXTCLOUD_DB_HOST:.*$', (repo_root / 'environments/staging.yaml').read_text(), re.M)
    assert lines
    assert all('.workspace.svc' not in line for line in lines)

def test_required_sealed_keys(repo_root):
    text = (repo_root / 'environments/sealed-secrets/staging.yaml').read_text()
    for key in ['SESSIONS_CRON_TOKEN', 'FILEN_EMAIL', 'FILEN_PASSWORD', 'POCKET_ID_SESSION_HUB_SECRET', 'POCKET_ID_GRAFANA_SECRET', 'POCKET_ID_WEBSITE_SECRET']:
        assert re.search(r'^\s+' + key + ':', text, re.M)
