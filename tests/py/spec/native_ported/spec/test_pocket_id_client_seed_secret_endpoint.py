"""Pocket-ID v2.14: client secret endpoint is /secrets (plural).

Live incident T901773: the seed's create-branch called
POST /api/oidc/clients/{id}/secret (singular) which v2.14 answers with 404.
Every fresh client creation died after the POST-create, one client per
container restart. This pins the plural endpoint end-to-end.
"""

import os
import re
from pathlib import Path

import pytest

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
  "POST "*/api/oidc/clients)
    printf '{"id":"downloads","name":"downloads","callbackURLs":[],"credentials":{"secrets":[]}}' ;;
  "POST "*/api/oidc/clients/*/secrets)
    printf '{"id":"sec-1","secret":"generated-plaintext-value-xyz","prefix":"gen","isActive":true}' ;;
  "POST "*/api/oidc/clients/*/secret)
    echo "curl: (22) The requested URL returned error: 404" >&2; exit 22 ;;
  "GET "*/api/user-groups*) printf '%s' "$FIXTURE_GROUPS" ;;
  "PATCH "*) printf '{}' ;;
  "POST "*) echo "curl: (22) The requested URL returned error: 409" >&2; exit 22 ;;
  *) echo "stub: unexpected $method $url" >&2; exit 99 ;;
esac
'''


def extract_seed(manifest: Path) -> str:
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
    return ('{"data":[' + objs + '],"pagination":{"totalPages":1,"totalItems":%d,'
            '"currentPage":1,"itemsPerPage":20}}' % len(names))


CLIENT_V214 = ('{"id":"%s","name":"%s","description":"","hasLogo":false,"launchURL":null,'
               '"callbackURLs":["https://x.example.test/oauth2/callback"],"logoutCallbackURLs":[],'
               '"isPublic":false,"credentials":{"secrets":[{"id":"7f3e","isActive":true}]},'
               '"isGroupRestricted":false}')
GROUPS_V214 = ('{"data":[{"id":"2535036c-15fc-439d-811a-89805b41e19e","friendlyName":"Workspace Users",'
               '"name":"workspace-users","customClaims":[],"userCount":0,"ldapId":null,'
               '"createdAt":"2026-08-23T17:18:24.820535Z"},{"id":"7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",'
               '"friendlyName":"Workspace Owners","name":"workspace-owners","customClaims":[],'
               '"userCount":0,"ldapId":null,"createdAt":"2026-10-07T00:00:00Z"}],"pagination":{"totalPages":1,'
               '"totalItems":2,"currentPage":1,"itemsPerPage":20}}')


CAT_STUB = r'''#!/usr/bin/env bash
# Simuliert das ServiceAccount-Volume (existiert in jedem echten Pod).
if [ "$1" = "/var/run/secrets/kubernetes.io/serviceaccount/namespace" ]; then
  printf 'test-ns'; exit 0
fi
if [ "$1" = "/var/run/secrets/kubernetes.io/serviceaccount/token" ]; then
  printf 'test-token'; exit 0
fi
exec /bin/cat "$@"
'''


@pytest.fixture
def seed(repo_root, tmp_path):
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    curl_log = stub_dir / "curl.log"
    curl_log.write_text("", encoding="utf-8")
    (stub_dir / "cat").write_text(CAT_STUB, encoding="utf-8")
    (stub_dir / "cat").chmod(0o755)
    seed_text = extract_seed(repo_root / "k3d" / "pocket-id-client-seed.yaml")
    assert seed_text.strip() != ""
    names = row_names(seed_text)
    assert names
    (stub_dir / "curl").write_text(CURL_STUB, encoding="utf-8")
    (stub_dir / "curl").chmod(0o755)
    return {"stub": stub_dir, "log": curl_log, "seed": seed_text, "names": names}


def _env(seed, clients):
    return {
        "PATH": f"{seed['stub']}{os.pathsep}{os.environ.get('PATH', '')}",
        "CURL_LOG": str(seed["log"]),
        "FIXTURE_CLIENTS": clients,
        "FIXTURE_GROUPS": GROUPS_V214,
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
        "SECRET_docs": "s3cret-docs-0123456789",
        "SECRET_downloads": "s3cret-downloads-012345",
    }


def test_create_branch_uses_plural_secrets_endpoint(run_cmd, seed):
    # downloads fehlt im Fixture -> create-Zweig; docs existiert -> update-Zweig.
    present = [n for n in seed["names"] if n != "downloads"]
    assert "docs" in present
    r = run_cmd(["sh", "-ec", seed["seed"]], env=_env(seed, clients_fixture(present, CLIENT_V214)))
    assert r.returncode == 0, r.output
    assert "updated docs (id=docs), secret unchanged" in r.output
    assert "created downloads (id=downloads), secret generated" in r.output
    log = seed["log"].read_text(encoding="utf-8")
    assert "POST http://pocket-id:1411/api/oidc/clients/downloads/secrets" in log
    assert not re.search(r"/api/oidc/clients/downloads/secret(?!s)", log)
    assert "seed complete" in r.output
