"""Native migration of tests/spec/pocket-id-client-seed-group-lookup.bats."""

import os
import re
import subprocess
from pathlib import Path

import pytest

CLIENT_V214 = ('{"id":"%s","name":"%s","description":"","hasLogo":false,"launchURL":null,'
               '"callbackURLs":["https://x.example.test/oauth2/callback"],"logoutCallbackURLs":[],'
               '"isPublic":false,"credentials":{"secrets":[{"id":"7f3e","prefix":"","createdAt":"2026-08-23T17:20:42Z",'
               '"expiresAt":null,"isActive":true}]},"isGroupRestricted":false}')
CLIENT_REORDERED = ('{"id":"%s","description":"","hasLogo":false,"name":"%s","callbackURLs":[],'
                    '"credentials":{"secrets":[{"id":"7f3e","isActive":true}]}}')
GROUPS_V214 = ('{"data":[{"id":"2535036c-15fc-439d-811a-89805b41e19e","friendlyName":"Workspace Users",'
               '"name":"workspace-users","customClaims":[],"userCount":0,"ldapId":null,'
               '"createdAt":"2026-08-23T17:18:24.820535Z"},{"id":"7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",'
               '"friendlyName":"Workspace Owners","name":"workspace-owners","customClaims":[],"userCount":0,'
               '"ldapId":null,"createdAt":"2026-10-07T00:00:00Z"}],"pagination":{"totalPages":1,"totalItems":2,'
               '"currentPage":1,"itemsPerPage":20}}')
GROUPS_LEGACY = ('{"data":[{"id":"g-legacy","name":"workspace-users","friendlyName":"Workspace Users"},'
                 '{"id":"g-legacy-owners","name":"workspace-owners","friendlyName":"Workspace Owners"}],'
                 '"pagination":{"totalPages":1,"totalItems":2,"currentPage":1,"itemsPerPage":20}}')

CURL_STUB = r'''#!/usr/bin/env bash
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
'''


def extract_seed(manifest: Path) -> str:
    """awk SCHEME-Zeile bis 'seed complete' + sed (14 Leerzeichen weg, $$ -> $)."""
    out, on = [], False
    for line in manifest.read_text(encoding="utf-8").splitlines():
        if re.search(r'SCHEME="\$\{POCKET_ID_FRONTEND_URL%%:\/\/\*\}"', line):
            on = True
        if on:
            out.append(line)
        if re.search(r'echo "seed complete"', line):
            break
    cleaned = []
    for line in out:
        if line.startswith(" " * 14):
            line = line[14:]
        cleaned.append(line.replace("$$", "$"))
    return "\n".join(cleaned) + "\n"


def row_names(seed: str):
    """sed -n '/^ROWS="/,/^"/p' | grep '|' | cut -d'|' -f1."""
    names, inside = [], False
    for line in seed.splitlines():
        if not inside and line.startswith('ROWS="'):
            inside = True
            continue
        if inside:
            if line.startswith('"'):
                break
            if "|" in line:
                names.append(line.split("|", 1)[0])
    return names


def clients_fixture(names, template: str) -> str:
    objs = ",".join(template.replace("%s", n) for n in names)
    return ('{"data":[' + objs + '],"pagination":{"totalPages":1,"totalItems":19,"currentPage":1,'
            '"itemsPerPage":20}}')


@pytest.fixture
def seed(repo_root, tmp_path):
    """BATS setup: Seed-Skript aus dem Manifest extrahieren, curl-Stub anlegen."""
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    curl_log = stub_dir / "curl.log"
    curl_log.write_text("", encoding="utf-8")
    seed_text = extract_seed(repo_root / "k3d" / "pocket-id-client-seed.yaml")
    assert seed_text.strip() != ""
    names = row_names(seed_text)
    assert names
    (stub_dir / "curl").write_text(CURL_STUB, encoding="utf-8")
    (stub_dir / "curl").chmod(0o755)
    return {"stub": stub_dir, "log": curl_log, "seed": seed_text, "names": names}


def run_seed(run_cmd, seed, clients: str, groups: str):
    env = {
        "PATH": f"{seed['stub']}{os.pathsep}{os.environ.get('PATH', '')}",
        "CURL_LOG": str(seed["log"]),
        "FIXTURE_CLIENTS": clients,
        "FIXTURE_GROUPS": groups,
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
        "SECRET_docs": "s3cret",
    }
    return run_cmd(["sh", "-ec", seed["seed"]], env=env)


def _posts(seed):
    return [line for line in seed["log"].read_text(encoding="utf-8").splitlines() if line.startswith("POST ")]


def test_t900804_existing_group_is_found_with_pocket_id_v2_14_0_field_order(run_cmd, seed):
    r = run_seed(run_cmd, seed, clients_fixture(seed["names"], CLIENT_V214), GROUPS_V214)
    assert r.returncode == 0, r.output
    assert "group workspace-users exists (id=2535036c-15fc-439d-811a-89805b41e19e)" in r.output
    assert _posts(seed) == []


def test_t900804_existing_client_is_found_when_name_does_not_directly_follow_id(run_cmd, seed):
    r = run_seed(run_cmd, seed, clients_fixture(seed["names"], CLIENT_REORDERED), GROUPS_LEGACY)
    assert r.returncode == 0, r.output
    assert "updated docs (id=docs), secret unchanged" in r.output
    assert _posts(seed) == []


def test_t900804_legacy_field_order_name_directly_after_id_still_resolves_group_and_client(run_cmd, seed):
    r = run_seed(run_cmd, seed, clients_fixture(seed["names"], CLIENT_V214), GROUPS_LEGACY)
    assert r.returncode == 0, r.output
    assert "updated docs (id=docs), secret unchanged" in r.output
    assert "group workspace-users exists (id=g-legacy)" in r.output
    assert _posts(seed) == []
