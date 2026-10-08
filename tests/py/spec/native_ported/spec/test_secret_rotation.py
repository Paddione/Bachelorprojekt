"""Native migration of tests/spec/secret-rotation.bats."""
import base64
import os
import re
import shlex
from pathlib import Path

import pytest
import yaml

BEGIN_CERT = "-----BEGIN CERTIFICATE-----"
END_CERT = "-----END CERTIFICATE-----"

KUBESEAL_STUB = """#!/usr/bin/env bash
cat
echo "kind: SealedSecret"
"""

LIB_PRELUDE = """set -eE
die() { echo "DIE: $*" >&2; return 1; }
info() { :; }
source {lib}
"""


@pytest.fixture
def scripts(repo_root: Path) -> dict:
    return {
        "seal": repo_root / "scripts" / "env-seal.sh",
        "gen": repo_root / "scripts" / "env-generate.sh",
        "lib": repo_root / "scripts" / "lib" / "seal-extra-namespaces.sh",
        "schema": repo_root / "environments" / "schema.yaml",
    }


def _seal_stub_dir(tmp_path: Path) -> Path:
    stub = tmp_path / "stub"
    stub.mkdir(exist_ok=True)
    kubeseal = stub / "kubeseal"
    kubeseal.write_text(KUBESEAL_STUB)
    kubeseal.chmod(0o755)
    return stub


def _lib_call(run_cmd, lib: Path, body: str, args: list, env=None):
    """Source the sealer library with stubbed die/info and run body with positional args."""
    script = LIB_PRELUDE.replace("{lib}", shlex.quote(str(lib))) + body
    return run_cmd(["bash", "-c", script, "_", *args], env=env)


def _scan(run_cmd, scripts, scan_file: Path):
    return run_cmd(["bash", str(scripts["seal"]), "--env", "_noexist", "--_test-dev-scan", str(scan_file)])


def test_env_seal_dev_prefixed_value_is_rejected_without_force(run_cmd, scripts, tmp_path):
    scan_file = tmp_path / "secrets.yaml"
    scan_file.write_text('SHARED_DB_PASSWORD: "devpassword123"\nBOTS_TOKEN: "real-token-here"\n')
    result = _scan(run_cmd, scripts, scan_file)
    assert result.returncode != 0
    assert "SHARED_DB_PASSWORD" in result.output


def test_env_seal_placeholder_suffix_is_rejected(run_cmd, scripts, tmp_path):
    scan_file = tmp_path / "secrets.yaml"
    scan_file.write_text('SMTP_PASSWORD: "smtp_dev_placeholder"\nREAL_KEY: "actual-value-abc123"\n')
    result = _scan(run_cmd, scripts, scan_file)
    assert result.returncode != 0
    assert "SMTP_PASSWORD" in result.output


def test_env_seal_clean_secrets_file_passes_dev_value_scan(run_cmd, scripts, tmp_path):
    scan_file = tmp_path / "secrets.yaml"
    scan_file.write_text('SHARED_DB_PASSWORD: "X7k9mQ2vLpR4sN1wE8hA3uG6tB5cF0dJ"\n'
                         'SMTP_PASSWORD: "real-smtp-secret-value-42"\n')
    result = _scan(run_cmd, scripts, scan_file)
    assert result.returncode == 0


def test_env_seal_managed_externally_is_rejected(run_cmd, scripts, tmp_path):
    scan_file = tmp_path / "secrets.yaml"
    scan_file.write_text('LLM_API_KEY: "MANAGED_EXTERNALLY"\n')
    result = _scan(run_cmd, scripts, scan_file)
    assert result.returncode != 0
    assert "LLM_API_KEY" in result.output


def test_env_seal_duplicate_keys_in_secrets_file_are_rejected(run_cmd, scripts, tmp_path):
    dup_file = tmp_path / "secrets_dup.yaml"
    dup_file.write_text('SHARED_DB_PASSWORD: "first-value"\nSMTP_PASSWORD: "some-value"\n'
                        'SHARED_DB_PASSWORD: "second-value-oops"\n')
    result = run_cmd(["bash", str(scripts["seal"]), "--env", "_noexist", "--_test-dup-check", str(dup_file)])
    assert result.returncode != 0
    assert "SHARED_DB_PASSWORD" in result.output


def test_env_seal_unique_keys_pass_duplicate_check(run_cmd, scripts, tmp_path):
    dup_file = tmp_path / "secrets_ok.yaml"
    dup_file.write_text('SHARED_DB_PASSWORD: "unique-value-1"\nSMTP_PASSWORD: "unique-value-2"\n'
                        'BOTS_TOKEN: "unique-value-3"\n')
    result = run_cmd(["bash", str(scripts["seal"]), "--env", "_noexist", "--_test-dup-check", str(dup_file)])
    assert result.returncode == 0


def test_env_seal_identical_certs_pass_fingerprint_check(run_cmd, scripts, tmp_path):
    cert_a = tmp_path / "cert-a.pem"
    cert_b = tmp_path / "cert-b.pem"
    cert_a.write_text(f"{BEGIN_CERT}\nMIIFakeCert==\n{END_CERT}\n")
    cert_b.write_text(cert_a.read_text())
    result = run_cmd(["bash", str(scripts["seal"]), "--env", "_noexist",
                      "--_test-cert-compare", str(cert_a), str(cert_b)])
    assert result.returncode == 0


def test_env_seal_differing_certs_fail_fingerprint_check_with_drift_message(run_cmd, scripts, tmp_path):
    cert_a = tmp_path / "cert-a.pem"
    cert_b = tmp_path / "cert-b.pem"
    cert_a.write_text(f"{BEGIN_CERT}\nCert-A-Content==\n{END_CERT}\n")
    cert_b.write_text(f"{BEGIN_CERT}\nCert-B-DIFFERENT==\n{END_CERT}\n")
    result = run_cmd(["bash", str(scripts["seal"]), "--env", "_noexist",
                      "--_test-cert-compare", str(cert_a), str(cert_b)])
    assert result.returncode != 0


def test_seal_lib_extra_namespaces_entry_without_type_defaults_to_opaque(run_cmd, scripts, tmp_path):
    secrets = tmp_path / "s.yaml"
    secrets.write_text('SOME_TOKEN: "plain-value"\n')
    out = tmp_path / "m-opaque.yaml"
    body = 'build_secret_manifest "$1" "flux-system" "some-secret" ' \
           '"SOME_TOKEN:=:token:=:false:=:-:=:-" "$2" ""\n'
    result = _lib_call(run_cmd, scripts["lib"], body, [str(out), str(secrets)])
    result.check()
    text = out.read_text(encoding="utf-8")
    assert re.search(r"^type: Opaque$", text, re.M)
    assert 'token: "plain-value"' in text


def test_seal_lib_schema_type_is_passed_through_to_manifest(run_cmd, scripts, tmp_path):
    secrets = tmp_path / "s.yaml"
    secrets.write_text('SOME_TOKEN: "plain-value"\n')
    out = tmp_path / "m-typed.yaml"
    body = 'build_secret_manifest "$1" "flux-system" "ghcr-auth" ' \
           '"SOME_TOKEN:=:token:=:false:=:-:=:-" "$2" "" "kubernetes.io/dockerconfigjson"\n'
    result = _lib_call(run_cmd, scripts["lib"], body, [str(out), str(secrets)])
    result.check()
    assert re.search(r"^type: kubernetes\.io/dockerconfigjson$", out.read_text(encoding="utf-8"), re.M)


def test_seal_lib_dockerconfigjson_is_assembled_from_username_and_token(run_cmd, scripts, tmp_path):
    secrets = tmp_path / "s.yaml"
    secrets.write_text('GHCR_USERNAME: "test-user"\nGHCR_PAT: "test-token-42"\n')
    out = tmp_path / "m-dcj.yaml"
    body = 'build_secret_manifest "$1" "flux-system" "ghcr-auth" ' \
           '"GHCR_PAT:=:.dockerconfigjson:=:false:=:ghcr.io:=:GHCR_USERNAME" "$2" "" ' \
           '"kubernetes.io/dockerconfigjson"\n'
    result = _lib_call(run_cmd, scripts["lib"], body, [str(out), str(secrets)])
    result.check()
    text = out.read_text(encoding="utf-8")
    expect = base64.b64encode(b"test-user:test-token-42").decode("ascii")
    assert '{"auths":{"ghcr.io":{"auth":"' + expect + '"}}}' in text
    # Counter-check: the raw token must not appear unwrapped in the manifest.
    assert "test-token-42" not in text


def test_seal_lib_output_file_routes_documents_away_from_the_collected_file(run_cmd, scripts, tmp_path):
    work = tmp_path / "routed"
    work.mkdir()
    secrets = work / "s.yaml"
    schema = work / "schema.yaml"
    collected = work / "collected.yaml"
    cert = work / "c.pem"
    collected.write_text("")
    cert.write_text("")
    secrets.write_text('GHCR_USERNAME: "test-user"\nGHCR_PAT: "test-token-42"\n'
                       'FLUX_WEBHOOK_TOKEN: "webhook-token-42"\nOTHER_KEY: "other-value"\n')
    schema.write_text("""version: 1
secrets:
  - name: GHCR_PAT
    required: false
    extra_namespaces:
      - namespace: flux-system
        secret: ghcr-auth
        type: kubernetes.io/dockerconfigjson
        registry: ghcr.io
        username_key: GHCR_USERNAME
        dest_key: .dockerconfigjson
        output_file: bootstrap/ghcr-auth-sealedsecret.yaml
  - name: FLUX_WEBHOOK_TOKEN
    required: false
    extra_namespaces:
      - namespace: flux-system
        secret: flux-webhook-token
        dest_key: token
        output_file: bootstrap/flux-webhook-token-sealedsecret.yaml
  - name: OTHER_KEY
    required: false
    extra_namespaces:
      - namespace: website
        secret: website-secrets
""")
    env = {"ENV_NAME": "mentolder", "ENV_FILE": str(work / "none.yaml"),
           "SEAL_OUTPUT_ROOT": str(work), "PATH": f"{_seal_stub_dir(tmp_path)}{os.pathsep}{os.environ.get('PATH', '')}"}
    body = 'seal_extra_namespace_secrets "$1" "$2" "$3" "$4"\n'
    result = _lib_call(run_cmd, scripts["lib"], body,
                       [str(schema), str(secrets), str(cert), str(collected)], env=env)
    result.check()

    ghcr = work / "bootstrap" / "ghcr-auth-sealedsecret.yaml"
    webhook = work / "bootstrap" / "flux-webhook-token-sealedsecret.yaml"
    assert ghcr.is_file()
    assert webhook.is_file()
    assert "name: ghcr-auth" in ghcr.read_text(encoding="utf-8")
    assert "task env:seal ENV=mentolder" in ghcr.read_text(encoding="utf-8")
    # The collected file holds only the mapping without output_file.
    collected_text = collected.read_text(encoding="utf-8")
    assert "flux-system" not in collected_text
    assert "name: website-secrets" in collected_text


def test_seal_lib_empty_source_keys_leave_output_file_untouched(run_cmd, scripts, tmp_path):
    work = tmp_path / "guard"
    (work / "bootstrap").mkdir(parents=True)
    secrets = work / "s.yaml"
    schema = work / "schema.yaml"
    collected = work / "collected.yaml"
    cert = work / "c.pem"
    target = work / "bootstrap" / "flux-webhook-token-sealedsecret.yaml"
    collected.write_text("")
    cert.write_text("")
    target.write_text("LIVE-CIPHERTEXT-MUST-SURVIVE\n")
    secrets.write_text('FLUX_WEBHOOK_TOKEN: ""\n')
    schema.write_text("""version: 1
secrets:
  - name: FLUX_WEBHOOK_TOKEN
    required: false
    extra_namespaces:
      - namespace: flux-system
        secret: flux-webhook-token
        dest_key: token
        output_file: bootstrap/flux-webhook-token-sealedsecret.yaml
""")
    env = {"ENV_NAME": "mentolder", "ENV_FILE": str(work / "none.yaml"),
           "SEAL_OUTPUT_ROOT": str(work), "PATH": f"{_seal_stub_dir(tmp_path)}{os.pathsep}{os.environ.get('PATH', '')}"}
    body = 'seal_extra_namespace_secrets "$1" "$2" "$3" "$4"\n'
    result = _lib_call(run_cmd, scripts["lib"], body,
                       [str(schema), str(secrets), str(cert), str(collected)], env=env)
    result.check()
    assert "LIVE-CIPHERTEXT-MUST-SURVIVE" in target.read_text(encoding="utf-8")


def test_schema_flux_system_mappings_are_owned_by_mentolder_only(scripts):
    schema_path = scripts["schema"]
    if not schema_path.is_file():
        pytest.skip("environments/schema.yaml not found")
    schema = yaml.safe_load(schema_path.read_text(encoding="utf-8")) or {}
    seen = {}
    for entry in schema.get("secrets") or []:
        for mapping in entry.get("extra_namespaces") or []:
            if mapping.get("namespace") != "flux-system":
                continue
            owners = [str(b).lower() for b in mapping.get("owner_brand") or []]
            assert owners == ["mentolder"], f"{entry['name']} -> flux-system needs owner_brand: [mentolder]"
            assert mapping.get("output_file"), f"{entry['name']} -> flux-system needs output_file"
            seen[mapping["secret"]] = mapping["output_file"]
    for name in ("ghcr-auth", "flux-webhook-token"):
        assert name in seen, f"schema does not map flux-system/{name}"
        assert seen[name].startswith("flux/clusters/fleet/bootstrap/"), seen[name]


def test_env_generate_refuses_to_overwrite_existing_secrets_file(run_cmd, scripts, tmp_path):
    env_dir = tmp_path / "environments"
    (env_dir / ".secrets").mkdir(parents=True)
    (env_dir / "schema.yaml").write_text("""version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
""")
    secrets_file = env_dir / ".secrets" / "testenv.yaml"
    secrets_file.write_text("SHARED_DB_PASSWORD: existing-value\n")
    result = run_cmd(["bash", str(scripts["gen"]), "--env", "testenv", "--env-dir", str(env_dir)])
    assert result.returncode != 0
    assert "existing-value" in secrets_file.read_text(encoding="utf-8")
