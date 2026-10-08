"""Native migration of tests/spec/secrets-deploy-automation.bats."""
import json
import re

import pytest


@pytest.fixture
def seal_script(repo_root):
    return repo_root / "scripts/env-seal.sh"


def write_schema(path):
    path.write_text(
        "version: 1\n"
        "secrets:\n"
        "  - name: SHARED_DB_PASSWORD\n"
        "    required: true\n"
        "    generate: true\n"
        "    length: 32\n"
    )


def test_prod_kustomization_yaml_contains_patch_delete_for_workspace_secrets(repo_root):
    kust = repo_root / "prod/kustomization.yaml"
    assert kust.is_file(), f"{kust} fehlt"
    pattern = re.compile(r"patch.*delete|delete.*patch|\$patch.*delete")
    count = sum(1 for line in kust.read_text(encoding="utf-8", errors="replace").splitlines() if pattern.search(line))
    assert count >= 1


def test_env_seal_required_key_missing_from_sealed_file_is_detected(run_cmd, seal_script, tmp_path):
    schema_file = tmp_path / "schema.yaml"
    sealed_file = tmp_path / "sealed.yaml"
    env_file = tmp_path / "env.yaml"
    schema_file.write_text(
        "version: 1\n"
        "secrets:\n"
        "  - name: SHARED_DB_PASSWORD\n"
        "    required: true\n"
        "    generate: true\n"
        "    length: 32\n"
        "  - name: SMTP_PASSWORD\n"
        "    required: true\n"
        "    generate: true\n"
        "    length: 32\n"
    )
    sealed_file.write_text(
        "apiVersion: bitnami.com/v1alpha1\n"
        "kind: SealedSecret\n"
        "spec:\n"
        "  encryptedData:\n"
        '    SHARED_DB_PASSWORD: "AgBCDEFGH..."\n'
    )
    env_file.write_text("{}\n")

    run = run_cmd(
        ["bash", str(seal_script), "--env", "_noexist",
         "--_test-completeness", str(sealed_file),
         "--_test-schema", str(schema_file),
         "--_test-env-file", str(env_file)],
        timeout=120,
    )
    assert run.returncode != 0, run.output
    assert "SMTP_PASSWORD" in run.output


def test_env_seal_completeness_check_format_is_the_secrets_file_key_value(run_cmd, seal_script, tmp_path):
    schema_file = tmp_path / "schema.yaml"
    secrets_file = tmp_path / "secrets.yaml"
    env_file = tmp_path / "env.yaml"
    write_schema(schema_file)
    secrets_file.write_text('SHARED_DB_PASSWORD: "real-value-abc"\n')
    env_file.write_text("{}\n")

    run = run_cmd(
        ["bash", str(seal_script), "--env", "_noexist",
         "--_test-completeness", str(secrets_file),
         "--_test-schema", str(schema_file),
         "--_test-env-file", str(env_file)],
        timeout=120,
    )
    assert run.returncode == 0, run.output


def test_env_seal_completeness_check_passes_when_all_required_keys_are_present(run_cmd, seal_script, tmp_path):
    schema_file = tmp_path / "schema.yaml"
    secrets_file = tmp_path / "secrets_complete.yaml"
    env_file = tmp_path / "env.yaml"
    write_schema(schema_file)
    secrets_file.write_text('SHARED_DB_PASSWORD: "real-value-X7k9mQ2v"\n')
    env_file.write_text("{}\n")

    run = run_cmd(
        ["bash", str(seal_script), "--env", "_noexist",
         "--_test-completeness", str(secrets_file),
         "--_test-schema", str(schema_file),
         "--_test-env-file", str(env_file)],
        timeout=120,
    )
    assert run.returncode == 0, run.output


def _sealed_has_encrypted_data(repo_root, name):
    sealed = repo_root / "environments/sealed-secrets" / name
    if not sealed.is_file():
        pytest.skip(f"{name.removesuffix('.yaml')} sealed-secrets not found (env not sealed yet)")
    count = sum(1 for line in sealed.read_text(encoding="utf-8", errors="replace").splitlines() if "encryptedData" in line)
    assert count >= 1


def test_sealed_secrets_fleet_mentolder_yaml_exists_and_has_encrypteddata(repo_root):
    _sealed_has_encrypted_data(repo_root, "fleet-mentolder.yaml")


def test_sealed_secrets_fleet_korczewski_yaml_exists_and_has_encrypteddata(repo_root):
    _sealed_has_encrypted_data(repo_root, "fleet-korczewski.yaml")


TOKEN_RE = re.compile(r'"(ghp_|github_pat_|sk-|xox)[A-Za-z0-9_\-]{5,}')


def test_red_guard_harness_config_files_contain_no_secret_patterns(repo_root):
    # RED-Guard (T002214 Task 1): Konfigurationsdateien duerfen keine Klartext-Tokens enthalten.
    errors = []

    agy = repo_root / "dotfiles/agy/settings.json"
    if agy.is_file():
        if TOKEN_RE.search(agy.read_text(encoding="utf-8", errors="replace")):
            errors.append("dotfiles/agy/settings.json contains token-prefixed secrets")
    else:
        errors.append("dotfiles/agy/settings.json not found")

    oc = repo_root / "dotfiles/opencode/config.json"
    if oc.is_file():
        if TOKEN_RE.search(oc.read_text(encoding="utf-8", errors="replace")):
            errors.append("dotfiles/opencode/config.json contains token-prefixed secrets")
    else:
        errors.append("dotfiles/opencode/config.json not found")

    # .claude/settings.json muss IMMER gruen sein.
    claude = repo_root / ".claude/settings.json"
    if claude.is_file():
        text = claude.read_text(encoding="utf-8", errors="replace")
        if TOKEN_RE.search(text):
            errors.append(".claude/settings.json contains token-prefixed secrets")
        try:
            env = json.loads(text).get("env")
        except (ValueError, AttributeError):
            env = None
        if isinstance(env, dict):
            for key, value in env.items():
                if re.search(r"_(TOKEN|KEY|SECRET)$", key) and len(str(value)) > 20:
                    errors.append(".claude/settings.json contains long env secrets")
                    break

    assert not errors, "RED-guard FAILED — secrets found in config files:\n" + "\n".join(errors)
