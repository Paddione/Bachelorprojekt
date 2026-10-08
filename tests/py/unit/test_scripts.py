"""Tests for repo scripts, taskfile and kustomization hygiene (migrated from tests/unit/scripts.bats)."""

import json
from pathlib import Path
import shutil
import subprocess
import pytest
import yaml


def test_all_scripts_pass_bash_syntax_check(repo_root: Path):
    dirs = [repo_root / "scripts", repo_root / "tests" / "lib", repo_root / "tests" / "local"]
    failures = []
    for d in dirs:
        if not d.is_dir():
            continue
        for f in d.glob("*.sh"):
            res = subprocess.run(["bash", "-n", str(f)], capture_output=True)
            if res.returncode != 0:
                failures.append(f.name)
    assert not failures, f"Syntax errors in: {failures}"


def test_all_scripts_have_proper_shebang(repo_root: Path):
    scripts_dir = repo_root / "scripts"
    missing = []
    for f in scripts_dir.glob("*.sh"):
        first_line = f.read_bytes().split(b"\n", 1)[0]
        if not first_line.startswith(b"#!"):
            missing.append(f.name)
    assert not missing, f"Missing shebang: {missing}"


def test_runner_sh_usage_and_missing_args(repo_root: Path, run_cmd):
    runner = repo_root / "tests" / "runner.sh"
    res_help = run_cmd(["bash", str(runner), "--help"])
    assert res_help.returncode == 0
    assert "Usage" in res_help.stdout

    res_noargs = run_cmd(["bash", str(runner)])
    assert res_noargs.returncode != 0
    assert "Tier required" in res_noargs.stdout or "Tier required" in res_noargs.stderr


def test_taskfile_yaml_valid_and_version(repo_root: Path):
    taskfile = repo_root / "Taskfile.yml"
    with open(taskfile) as f:
        data = yaml.safe_load(f)
    assert str(data.get("version")) == "3"


def test_nextcloud_oidc_dev_php_syntax(repo_root: Path):
    if not shutil.which("php"):
        pytest.skip("php not installed")
    res = subprocess.run(["php", "-l", str(repo_root / "k3d" / "nextcloud-oidc-dev.php")], capture_output=True)
    assert res.returncode == 0


def test_kustomization_yaml_valid_and_references_exist(repo_root: Path):
    kustomization = repo_root / "k3d" / "kustomization.yaml"
    with open(kustomization) as f:
        data = yaml.safe_load(f)

    known_generated = {"secrets.yaml"}
    missing = []
    for res in data.get("resources", []):
        p = repo_root / "k3d" / res
        if not p.exists() and res not in known_generated:
            missing.append(res)
    assert not missing, f"Missing resource files: {missing}"

    missing_cm = []
    for gen in data.get("configMapGenerator", []):
        for fref in gen.get("files", []):
            src = fref.split("=")[-1]
            p = repo_root / "k3d" / src
            if not p.exists():
                missing_cm.append(src)
    assert not missing_cm, f"Missing configMap source files: {missing_cm}"


def test_key_tasks_parse_dry_run(repo_root: Path):
    if not shutil.which("task"):
        pytest.skip("task not installed")
    for t in ["workspace:validate", "workspace:status", "workspace:deploy"]:
        res = subprocess.run(["task", "--dry", t], cwd=repo_root, capture_output=True)
        assert res.returncode == 0, f"task --dry {t} failed:\n{res.stderr.decode()}"


def test_env_seal_dev_scan_guards(repo_root: Path, run_cmd, tmp_path: Path):
    env_seal = repo_root / "scripts" / "env-seal.sh"

    # rejects dev placeholder
    bad = tmp_path / "bad.yaml"
    bad.write_text('KEYCLOAK_DB_PASSWORD: "devkeycloakdb"\nNEXTCLOUD_DB_PASSWORD: "realpassword123"\n')
    res_bad = run_cmd(["bash", str(env_seal), "--_test-dev-scan", str(bad)])
    assert res_bad.returncode != 0
    assert "dev placeholder" in res_bad.stdout or "dev placeholder" in res_bad.stderr

    # passes with real values
    good = tmp_path / "good.yaml"
    good.write_text('KEYCLOAK_DB_PASSWORD: "xR7kP9mQ2nL5vB3h"\nNEXTCLOUD_DB_PASSWORD: "realpassword123"\n')
    res_good = run_cmd(["bash", str(env_seal), "--_test-dev-scan", str(good)])
    assert res_good.returncode == 0

    # force bypasses and warns
    res_force = run_cmd(["bash", str(env_seal), "--_test-dev-scan", str(bad), "--force"])
    assert res_force.returncode == 0
    assert "WARNING" in res_force.stdout or "WARNING" in res_force.stderr


def test_env_seal_duplicate_keys(repo_root: Path, run_cmd, tmp_path: Path):
    env_seal = repo_root / "scripts" / "env-seal.sh"

    dup = tmp_path / "dup.yaml"
    dup.write_text('KEYCLOAK_DB_PASSWORD: "1"\nNEXTCLOUD_DB_PASSWORD: "2"\nKEYCLOAK_DB_PASSWORD: "3"\n')
    res_dup = run_cmd(["bash", str(env_seal), "--_test-dup-check", str(dup)])
    assert res_dup.returncode != 0
    assert "Duplicate keys" in res_dup.stdout or "Duplicate keys" in res_dup.stderr

    nodup = tmp_path / "nodup.yaml"
    nodup.write_text('KEYCLOAK_DB_PASSWORD: "1"\nNEXTCLOUD_DB_PASSWORD: "2"\nSHARED_DB_PASSWORD: "3"\n')
    res_nodup = run_cmd(["bash", str(env_seal), "--_test-dup-check", str(nodup)])
    assert res_nodup.returncode == 0


def test_env_seal_completeness_check(repo_root: Path, run_cmd, tmp_path: Path):
    env_seal = repo_root / "scripts" / "env-seal.sh"

    schema = tmp_path / "schema.yaml"
    schema.write_text(
        "version: 1\nsecrets:\n  - name: REQUIRED_SECRET\n    required: true\n    generate: true\n    length: 32\nsetup_vars:\n  - name: KC_USER1_PASSWORD\n    required: true\n    sealed: true\n"
    )

    env_file = tmp_path / "env.yaml"
    env_file.write_text("KC_USER1_PASSWORD: SEALED\n")

    # missing keys
    secrets_missing = tmp_path / "secrets_missing.yaml"
    secrets_missing.write_text('SOME_OTHER_KEY: "val"\n')
    res_miss = run_cmd(
        [
            "bash",
            str(env_seal),
            "--_test-completeness",
            str(secrets_missing),
            "--_test-schema",
            str(schema),
            "--_test-env-file",
            str(env_file),
        ]
    )
    assert res_miss.returncode != 0

    # complete keys
    secrets_ok = tmp_path / "secrets_ok.yaml"
    secrets_ok.write_text('REQUIRED_SECRET: "realvalue123abc"\nKC_USER1_PASSWORD: "mypassword123"\n')
    res_ok = run_cmd(
        [
            "bash",
            str(env_seal),
            "--_test-completeness",
            str(secrets_ok),
            "--_test-schema",
            str(schema),
            "--_test-env-file",
            str(env_file),
        ]
    )
    assert res_ok.returncode == 0


def test_build_test_inventory(repo_root: Path, run_cmd, tmp_path: Path):
    script_orig = repo_root / "scripts" / "build-test-inventory.sh"
    script = tmp_path / "scripts" / "build-test-inventory.sh"
    script.parent.mkdir(parents=True)
    shutil.copy(script_orig, script)

    for p in ["tests/local", "tests/prod", "tests/e2e/specs", "components/website/src/data"]:
        (tmp_path / p).mkdir(parents=True)

    # duplicate test IDs
    (tmp_path / "tests/local/FA-1-login.bats").touch()
    (tmp_path / "tests/local/FA-1-logout.bats").touch()

    res_dup = run_cmd(["bash", str(script)], cwd=tmp_path)
    assert res_dup.returncode != 0
    assert "Duplicate test IDs found" in res_dup.stdout or "Duplicate test IDs found" in res_dup.stderr

    # clean tests
    (tmp_path / "tests/local/FA-1-logout.bats").unlink()
    (tmp_path / "tests/prod/FA-2-logout.bats").touch()
    (tmp_path / "tests/e2e/specs/fa-3-reset.spec.ts").touch()

    res_ok = run_cmd(["bash", str(script)], cwd=tmp_path)
    assert res_ok.returncode == 0

    inv_file = tmp_path / "components" / "website" / "src" / "data" / "test-inventory.json"
    assert inv_file.is_file()
    data = json.loads(inv_file.read_text())
    assert len(data) == 3
