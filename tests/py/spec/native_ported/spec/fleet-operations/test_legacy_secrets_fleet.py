"""Native migration of tests/spec/fleet-operations/legacy-secrets-fleet.bats."""
from pathlib import Path

import pytest

pytestmark = pytest.mark.repo_lock("legacy-secrets-fleet")


@pytest.fixture
def helper(repo_root: Path) -> Path:
    return repo_root / "scripts" / "lib" / "secrets-env.sh"


def _secrets_env_for(run_cmd, repo_root: Path, helper: Path, args: str):
    return run_cmd(
        ["bash", "-c", f"source '{helper}' && cd '{repo_root}' && secrets_env_for {args}"],
        cwd=repo_root,
    )


def test_t900789_secrets_env_for_loest_legacy_envs_auf_fleet_brand_auf(repo_root, helper, run_cmd):
    assert helper.is_file()
    res = _secrets_env_for(run_cmd, repo_root, helper, "mentolder")
    assert res.returncode == 0, res.output
    assert res.output == "fleet-mentolder"
    res = _secrets_env_for(run_cmd, repo_root, helper, "korczewski")
    assert res.output == "fleet-korczewski"


def test_t900789_secrets_env_for_ohne_feld_liefert_den_env_namen_selbst(repo_root, helper, run_cmd):
    assert helper.is_file()
    res = _secrets_env_for(run_cmd, repo_root, helper, "dev && secrets_env_for fleet-mentolder")
    assert res.returncode == 0, res.output
    assert res.output == "dev\nfleet-mentolder"


def test_t900789_legacy_secret_dateien_existieren_nicht_mehr(repo_root):
    for f in (
        ".secrets/mentolder.yaml",
        ".secrets/korczewski.yaml",
        "sealed-secrets/mentolder.yaml",
        "sealed-secrets/korczewski.yaml",
    ):
        assert not (repo_root / "environments" / f).exists(), f"noch vorhanden: environments/{f}"


def test_t900789_kein_task_skript_bildet_secret_pfade_direkt_aus_dem_env_namen(repo_root, run_cmd):
    pattern = r"(\.secrets|sealed-secrets)/(\{\{\.ENV\}\}|\$\{?ENV(_NAME)?\}?)\.yaml"
    res = run_cmd(
        [
            "git", "grep", "-nE", pattern, "--",
            "taskfiles", "Taskfile.yml", "scripts",
            ":!taskfiles/Taskfile.dev-stack.yml",
            ":!scripts/lib/secrets-env.sh",
            ":!scripts/lib/seal-extra-namespaces.sh",
        ],
        cwd=repo_root,
    )
    assert res.returncode != 0, res.output

    res = run_cmd(
        ["git", "grep", "-n", "environments/.secrets/mentolder.yaml", "--", "scripts"],
        cwd=repo_root,
    )
    assert res.returncode != 0, res.output


def test_t900789_env_generate_env_seal_secret_rotate_loesen_ueber_secrets_env_auf(repo_root, run_cmd):
    for f in ("scripts/env-generate.sh", "scripts/env-seal.sh", "scripts/secret-rotate.sh"):
        text = (repo_root / f).read_text(encoding="utf-8")
        assert "lib/secrets-env.sh" in text, f"ohne Helper: {f}"

    res = run_cmd(
        ["bash", "scripts/env-generate.sh", "--env", "mentolder", "--env-dir", "environments"],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode != 0, res.output
    assert "fleet-mentolder" in res.output
    assert not (repo_root / "environments" / ".secrets" / "mentolder.yaml").exists()
