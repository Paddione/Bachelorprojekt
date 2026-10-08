"""Native command-output guards migrated from tests/unit/scripts.bats."""

from pathlib import Path

import pytest
import yaml


@pytest.mark.parametrize(
    ("key", "placeholder"),
    [
        ("GITHUB_PAT", "ghp_dev_placeholder"),
        ("STRIPE_SECRET_KEY", "sk_test_placeholder"),
        ("GITHUB_PAT", "not-configured"),
        ("KEYCLOAK_ADMIN_PASSWORD", "MANAGED_EXTERNALLY"),
        ("SMTP_PASSWORD", ""),
    ],
)
def test_env_seal_rejects_placeholder_values(repo_root, run_cmd, tmp_path, key, placeholder):
    secrets = tmp_path / "secrets.yaml"
    command = ["bash", str(repo_root / "scripts/env-seal.sh"), "--_test-dev-scan", str(secrets)]
    secrets.write_text(yaml.safe_dump({key: "realpassword123"}))
    valid = run_cmd(command)
    valid.check()
    assert "OK" in valid.output

    secrets.write_text(yaml.safe_dump({key: placeholder}))
    rejected = run_cmd(command)
    assert rejected.returncode != 0
    assert "dev placeholder" in rejected.output
    assert key in rejected.output


@pytest.mark.parametrize("required", [False, True])
def test_env_seal_empty_value_respects_schema(repo_root, run_cmd, tmp_path, required):
    key = "SMTP_PASSWORD" if required else "BRAINSTORM_OIDC_SECRET"
    schema = tmp_path / "schema.yaml"
    schema.write_text(
        f"version: 1\nsecrets:\n  - name: {key}\n"
        f"    required: {str(required).lower()}\n    generate: true\nsetup_vars: []\n"
    )
    secrets = tmp_path / "secrets.yaml"
    command = [
        "bash", str(repo_root / "scripts/env-seal.sh"),
        "--_test-dev-scan", str(secrets), "--_test-schema", str(schema),
    ]
    secrets.write_text(yaml.safe_dump({key: "realpassword123"}))
    valid = run_cmd(command)
    valid.check()
    assert "OK" in valid.output

    secrets.write_text(yaml.safe_dump({key: ""}))
    empty = run_cmd(command)
    if required:
        assert empty.returncode != 0
        assert key in empty.output
    else:
        empty.check()
        assert "OK" in empty.output


@pytest.mark.parametrize("env_value", ["SEALED", "realpassword"])
def test_env_seal_completeness_respects_sealed_setup_var(repo_root, run_cmd, tmp_path, env_value):
    key = "KC_USER1_PASSWORD"
    schema = tmp_path / "schema.yaml"
    schema.write_text(
        f"version: 1\nsecrets: []\nsetup_vars:\n  - name: {key}\n"
        "    required: true\n    sealed: true\n"
    )
    env_file = tmp_path / "env.yaml"
    env_file.write_text(yaml.safe_dump({key: env_value}))
    secrets = tmp_path / "secrets.yaml"
    command = [
        "bash", str(repo_root / "scripts/env-seal.sh"),
        "--_test-completeness", str(secrets),
        "--_test-schema", str(schema), "--_test-env-file", str(env_file),
    ]
    secrets.write_text(yaml.safe_dump({key: "mypassword123", "SOME_OTHER_KEY": "somevalue123"}))
    complete = run_cmd(command)
    complete.check()
    assert "OK" in complete.output

    secrets.write_text(yaml.safe_dump({"SOME_OTHER_KEY": "somevalue123"}))
    missing = run_cmd(command)
    if env_value == "SEALED":
        assert missing.returncode != 0
        assert key in missing.output
    else:
        missing.check()
        assert "OK" in missing.output


def test_dev_workspace_secrets_have_environment_label(repo_root: Path):
    # Manifest metadata is the result being guarded; no secret values are logged.
    with (repo_root / "k3d/secrets.yaml").open() as source:
        documents = yaml.safe_load_all(source)
        workspace = next((
            document for document in documents
            if document and document.get("metadata", {}).get("name") == "workspace-secrets"
        ), None)
    assert workspace is not None, "workspace-secrets not found"
    assert workspace.get("metadata", {}).get("labels", {}).get("environment") == "dev"
