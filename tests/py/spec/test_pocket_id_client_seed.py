"""Tests migrating tests/spec/pocket-id-* client seed specs to pytest."""

import os
import re
import subprocess
from pathlib import Path
import pytest
import yaml


def _extract_seed_script(manifest_path: Path) -> str:
    content = manifest_path.read_text()
    lines = content.splitlines()
    seed_lines = []
    recording = False
    for line in lines:
        if 'SCHEME="${POCKET_ID_FRONTEND_URL%%://*}"' in line:
            recording = True
        if recording:
            seed_lines.append(line)
            if 'echo "seed complete"' in line:
                break
    # de-indent (strip leading 14 spaces if present) and replace $$ with $
    res = []
    for l in seed_lines:
        cleaned = re.sub(r"^\s{14}", "", l)
        res.append(cleaned.replace("$$", "$"))
    return "\n".join(res)


def _get_row_names(seed_script: str) -> list[str]:
    # Extract ROW_NAMES from ROWS="..."
    match = re.search(r'ROWS="([^"]+)"', seed_script, re.DOTALL)
    if not match:
        return []
    rows_str = match.group(1)
    names = []
    for line in rows_str.strip().splitlines():
        if "|" in line:
            names.append(line.split("|")[0].strip())
    return names


def _make_clients_fixture(template: str, row_names: list[str]) -> str:
    objs = []
    for name in row_names:
        objs.append(template % (name, name))
    return '{"data":[' + ",".join(objs) + '],"pagination":{"totalPages":1,"totalItems":19,"currentPage":1,"itemsPerPage":20}}'


CLIENT_V214 = '{"id":"%s","name":"%s","description":"","hasLogo":false,"launchURL":null,"callbackURLs":["https://x.example.test/oauth2/callback"],"logoutCallbackURLs":[],"isPublic":false,"credentials":{"secrets":[{"id":"7f3e","prefix":"","createdAt":"2026-08-23T17:20:42Z","expiresAt":null,"isActive":true}]},"isGroupRestricted":false}'
CLIENT_REORDERED = '{"id":"%s","description":"","hasLogo":false,"name":"%s","callbackURLs":[],"credentials":{"secrets":[{"id":"7f3e","isActive":true}]}}'
GROUPS_V214 = '{"data":[{"id":"2535036c-15fc-439d-811a-89805b41e19e","friendlyName":"Workspace Users","name":"workspace-users","customClaims":[],"userCount":0,"ldapId":null,"createdAt":"2026-08-23T17:18:24.820535Z"},{"id":"7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9","friendlyName":"Workspace Owners","name":"workspace-owners","customClaims":[],"userCount":0,"ldapId":null,"createdAt":"2026-10-07T00:00:00Z"}],"pagination":{"totalPages":1,"totalItems":2,"currentPage":1,"itemsPerPage":20}}'
GROUPS_LEGACY = '{"data":[{"id":"g-legacy","name":"workspace-users","friendlyName":"Workspace Users"},{"id":"g-legacy-owners","name":"workspace-owners","friendlyName":"Workspace Owners"}],"pagination":{"totalPages":1,"totalItems":2,"currentPage":1,"itemsPerPage":20}}'


def _setup_curl_stub(stub_dir: Path):
    curl_log = stub_dir / "curl.log"
    curl_log.write_text("")
    curl_script = stub_dir / "curl"
    curl_script.write_text("""#!/usr/bin/env bash
method=GET; url=""; wcode=0
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift ;;
    -w) wcode=1; shift ;;
    -H|-d|-o|--retry|--retry-delay|--connect-timeout|--cacert) shift ;;
    http*) url="$1" ;;
  esac
  shift
done
echo "$method $url" >> "$CURL_LOG"
case "$method $url" in
  "GET "*/api/oidc/clients*)
    if [ "$wcode" = 1 ]; then printf 200; exit 0; fi
    printf '%s' "$FIXTURE_CLIENTS" ;;
  "PUT "*/api/oidc/clients/*) printf '{}' ;;
  "GET "*/api/user-groups*) printf '%s' "$FIXTURE_GROUPS" ;;
  "POST "*) echo "curl: (22) The requested URL returned error: 409" >&2; exit 22 ;;
  *) echo "stub: unexpected $method $url" >&2; exit 99 ;;
esac
""")
    curl_script.chmod(0o755)
    return curl_log


def test_pocket_id_auth_header(repo_root: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    text = manifest.read_text()
    assert re.search(r'AUTH="X-API-KEY: [\$][\$]?\{POCKET_ID_API_KEY\}"', text), (
        "admin API auth must use X-API-KEY header"
    )
    assert not re.search(r'AUTH="Authorization: Bearer', text), (
        "no remaining Authorization Bearer for admin API"
    )


def test_pocket_id_early_abort(repo_root: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    text = manifest.read_text()
    lines = text.splitlines()

    rows_loop_idx = next(i for i, l in enumerate(lines) if 'echo "$ROWS" | while' in l)
    auth_check_idx = next(i for i, l in enumerate(lines) if "http_code" in l)
    assert auth_check_idx < rows_loop_idx, "auth check must happen before ROWS loop"

    # Check 401/403 branch
    auth_snippet = "\n".join(lines[auth_check_idx:auth_check_idx + 25])
    assert re.search(r'401.*403|403.*401|"401"\)|"403"\)', auth_snippet)

    # T002676: Bootstrap-Runbook mention
    assert "runbooks/pocket-id-bootstrap.md" in text

    # auth-check handles unexpected status (2xx branch and wildcard *)
    assert "2??" in auth_snippet
    assert "*)" in auth_snippet

    # bootstrap runbook exists
    runbook = repo_root / "docs" / "runbooks" / "pocket-id-bootstrap.md"
    assert runbook.is_file()


def test_pocket_id_pagination(repo_root: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    text = manifest.read_text()
    assert "pagination%5Bpage%5D" in text or "pagination[page]" in text
    assert "totalPages" in text


def test_pocket_id_secret_writeback(repo_root: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    rbac = repo_root / "k3d" / "pocket-id-client-seed-rbac.yaml"
    kust = repo_root / "k3d" / "kustomization.yaml"

    m_text = manifest.read_text()
    # Check existing-client branch does not call /secret
    match = re.search(r'-X PUT -H "\$AUTH" -H "\$CT"(.*?)(?:else|\n\s+if)', m_text, re.DOTALL)
    assert match
    assert '/secret" </dev/null)' not in match.group(1)

    assert re.search(r'patch_secret "\$secret_key" "\$plaintext"', m_text)
    assert "${KSA_DIR}/token" in m_text
    assert "serviceAccountName: pocket-id-client-seed" in m_text

    r_text = rbac.read_text()
    assert re.search(r'resourceNames:\s*\["workspace-secrets"\]', r_text)
    assert 'verbs: ["get", "patch"]' in r_text or 'verbs:\n  - "get"\n  - "patch"' in r_text

    assert "pocket-id-client-seed-rbac.yaml" in kust.read_text()


def test_pocket_id_timeout_and_backoff(repo_root: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    text = manifest.read_text()
    assert not re.search(r'if \[ "\$i" -ge 60 \];', text)
    assert not re.search(r'backoffLimit: 5\b', text)


def test_pocket_id_service_endpoint_isolation(repo_root: Path):
    svc_manifest = repo_root / "k3d" / "pocket-id.yaml"
    seed_manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"

    svc_docs = yaml.safe_load_all(svc_manifest.read_text())
    svc_selector = None
    for doc in svc_docs:
        if doc and doc.get("kind") == "Service" and doc.get("metadata", {}).get("name") == "pocket-id":
            svc_selector = doc.get("spec", {}).get("selector", {}).get("app")
            break
    assert svc_selector is not None, "Service pocket-id must have app selector"

    seed_docs = yaml.safe_load_all(seed_manifest.read_text())
    seed_tmpl_label = None
    for doc in seed_docs:
        if doc and doc.get("kind") == "Job":
            seed_tmpl_label = (
                doc.get("spec", {})
                .get("template", {})
                .get("metadata", {})
                .get("labels", {})
                .get("app")
            )
            break
    assert seed_tmpl_label is not None, "Seed job template must have app label"
    assert seed_tmpl_label != svc_selector, (
        f"Seed job pod template label '{seed_tmpl_label}' matches Service selector '{svc_selector}'"
    )


def test_pocket_id_group_lookup_v214(repo_root: Path, tmp_path: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    seed_script = _extract_seed_script(manifest)
    seed_file = tmp_path / "seed.sh"
    seed_file.write_text(seed_script)
    row_names = _get_row_names(seed_script)
    assert row_names

    curl_log = _setup_curl_stub(tmp_path)

    # Run seed script with v214 groups
    env = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "CURL_LOG": str(curl_log),
        "FIXTURE_CLIENTS": _make_clients_fixture(CLIENT_V214, row_names),
        "FIXTURE_GROUPS": GROUPS_V214,
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
        "SECRET_docs": "s3cret",
    }
    res = subprocess.run(["sh", "-ec", seed_script], env=env, capture_output=True, text=True)
    assert res.returncode == 0, f"seed script failed: {res.stdout}\n{res.stderr}"
    assert "group workspace-users exists (id=2535036c-15fc-439d-811a-89805b41e19e)" in res.stdout
    log_content = curl_log.read_text()
    assert "POST " not in log_content


def test_pocket_id_client_lookup_reordered(repo_root: Path, tmp_path: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    seed_script = _extract_seed_script(manifest)
    seed_file = tmp_path / "seed.sh"
    seed_file.write_text(seed_script)
    row_names = _get_row_names(seed_script)

    curl_log = _setup_curl_stub(tmp_path)

    env = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "CURL_LOG": str(curl_log),
        "FIXTURE_CLIENTS": _make_clients_fixture(CLIENT_REORDERED, row_names),
        "FIXTURE_GROUPS": GROUPS_LEGACY,
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
        "SECRET_docs": "s3cret",
    }
    res = subprocess.run(["sh", "-ec", seed_script], env=env, capture_output=True, text=True)
    assert res.returncode == 0
    assert "updated docs (id=docs), secret unchanged" in res.stdout
    log_content = curl_log.read_text()
    assert "POST " not in log_content


def test_pocket_id_legacy_field_order(repo_root: Path, tmp_path: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    seed_script = _extract_seed_script(manifest)
    row_names = _get_row_names(seed_script)

    curl_log = _setup_curl_stub(tmp_path)

    env = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "CURL_LOG": str(curl_log),
        "FIXTURE_CLIENTS": _make_clients_fixture(CLIENT_V214, row_names),
        "FIXTURE_GROUPS": GROUPS_LEGACY,
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
        "SECRET_docs": "s3cret",
    }
    res = subprocess.run(["sh", "-ec", seed_script], env=env, capture_output=True, text=True)
    assert res.returncode == 0
    assert "updated docs (id=docs), secret unchanged" in res.stdout
    assert "group workspace-users exists (id=g-legacy)" in res.stdout
    log_content = curl_log.read_text()
    assert "POST " not in log_content


def test_pocket_id_skip_secret(repo_root: Path, tmp_path: Path):
    manifest = repo_root / "k3d" / "pocket-id-client-seed.yaml"
    seed_script = _extract_seed_script(manifest)
    row_names = _get_row_names(seed_script)

    curl_log = _setup_curl_stub(tmp_path)

    env = {
        "PATH": f"{tmp_path}:{os.environ.get('PATH', '')}",
        "CURL_LOG": str(curl_log),
        "FIXTURE_CLIENTS": _make_clients_fixture(CLIENT_V214, row_names),
        "FIXTURE_GROUPS": GROUPS_V214,
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
        "SECRET_docs": "s3cret",
    }
    res = subprocess.run(["sh", "-ec", seed_script], env=env, capture_output=True, text=True)
    assert res.returncode == 0

    assert "skip downloads (no secret configured)" in res.stdout
    log_content = curl_log.read_text()
    assert not re.search(r"(PUT|POST) .*/api/oidc/clients/downloads", log_content)

    # docs has secret and is updated
    assert "updated docs (id=docs), secret unchanged" in res.stdout
    assert "PUT http://pocket-id:1411/api/oidc/clients/docs" in log_content
