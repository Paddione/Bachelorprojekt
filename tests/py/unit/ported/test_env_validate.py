"""Native migration of tests/unit/env-validate.bats."""
import shutil
from pathlib import Path

import pytest

SCHEMA = """version: 1

env_vars:
  - name: PROD_DOMAIN
    required: true
    default_dev: "localhost"
    validate: "^[a-z0-9.-]+$"

  - name: BRAND_NAME
    required: true
    default_dev: "Workspace"

  - name: CONTACT_EMAIL
    required: true
    default_dev: "dev@localhost"
    validate: "^.+@.+$"

secrets:
  - name: SHARED_DB_PASSWORD
    required: true
    generate: true
    length: 32

  - name: KEYCLOAK_ADMIN_PASSWORD
    required: true
    generate: false

setup_vars:
  - name: KC_USER1_USERNAME
    required: true

  - name: KC_USER1_EMAIL
    required: true
    validate: "^.+@.+$"

  - name: KC_USER1_PASSWORD
    required: true
"""

DEV = """environment: dev
context: k3d-dev
domain: localhost

env_vars:
  WEBSITE_IMAGE: workspace-website

secrets_mode: plaintext

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@localhost
  KC_USER1_PASSWORD: devadmin
"""

PROD = """environment: prod
context: prod-cluster
domain: example.de

env_vars:
  PROD_DOMAIN: example.de
  BRAND_NAME: "Example"
  CONTACT_EMAIL: info@example.de

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@example.de
  KC_USER1_PASSWORD: SEALED
"""

SEALED_PROD = """apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: workspace-secrets
spec:
  encryptedData:
    SHARED_DB_PASSWORD: AgBsomeencrypteddata==
    KEYCLOAK_ADMIN_PASSWORD: AgBmoreencrypteddata==
"""

MISSING_KEY = """environment: missing-key
context: missing-ctx
domain: missing.de

env_vars:
  PROD_DOMAIN: missing.de
  BRAND_NAME: "Missing"

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@missing.de
  KC_USER1_PASSWORD: SEALED
"""

BAD_REGEX = """environment: bad-regex
context: bad-ctx
domain: bad.de

env_vars:
  PROD_DOMAIN: "INVALID DOMAIN!"
  BRAND_NAME: "Bad"
  CONTACT_EMAIL: not-an-email

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@bad.de
  KC_USER1_PASSWORD: SEALED
"""

PLACEHOLDER = """environment: placeholder
context: placeholder-ctx
domain: yourdomain.tld

env_vars:
  PROD_DOMAIN: yourdomain.tld
  BRAND_NAME: "Placeholder"
  CONTACT_EMAIL: info@yourdomain.tld

secrets_ref: sealed-secrets/prod.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@placeholder.de
  KC_USER1_PASSWORD: SEALED
"""

NO_SEALED = """environment: no-sealed
context: no-sealed-ctx
domain: nosealed.de

env_vars:
  PROD_DOMAIN: nosealed.de
  BRAND_NAME: "NoSealed"
  CONTACT_EMAIL: info@nosealed.de

secrets_ref: sealed-secrets/nonexistent.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@nosealed.de
  KC_USER1_PASSWORD: SEALED
"""

PARTIAL_SEALED_SECRET = """apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: workspace-secrets
spec:
  encryptedData:
    SHARED_DB_PASSWORD: AgBsomeencrypteddata==
"""

PARTIAL_SEALED = """environment: partial-sealed
context: partial-ctx
domain: partial.de

env_vars:
  PROD_DOMAIN: partial.de
  BRAND_NAME: "Partial"
  CONTACT_EMAIL: info@partial.de

secrets_ref: sealed-secrets/partial.yaml

setup_vars:
  KC_USER1_USERNAME: admin
  KC_USER1_EMAIL: admin@partial.de
  KC_USER1_PASSWORD: SEALED
"""


@pytest.fixture(scope="module")
def script(repo_root) -> Path:
    return repo_root / "scripts" / "env-validate.sh"


@pytest.fixture(scope="module")
def env_dir(tmp_path_factory) -> Path:
    """Module-wide fixture tree (BATS setup_file equivalent)."""
    root = tmp_path_factory.mktemp("env-validate") / "environments"
    (root / "sealed-secrets").mkdir(parents=True)
    files = {
        "schema.yaml": SCHEMA,
        "dev.yaml": DEV,
        "prod.yaml": PROD,
        "sealed-secrets/prod.yaml": SEALED_PROD,
        "missing-key.yaml": MISSING_KEY,
        "bad-regex.yaml": BAD_REGEX,
        "placeholder.yaml": PLACEHOLDER,
        "no-sealed.yaml": NO_SEALED,
        "sealed-secrets/partial.yaml": PARTIAL_SEALED_SECRET,
        "partial-sealed.yaml": PARTIAL_SEALED,
    }
    for rel, content in files.items():
        (root / rel).write_text(content, encoding="utf-8")
    return root


def test_valid_dev_environment_passes_validation(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "dev", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode == 0, result.output


def test_valid_prod_environment_passes_schema_only_validation(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "prod", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode == 0, result.output


def test_missing_required_env_var_fails_validation(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "missing-key", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode != 0
    assert "CONTACT_EMAIL" in result.output


def test_env_var_failing_regex_validation_is_rejected(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "bad-regex", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode != 0
    assert "PROD_DOMAIN" in result.output


def test_placeholder_values_are_rejected(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "placeholder", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode != 0
    assert "yourdomain.tld" in result.output


def test_missing_sealed_secret_file_fails_validation(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "no-sealed", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode != 0
    assert "sealed-secrets/nonexistent.yaml" in result.output


def test_sealed_secret_missing_a_required_key_fails_validation(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "partial-sealed", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode != 0
    assert "KEYCLOAK_ADMIN_PASSWORD" in result.output


def test_script_exits_with_error_when_no_arguments_given(run_cmd, script):
    result = run_cmd(["bash", str(script)])
    assert result.returncode != 0
    assert "Usage" in result.output


def test_script_exits_with_error_for_nonexistent_environment(run_cmd, script, env_dir):
    result = run_cmd(["bash", str(script), "--env", "nonexistent", "--env-dir", str(env_dir), "--schema-only"])
    assert result.returncode != 0


def test_drift_detection_runs_without_error_on_consistent_envs(run_cmd, script, env_dir, tmp_path):
    # Create a minimal drift-safe directory with only dev and prod
    drift_dir = tmp_path / "drift-envs"
    (drift_dir / "sealed-secrets").mkdir(parents=True)
    shutil.copy(env_dir / "schema.yaml", drift_dir / "schema.yaml")
    shutil.copy(env_dir / "dev.yaml", drift_dir / "dev.yaml")
    shutil.copy(env_dir / "prod.yaml", drift_dir / "prod.yaml")
    shutil.copy(env_dir / "sealed-secrets" / "prod.yaml", drift_dir / "sealed-secrets" / "prod.yaml")
    result = run_cmd(["bash", str(script), "--drift", "--env-dir", str(drift_dir), "--schema-only"])
    assert result.returncode == 0, result.output
