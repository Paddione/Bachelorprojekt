"""Native migration of tests/spec/secret-rotation-exposure.bats."""

import os
from pathlib import Path

import pytest

KUBESEAL_STUB = """#!/usr/bin/env bash
if [[ "$*" == *"--fetch-cert"* ]]; then
  echo "STUB_CERTIFICATE"
  exit 0
fi
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

SCHEMA_YAML = """version: 1
secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32
context: fleet
workspace_namespace: workspace
website_namespace: website
"""

ENV_YAML = """name: testenv
context: fleet
workspace_namespace: workspace
website_namespace: website
"""


@pytest.fixture
def secret_script(repo_root: Path) -> str:
    return str(repo_root / "scripts" / "secret-rotate.sh")


@pytest.fixture
def env_dir(tmp_path: Path) -> Path:
    d = tmp_path / "test-env"
    (d / ".secrets").mkdir(parents=True)
    (d / "schema.yaml").write_text(SCHEMA_YAML, encoding="utf-8")
    (d / ".secrets" / "testenv.yaml").write_text("SHARED_DB_PASSWORD: old-secret-value-xyz\n", encoding="utf-8")
    (d / "testenv.yaml").write_text(ENV_YAML, encoding="utf-8")
    return d


def test_secret_rotate_sh_does_not_rotate_secrets_when_exposed_bug_requires_force(secret_script, env_dir, run_cmd):
    """secret-rotate.sh does not rotate secrets when exposed (BUG: requires --force)"""
    result = run_cmd(["bash", secret_script, "--env", "testenv", "--env-dir", str(env_dir)])
    assert result.returncode != 0, "expected: FAIL (rotation should not happen automatically)"


def test_secret_rotate_sh_rotates_secrets_for_environment_on_exposure_trigger_force(
    secret_script, env_dir, tmp_path, run_cmd
):
    """secret-rotate.sh rotates secrets for environment on exposure trigger (--force)"""
    stub_dir = tmp_path / "kubeseal-stub"
    stub_dir.mkdir()
    stub = stub_dir / "kubeseal"
    stub.write_text(KUBESEAL_STUB, encoding="utf-8")
    os.chmod(stub, 0o755)

    result = run_cmd(
        ["bash", secret_script, "--env", "testenv", "--env-dir", str(env_dir), "--force"],
        env={"PATH": f"{stub_dir}{os.pathsep}{os.environ.get('PATH', '')}"},
    )
    assert result.returncode == 0, f"expected: FAIL (rotation should succeed with --force)\n{result.output}"

    new_value = ""
    for line in (env_dir / ".secrets" / "testenv.yaml").read_text(encoding="utf-8").splitlines():
        if line.startswith("SHARED_DB_PASSWORD:"):
            fields = line.split(":")
            new_value = fields[1] if len(fields) > 1 else ""
            break
    assert new_value != "old-secret-value-xyz", "expected: FAIL (secret value should be different)"

    assert (env_dir / "sealed-secrets" / "testenv.yaml").is_file(), "expected: FAIL (sealed secret not created)"
