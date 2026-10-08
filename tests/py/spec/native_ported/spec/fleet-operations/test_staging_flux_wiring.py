"""Native migration of tests/spec/fleet-operations/staging-flux-wiring.bats."""
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def paths(repo_root: Path):
    fleet = repo_root / "flux" / "clusters" / "fleet"
    return {
        "root": repo_root,
        "renderer": repo_root / "scripts" / "flux-render-artifact.sh",
        "ks_staging": fleet / "ks-staging.yaml",
        "ks_website_staging": fleet / "ks-website-staging.yaml",
        "ks_sealed_secrets": fleet / "ks-sealed-secrets.yaml",
        "staging_env": repo_root / "environments" / "staging.yaml",
    }


def _text(path: Path) -> str:
    assert path.is_file(), f"MISSING: {path}"
    return path.read_text(encoding="utf-8")


def test_flux_declares_ks_staging_targeting_staging(paths):
    text = _text(paths["ks_staging"])
    for needle in (
        "name: flux-staging",
        "path: ./staging",
        "prune: true",
        "kind: OCIRepository",
        "name: fleet-manifests",
        "name: flux-infra-controllers",
    ):
        assert needle in text, f"{needle} fehlt in ks-staging.yaml"


def test_flux_declares_ks_website_staging_targeting_website_staging(paths):
    text = _text(paths["ks_website_staging"])
    for needle in (
        "name: flux-website-staging",
        "path: ./website-staging",
        "prune: true",
        "name: fleet-manifests",
    ):
        assert needle in text, f"{needle} fehlt in ks-website-staging.yaml"


def test_ks_sealed_secrets_declares_the_staging_document(paths):
    text = _text(paths["ks_sealed_secrets"])
    assert "name: flux-sealed-secrets-staging" in text
    assert "path: ./sealed-secrets/staging" in text


def test_renderer_emits_staging_and_website_staging_trees_with_gate_coverage(paths):
    text = _text(paths["renderer"])
    for needle in (
        "render_component prod-fleet/staging",
        "render_component prod-fleet/website-staging",
        "env-resolve.sh staging",
        "sealed-secrets/staging",
        # Validation-Gate deckt beide neuen Baeume ab
        "${OUT_DIR}/staging",
        "${OUT_DIR}/website-staging",
    ):
        assert needle in text, f"{needle} fehlt in flux-render-artifact.sh"


def test_staging_env_profile_carries_offline_digest_placeholders(paths):
    text = _text(paths["staging_env"])
    lines = text.splitlines()
    for key in ("WEBSITE_IMAGE_DIGEST", "BRETT_IMAGE_DIGEST"):
        pattern = rf"^  {key}: sha256:[0-9a-f]{{64}}$"
        assert any(re.search(pattern, l) for l in lines), f"{key} Digest-Platzhalter fehlt"


def _env_after_sourcing(run_cmd, repo_root: Path, env_name: str) -> dict:
    res = run_cmd(
        ["bash", "-c", f"source scripts/env-resolve.sh {env_name} >/dev/null && env -0"],
        cwd=repo_root,
        timeout=300,
    )
    assert res.returncode == 0, f"env-resolve {env_name} fehlgeschlagen: {res.stderr}"
    env = {}
    for entry in res.stdout.split("\0"):
        if "=" in entry:
            key, _, value = entry.partition("=")
            env[key] = value
    return env


def test_rendered_staging_cronjobs_target_the_staging_website_namespace(paths, run_cmd, tmp_path):
    if shutil.which("kustomize") is None:
        pytest.skip("kustomize binary not installed")
    if shutil.which("envsubst") is None:
        pytest.skip("envsubst binary not installed")

    root = paths["root"]
    env = _env_after_sourcing(run_cmd, root, "staging")

    build = run_cmd(
        ["kustomize", "build", str(root / "prod-fleet" / "staging"), "--load-restrictor=LoadRestrictionsNone"],
        cwd=root,
        env=env,
        timeout=300,
    )
    assert build.returncode == 0, build.stderr
    rendered = build.stdout

    # Runtime-Vars ($${VAR}) ausnehmen — exakt der Renderer-Vertrag (T002306).
    runtime_vars = sorted(set(re.findall(r"\$\$\{([A-Za-z_][A-Za-z0-9_]*)\}", rendered)))
    all_vars = sorted(set(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", rendered)))
    ev = "".join(f"${v} " for v in all_vars if v not in runtime_vars)

    # sed -E 's/: \$\{X\}[[:space:]]*$/: "${X}"/g'
    quoted = re.sub(
        r": \$\{([a-zA-Z0-9_]+)\}[ \t]*$",
        r': "${\1}"',
        rendered,
        flags=re.MULTILINE,
    )
    pre = tmp_path / "pre-envsubst.yaml"
    pre.write_text(quoted, encoding="utf-8")

    subst = run_cmd(
        ["bash", "-c", 'envsubst "$1" < "$2"', "envsubst", ev, str(pre)],
        cwd=root,
        env=env,
        timeout=300,
    )
    assert subst.returncode == 0, subst.stderr
    out = subst.stdout

    # Kein Cross-Fire gegen die Prod-Website.
    assert "website.website.svc.cluster.local" not in out, \
        "staging manifest references prod website service"
    # WEBSITE_NAMESPACE loest auf die Staging-Website auf.
    assert re.search(r'value: "?website-staging"?', out), \
        "WEBSITE_NAMESPACE loest nicht auf website-staging auf"
