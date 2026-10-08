"""Native migration of tests/unit/scripts.bats."""
import shutil
from pathlib import Path

import pytest

SEAL_SCRIPT = "scripts/env-seal.sh"


def _syntax_failures(run_cmd, files):
    return [f.name for f in files if run_cmd(["bash", "-n", str(f)]).returncode != 0]


def _write(path: Path, text: str) -> Path:
    path.write_text(text, encoding="utf-8")
    return path


def _seal(run_cmd, repo_root, *args):
    return run_cmd(["bash", str(repo_root / SEAL_SCRIPT), *args])


# -- Syntax validation --------------------------------------------------------

def test_all_scripts_sh_pass_bash_syntax_check(repo_root, run_cmd):
    files = sorted((repo_root / "scripts").glob("*.sh"))
    failures = _syntax_failures(run_cmd, files)
    assert not failures, f"Syntax errors in: {' '.join(failures)}"


def test_all_tests_lib_sh_pass_bash_syntax_check(repo_root, run_cmd):
    files = sorted((repo_root / "tests" / "lib").glob("*.sh"))
    failures = _syntax_failures(run_cmd, files)
    assert not failures, f"Syntax errors in: {' '.join(failures)}"


def test_all_tests_local_sh_pass_bash_syntax_check(repo_root, run_cmd):
    files = sorted((repo_root / "tests" / "local").glob("*.sh"))
    failures = _syntax_failures(run_cmd, files)
    assert not failures, f"Syntax errors in: {' '.join(failures)}"


# -- Shebang lines ------------------------------------------------------------

def test_all_scripts_have_proper_shebang(repo_root):
    missing = []
    for f in sorted((repo_root / "scripts").glob("*.sh")):
        with f.open(encoding="utf-8", errors="replace") as handle:
            first_line = handle.readline().rstrip("\r\n")
        if not first_line.startswith("#!/"):
            missing.append(f.name)
    assert not missing, f"Missing shebang: {' '.join(missing)}"


# -- Test runner --------------------------------------------------------------

def test_runner_sh_prints_usage_on_help(repo_root, run_cmd):
    result = run_cmd(["bash", str(repo_root / "tests" / "runner.sh"), "--help"])
    assert result.returncode == 0, result.output
    assert "Usage" in result.output


def test_runner_sh_exits_non_zero_without_arguments(repo_root, run_cmd):
    result = run_cmd(["bash", str(repo_root / "tests" / "runner.sh")])
    assert result.returncode != 0
    assert "Tier required" in result.output


# -- Taskfile and config files ------------------------------------------------

def test_taskfile_yml_is_valid_yaml(repo_root, yaml_load):
    yaml_load(repo_root / "Taskfile.yml")


def test_taskfile_yml_declares_version_3(repo_root):
    assert 'version: "3"' in (repo_root / "Taskfile.yml").read_text(encoding="utf-8")


def test_nextcloud_oidc_dev_php_has_valid_php_syntax(repo_root, run_cmd):
    if shutil.which("php") is None:
        pytest.skip("php not installed")
    result = run_cmd(["php", "-l", str(repo_root / "k3d" / "nextcloud-oidc-dev.php")])
    assert result.returncode == 0, result.output


def test_kustomization_yaml_is_valid_yaml(repo_root, yaml_load):
    yaml_load(repo_root / "k3d" / "kustomization.yaml")


# -- Kustomization references -------------------------------------------------

def test_all_resources_in_kustomization_yaml_exist_as_files(repo_root, yaml_load):
    known_generated = ["secrets.yaml"]  # gitignored, dev-only
    data = yaml_load(repo_root / "k3d" / "kustomization.yaml") or {}
    missing = []
    for res in data.get("resources", []) or []:
        if not res:
            continue
        target = repo_root / "k3d" / str(res)
        if not target.exists() and str(res) not in known_generated:
            missing.append(str(res))
    assert not missing, f"Missing resource files: {' '.join(missing)}"


def test_all_config_map_generator_source_files_exist(repo_root, yaml_load):
    data = yaml_load(repo_root / "k3d" / "kustomization.yaml") or {}
    missing = []
    for gen in data.get("configMapGenerator", []) or []:
        for fref in gen.get("files", []) or []:
            # Format: key=value or just filename
            src = str(fref).split("=")[-1]
            if not src:
                continue
            if not (repo_root / "k3d" / src).is_file():
                missing.append(src)
    assert not missing, f"Missing configMap source files: {' '.join(missing)}"


# -- Dry-run: key tasks parse -------------------------------------------------

@pytest.mark.parametrize("task_name", ["workspace:validate", "workspace:status", "workspace:deploy"])
def test_task_dry_parses_successfully(repo_root, run_cmd, task_name):
    if shutil.which("task") is None:
        pytest.skip("task (go-task) not installed")
    result = run_cmd(["task", "--dry", task_name], cwd=repo_root, timeout=300)
    assert result.returncode == 0, result.output


def test_k3d_secrets_yaml_workspace_secrets_has_environment_dev_label(repo_root, yaml_load):
    docs = yaml_load(repo_root / "k3d" / "secrets.yaml", all_docs=True)
    ws = next(
        (d for d in docs if d and (d.get("metadata") or {}).get("name") == "workspace-secrets"),
        None,
    )
    assert ws is not None, "workspace-secrets not found"
    labels = (ws.get("metadata") or {}).get("labels") or {}
    assert labels.get("environment") == "dev", f"expected environment=dev, got: {labels}"


# -- env-seal.sh --------------------------------------------------------------

def test_env_seal_rejects_dev_prefixed_values_without_force(repo_root, run_cmd, tmp_path):
    secrets = _write(
        tmp_path / "mysecrets.yaml",
        'KEYCLOAK_DB_PASSWORD: "devkeycloakdb"\nNEXTCLOUD_DB_PASSWORD: "realpassword123"\n',
    )
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode != 0
    assert "dev placeholder" in result.output
    assert "KEYCLOAK_DB_PASSWORD" in result.output


def test_env_seal_dev_value_scan_passes_with_no_dev_values(repo_root, run_cmd, tmp_path):
    secrets = _write(
        tmp_path / "mysecrets.yaml",
        'KEYCLOAK_DB_PASSWORD: "xR7kP9mQ2nL5vB3h"\nNEXTCLOUD_DB_PASSWORD: "realpassword123"\n',
    )
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode == 0, result.output
    assert "OK" in result.output


def test_env_seal_dev_value_scan_force_bypasses_and_warns(repo_root, run_cmd, tmp_path):
    secrets = _write(tmp_path / "mysecrets.yaml", 'KEYCLOAK_DB_PASSWORD: "devkeycloakdb"\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets), "--force")
    assert result.returncode == 0, result.output
    assert "WARNING" in result.output


def test_env_seal_rejects_dev_placeholder_suffix_values(repo_root, run_cmd, tmp_path):
    secrets = _write(tmp_path / "mysecrets.yaml", 'GITHUB_PAT: "ghp_dev_placeholder"\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode != 0
    assert "dev placeholder" in result.output
    assert "GITHUB_PAT" in result.output


def test_env_seal_rejects_placeholder_suffix_values(repo_root, run_cmd, tmp_path):
    secrets = _write(tmp_path / "mysecrets.yaml", 'STRIPE_SECRET_KEY: "sk_test_placeholder"\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode != 0
    assert "dev placeholder" in result.output


def test_env_seal_rejects_not_configured_values(repo_root, run_cmd, tmp_path):
    secrets = _write(tmp_path / "mysecrets.yaml", 'GITHUB_PAT: "not-configured"\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode != 0
    assert "dev placeholder" in result.output
    assert "GITHUB_PAT" in result.output


def test_env_seal_rejects_managed_externally_values(repo_root, run_cmd, tmp_path):
    secrets = _write(tmp_path / "mysecrets.yaml", 'KEYCLOAK_ADMIN_PASSWORD: "MANAGED_EXTERNALLY"\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode != 0
    assert "dev placeholder" in result.output
    assert "KEYCLOAK_ADMIN_PASSWORD" in result.output


def test_env_seal_rejects_empty_values(repo_root, run_cmd, tmp_path):
    secrets = _write(tmp_path / "mysecrets.yaml", 'SMTP_PASSWORD: ""\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets))
    assert result.returncode != 0
    assert "SMTP_PASSWORD" in result.output


def test_env_seal_allows_empty_value_for_schema_required_false_secret(repo_root, run_cmd, tmp_path):
    schema = _write(
        tmp_path / "schema.yaml",
        "version: 1\nsecrets:\n  - name: BRAINSTORM_OIDC_SECRET\n    required: false\n    generate: true\nsetup_vars: []\n",
    )
    secrets = _write(tmp_path / "mysecrets.yaml", 'BRAINSTORM_OIDC_SECRET: ""\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets), "--_test-schema", str(schema))
    assert result.returncode == 0, result.output
    assert "OK" in result.output


def test_env_seal_still_rejects_empty_value_for_schema_required_true_secret(repo_root, run_cmd, tmp_path):
    schema = _write(
        tmp_path / "schema.yaml",
        "version: 1\nsecrets:\n  - name: SMTP_PASSWORD\n    required: true\nsetup_vars: []\n",
    )
    secrets = _write(tmp_path / "mysecrets.yaml", 'SMTP_PASSWORD: ""\n')
    result = _seal(run_cmd, repo_root, "--_test-dev-scan", str(secrets), "--_test-schema", str(schema))
    assert result.returncode != 0
    assert "SMTP_PASSWORD" in result.output


def test_env_seal_rejects_secrets_file_with_duplicate_keys(repo_root, run_cmd, tmp_path):
    secrets = _write(
        tmp_path / "mysecrets.yaml",
        'KEYCLOAK_DB_PASSWORD: "realpassword123"\n'
        'NEXTCLOUD_DB_PASSWORD: "anothersecret456"\n'
        'KEYCLOAK_DB_PASSWORD: "differentvalue789"\n',
    )
    result = _seal(run_cmd, repo_root, "--_test-dup-check", str(secrets))
    assert result.returncode != 0
    assert "KEYCLOAK_DB_PASSWORD" in result.output
    assert "Duplicate keys" in result.output


def test_env_seal_accepts_secrets_file_with_no_duplicate_keys(repo_root, run_cmd, tmp_path):
    secrets = _write(
        tmp_path / "mysecrets.yaml",
        'KEYCLOAK_DB_PASSWORD: "realpassword123"\n'
        'NEXTCLOUD_DB_PASSWORD: "anothersecret456"\n'
        'SHARED_DB_PASSWORD: "thirdsecret789"\n',
    )
    result = _seal(run_cmd, repo_root, "--_test-dup-check", str(secrets))
    assert result.returncode == 0, result.output
    assert "OK" in result.output


def test_env_seal_completeness_rejects_missing_required_secret_key(repo_root, run_cmd, tmp_path):
    schema = _write(
        tmp_path / "schema.yaml",
        "version: 1\nsecrets:\n  - name: REQUIRED_SECRET\n    required: true\n    generate: true\n    length: 32\nsetup_vars: []\n",
    )
    secrets = _write(tmp_path / "secrets.yaml", 'SOME_OTHER_KEY: "somevalue123"\n')
    result = _seal(run_cmd, repo_root, "--_test-completeness", str(secrets), "--_test-schema", str(schema))
    assert result.returncode != 0
    assert "REQUIRED_SECRET" in result.output


def test_env_seal_completeness_rejects_missing_sealed_setup_var(repo_root, run_cmd, tmp_path):
    schema = _write(
        tmp_path / "schema.yaml",
        "version: 1\nsecrets: []\nsetup_vars:\n  - name: KC_USER1_PASSWORD\n    required: true\n    sealed: true\n",
    )
    env_file = _write(tmp_path / "env.yaml", "KC_USER1_PASSWORD: SEALED\n")
    secrets = _write(tmp_path / "secrets.yaml", 'SOME_OTHER_KEY: "somevalue123"\n')
    result = _seal(
        run_cmd, repo_root,
        "--_test-completeness", str(secrets),
        "--_test-schema", str(schema),
        "--_test-env-file", str(env_file),
    )
    assert result.returncode != 0
    assert "KC_USER1_PASSWORD" in result.output


def test_env_seal_completeness_passes_when_all_required_keys_present(repo_root, run_cmd, tmp_path):
    schema = _write(
        tmp_path / "schema.yaml",
        "version: 1\nsecrets:\n  - name: REQUIRED_SECRET\n    required: true\n    generate: true\n    length: 32\n"
        "setup_vars:\n  - name: KC_USER1_PASSWORD\n    required: true\n    sealed: true\n",
    )
    env_file = _write(tmp_path / "env.yaml", "KC_USER1_PASSWORD: SEALED\n")
    secrets = _write(
        tmp_path / "secrets.yaml",
        'REQUIRED_SECRET: "realvalue123abc"\nKC_USER1_PASSWORD: "mypassword123"\n',
    )
    result = _seal(
        run_cmd, repo_root,
        "--_test-completeness", str(secrets),
        "--_test-schema", str(schema),
        "--_test-env-file", str(env_file),
    )
    assert result.returncode == 0, result.output
    assert "OK" in result.output


def test_env_seal_completeness_skips_non_sealed_setup_vars(repo_root, run_cmd, tmp_path):
    schema = _write(
        tmp_path / "schema.yaml",
        "version: 1\nsecrets: []\nsetup_vars:\n  - name: KC_USER1_PASSWORD\n    required: true\n    sealed: true\n",
    )
    env_file = _write(tmp_path / "env.yaml", "KC_USER1_PASSWORD: realpassword\n")
    secrets = _write(tmp_path / "secrets.yaml", 'SOME_OTHER_KEY: "somevalue123"\n')
    result = _seal(
        run_cmd, repo_root,
        "--_test-completeness", str(secrets),
        "--_test-schema", str(schema),
        "--_test-env-file", str(env_file),
    )
    assert result.returncode == 0, result.output


# -- build-test-inventory.sh --------------------------------------------------

def _inventory_sandbox(repo_root: Path, tmp_path: Path) -> Path:
    sandbox = tmp_path / "sandbox"
    for sub in ("scripts/lib", "tests/local", "tests/prod", "tests/e2e/specs", "components/website/src/data"):
        (sandbox / sub).mkdir(parents=True)
    shutil.copy(repo_root / "scripts" / "build-test-inventory.sh", sandbox / "scripts")
    shutil.copy(repo_root / "scripts" / "lib" / "pytest-inventory.py", sandbox / "scripts" / "lib")
    return sandbox


def test_build_test_inventory_detects_duplicate_test_ids_and_exits_non_zero(repo_root, run_cmd, tmp_path):
    sandbox = _inventory_sandbox(repo_root, tmp_path)
    (sandbox / "tests/local/FA-1-login.sh").touch()
    (sandbox / "tests/local/FA-1-logout.sh").touch()

    result = run_cmd(["bash", str(sandbox / "scripts" / "build-test-inventory.sh")])
    assert result.returncode != 0
    assert "Duplicate test IDs found" in result.output
    assert "FA-1" in result.output


def test_build_test_inventory_succeeds_when_no_duplicate_test_ids(repo_root, run_cmd, tmp_path):
    if shutil.which("jq") is None:
        pytest.skip("jq not installed")
    sandbox = _inventory_sandbox(repo_root, tmp_path)
    (sandbox / "tests/local/FA-1-login.sh").touch()
    (sandbox / "tests/prod/FA-2-logout.sh").touch()
    (sandbox / "tests/e2e/specs/fa-3-reset.spec.ts").touch()

    result = run_cmd(["bash", str(sandbox / "scripts" / "build-test-inventory.sh")])
    assert result.returncode == 0, result.output

    inventory = sandbox / "components/website/src/data/test-inventory.json"
    assert inventory.is_file()
    count = run_cmd(["jq", ". | length", str(inventory)])
    assert count.returncode == 0, count.output
    assert count.output == "3"
