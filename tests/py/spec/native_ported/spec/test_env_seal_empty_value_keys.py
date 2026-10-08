"""Native migration of tests/spec/env-seal-empty-value-keys.bats."""

import os
import re
from pathlib import Path

import pytest

KUBESEAL_STUB = """#!/usr/bin/env bash
cat
cat <<'ENVELOPE'
---
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: stub-envelope
  namespace: stub
spec:
  encryptedData: {}
ENVELOPE
"""

SCHEMA_OPTIONAL_EMPTY = """version: 1
secrets:
  - name: PRESENT_KEY
    required: true
    generate: true
    length: 16
  - name: OPTIONAL_EMPTY_KEY
    required: false
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
"""
SECRETS_OPTIONAL_EMPTY = 'PRESENT_KEY: "abc123-real-value"\nOPTIONAL_EMPTY_KEY: ""\n'

SCHEMA_REQUIRED_EMPTY = """version: 1
secrets:
  - name: REQUIRED_EMPTY_KEY
    required: true
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
"""
SECRETS_REQUIRED_EMPTY = 'REQUIRED_EMPTY_KEY: ""\n'

SCHEMA_HAPPY = """version: 1
secrets:
  - name: HAPPY_KEY
    required: true
    generate: false
    extra_namespaces:
      - namespace: website-test
        secret: website-secrets
"""
SECRETS_HAPPY = 'HAPPY_KEY: "value-here"\n'

MODES = {
    "optional-empty": (SCHEMA_OPTIONAL_EMPTY, SECRETS_OPTIONAL_EMPTY),
    "required-empty": (SCHEMA_REQUIRED_EMPTY, SECRETS_REQUIRED_EMPTY),
    "happy": (SCHEMA_HAPPY, SECRETS_HAPPY),
}


@pytest.fixture
def seal_script(repo_root):
    script = repo_root / "scripts" / "env-seal.sh"
    if not script.is_file():
        pytest.skip(f"env-seal.sh not found at {script}")
    return script


def _setup(tmp_path, mode):
    stub_dir = tmp_path / "kubeseal-stub"
    stub_dir.mkdir()
    stub = stub_dir / "kubeseal"
    stub.write_text(KUBESEAL_STUB)
    stub.chmod(0o755)

    work = tmp_path / "env-seal"
    for sub in (".secrets", "certs", "sealed-secrets"):
        (work / sub).mkdir(parents=True, exist_ok=True)
    (work / "test.yaml").write_text("environment: test\ncontext: test-cluster\ndomain: test.local\n")
    schema, secrets = MODES[mode]
    (work / "schema.yaml").write_text(schema)
    (work / ".secrets" / "test.yaml").write_text(secrets)
    (work / "certs" / "test.pem").write_text("")
    return stub_dir, work


def _seal(run_cmd, seal_script, stub_dir, work):
    path = f"{stub_dir}:{os.environ.get('PATH', '')}"
    return run_cmd(
        ["bash", str(seal_script), "--env", "test", "--env-dir", str(work), "--reuse-cert"],
        env={"PATH": path},
    )


def test_env_seal_optional_extra_namespaces_key_with_empty_value_is_included_in_output_g_cd01_regression(
    tmp_path, run_cmd, seal_script
):
    stub_dir, work = _setup(tmp_path, "optional-empty")
    _seal(run_cmd, seal_script, stub_dir, work)
    output_file = work / "sealed-secrets" / "test.yaml"
    assert output_file.is_file(), "seal did not run: output file not created"
    text = output_file.read_text(encoding="utf-8")
    assert text.count("namespace: website-test") >= 1, (
        "BUG: extra_namespaces SealedSecret (website-test/website-secrets) not in output.\n" + text
    )


def test_env_seal_required_key_with_empty_value_fails_seal_with_non_zero_exit_g_cd01_regression(
    tmp_path, run_cmd, seal_script
):
    stub_dir, work = _setup(tmp_path, "required-empty")
    res = _seal(run_cmd, seal_script, stub_dir, work)
    assert res.returncode != 0, f"BUG: required+empty key was silently accepted (exit 0)\n{res.output}"
    assert re.search(r"required|REQUIRED_EMPTY_KEY", res.output, re.I), (
        f"BUG: error message does not mention 'required' or the key name\n{res.output}"
    )


def test_env_seal_happy_path_with_all_required_keys_present_succeeds_regression_guard(
    tmp_path, run_cmd, seal_script
):
    stub_dir, work = _setup(tmp_path, "happy")
    res = _seal(run_cmd, seal_script, stub_dir, work)
    assert res.returncode == 0, f"REGRESSION: happy path failed\n{res.output}"
    output_file = work / "sealed-secrets" / "test.yaml"
    assert output_file.is_file(), "REGRESSION: output file not created"
    assert "HAPPY_KEY" in output_file.read_text(encoding="utf-8"), "REGRESSION: HAPPY_KEY not in output"
