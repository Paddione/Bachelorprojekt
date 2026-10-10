"""T901774: Auth-Check muss 401 sauber melden, nicht 401000.

Live gefunden: `curl -f ... -w '%{http_code}' ... || echo "000"` druckt bei
401 den Code UND läuft danach in den ||-Zweig (curl -f exit 22) — ergibt
"401000" und landet im generischen Nicht-erreichbar-Branch statt im
401-Key-Branch. Der Stub ahmt curl -f exakt nach (Code drucken + exit 22).
"""

import os
import re
from pathlib import Path

import pytest

CURL_STUB = r'''#!/usr/bin/env bash
method=GET; url=""; wcode=0; fail=0
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method="$2"; shift ;;
    -w) wcode=1; shift ;;
    -f*|--fail) fail=1 ;;
    --retry-connrefused) ;;
    -H|-d|-o|--retry|--retry-delay|--connect-timeout|--cacert) shift ;;
    http*) url="$1" ;;
  esac
  shift
done
echo "$method $url" >> "$CURL_LOG"
case "$method $url" in
  "GET "*/api/oidc/clients*)
    if [ "$wcode" = 1 ]; then
      printf '%s' "$FIXTURE_CODE"
      if [ "$FIXTURE_CONNFAIL" = 1 ]; then exit 7; fi
      if [ "$fail" = 1 ]; then
        case "$FIXTURE_CODE" in 4*|5*) exit 22 ;; esac
      fi
      exit 0
    fi
    printf '%s' "$FIXTURE_CLIENTS" ;;
  "PUT "*/api/oidc/clients/*) printf '{}' ;;
  "GET "*/api/user-groups*) printf '%s' "$FIXTURE_GROUPS" ;;
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


@pytest.fixture
def seed(repo_root, tmp_path):
    stub_dir = tmp_path / "stub"
    stub_dir.mkdir()
    curl_log = stub_dir / "curl.log"
    curl_log.write_text("", encoding="utf-8")
    seed_text = extract_seed(repo_root / "k3d" / "pocket-id-client-seed.yaml")
    assert seed_text.strip() != ""
    (stub_dir / "curl").write_text(CURL_STUB, encoding="utf-8")
    (stub_dir / "curl").chmod(0o755)
    return {"stub": stub_dir, "log": curl_log, "seed": seed_text}


def _env(seed, code):
    return {
        "PATH": f"{seed['stub']}{os.pathsep}{os.environ.get('PATH', '')}",
        "CURL_LOG": str(seed["log"]),
        "FIXTURE_CODE": code,
        "FIXTURE_CONNFAIL": "0",
        "FIXTURE_CLIENTS": '{"data":[],"pagination":{"totalPages":1}}',
        "FIXTURE_GROUPS": ('{"data":[{"id":"2535036c-15fc-439d-811a-89805b41e19e","friendlyName":"Workspace Users",'
            '"name":"workspace-users"},{"id":"7a1b2c3d-4e5f-6071-8293-a4b5c6d7e8f9",'
            '"friendlyName":"Workspace Owners","name":"workspace-owners"}],"pagination":{"totalPages":1}}'),
        "POCKET_ID_FRONTEND_URL": "https://auth.example.test",
        "WEBSITE_NS": "",
        "API": "http://pocket-id:1411",
        "POCKET_ID_API_KEY": "test-key",
    }


def test_t901774_auth_check_reports_401_in_key_branch_not_as_401000(run_cmd, seed):
    r = run_cmd(["sh", "-ec", seed["seed"]], env=_env(seed, "401"))
    assert r.returncode == 1, r.output
    assert "POCKET_ID_API_KEY von Pocket-ID abgelehnt (HTTP 401)" in r.output
    assert "401000" not in r.output


def test_t901774_auth_check_accepts_2xx(run_cmd, seed):
    r = run_cmd(["sh", "-ec", seed["seed"]], env=_env(seed, "200"))
    assert r.returncode == 0, r.output
    assert "seed complete" in r.output


def test_t901774_conn_failure_reports_single_000(run_cmd, seed):
    env = _env(seed, "000")
    env["FIXTURE_CONNFAIL"] = "1"
    r = run_cmd(["sh", "-ec", seed["seed"]], env=env)
    assert r.returncode == 1, r.output
    assert "(HTTP 000)" in r.output
    assert "000000" not in r.output
