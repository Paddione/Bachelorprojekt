"""Tests for flux artifact versioning and render security (migrated from tests/spec/flux-artifact-versioning/ & tests/spec/flux-render-security/)."""

import os
from pathlib import Path
import re
import subprocess
import pytest


@pytest.fixture
def flux_env():
    env = os.environ.copy()
    env["SMTP_PORT"] = "587"
    env["SMTP_HOST"] = "smtp.example.org"
    env["SMTP_USER"] = "x"
    env["POCKET_ID_SMTP_TLS"] = "starttls"
    env["POCKET_ID_FRONTEND_URL"] = "https://auth.example"
    env["POCKET_ID_URL"] = "http://pocket-id:1411"
    env["POCKET_ID_DOMAIN"] = "id.example"
    env["WEBSITE_IMAGE_DIGEST"] = "sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41"
    env["BRETT_IMAGE_DIGEST"] = "sha256:9090909090909090909090909090909090909090909090909090909090909090"
    return env


def test_flux_bootstrap_envsubst(repo_root: Path):
    bootstrap_dir = repo_root / "flux" / "clusters" / "fleet" / "bootstrap"
    taskfile = repo_root / "taskfiles" / "Taskfile.platform.yml"
    assert bootstrap_dir.is_dir()
    assert taskfile.is_file()

    # extract placeholders
    placeholders = set()
    for f in bootstrap_dir.glob("*.yaml"):
        content = f.read_text()
        placeholders.update(re.findall(r"\$\{([A-Z_][A-Z0-9_]*)\}", content))

    taskfile_text = taskfile.read_text()
    # extract bootstrap task text
    m = re.search(r"^  flux:bootstrap:.*?(?=^  [a-z][a-z0-9:_-]*:|\Z)", taskfile_text, re.M | re.S)
    assert m is not None, "flux:bootstrap task not found in Taskfile.platform.yml"
    task_text = m.group(0)
    assert "envsubst" in task_text

    uncovered = [var for var in placeholders if var not in task_text]
    assert not uncovered, f"uncovered bootstrap placeholders: {uncovered}"

    # webhook ingress route
    ir = bootstrap_dir / "ingressroute-flux-webhook.yaml"
    assert ir.is_file()
    ir_text = ir.read_text()
    assert re.search(r"secretName:\s*flux-webhook-tls", ir_text)
    assert not re.search(r"secretName:\s*\$\{TLS_SECRET_NAME\}", ir_text)

    # webhook certificate
    cert = bootstrap_dir / "certificate-flux-webhook.yaml"
    assert cert.is_file()
    cert_text = cert.read_text()
    assert "kind: Certificate" in cert_text
    assert re.search(r"secretName:\s*flux-webhook-tls", cert_text)
    assert "flux-webhook." in cert_text


def test_flux_runtime_var_unwrapping(repo_root: Path):
    render_script = repo_root / "scripts" / "flux-render-artifact.sh"
    assert render_script.is_file()
    script_text = render_script.read_text()

    # Check unwrap pattern in script
    unwrap_pattern = r"\$\$([a-zA-Z0-9_({!?])"
    assert re.search(r"s/\\\$\\\$\[a-zA-Z0-9_\(\{!\?\]/\\\$1/g|s/\\\$\\\$\(\[a-zA-Z0-9_\(\{!\?\]\)/\\\$1/g", script_text) or "$$" in script_text

    def unwrap(s: str) -> str:
        return re.sub(unwrap_pattern, r"$\1", s)

    assert unwrap("mkdir -p $${CONFIG_PATH_FOR_INIT}") == "mkdir -p ${CONFIG_PATH_FOR_INIT}"
    assert unwrap("wait $$register_pid") == "wait $register_pid"
    assert unwrap("for i in $$(seq 1 3); do") == "for i in $(seq 1 3); do"
    assert unwrap("register_pid=$$! ; retval=$$?") == "register_pid=$! ; retval=$?"

    for manifest in [
        "k3d/cronjob-scheduled-publish.yaml",
        "k3d/notify-unread-cronjob.yaml",
        "k3d/error-log-retention-cronjob.yaml",
    ]:
        content = (repo_root / manifest).read_text()
        assert "Bearer $${CRON_SECRET}" in content
        assert "Bearer ${CRON_SECRET}" in unwrap(content)


def test_flux_render_artifact_and_security(repo_root: Path, flux_env, tmp_path: Path):
    render_script = repo_root / "scripts" / "flux-render-artifact.sh"
    assert render_script.is_file()

    out_dir = tmp_path / "out"
    res = subprocess.run(
        ["bash", str(render_script), "--out", str(out_dir)],
        cwd=repo_root,
        env=flux_env,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"Render failed: {res.stdout}\n{res.stderr}"

    # Prod trees check
    prod_trees = [out_dir / "mentolder", out_dir / "korczewski", out_dir / "website-mentolder", out_dir / "website-korczewski"]
    for t in prod_trees:
        assert t.is_dir(), f"Expected prod tree {t} not found"

    # Website pinned by digest
    website_yaml = out_dir / "website-mentolder" / "website-mentolder.yaml"
    assert website_yaml.is_file()
    assert "ghcr.io/paddione/website@sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41" in website_yaml.read_text()
    assert "sha256:1111111111111111111111111111111111111111111111111111111111111111" not in website_yaml.read_text()

    # No :latest tags for website or brett in prod trees
    for t in prod_trees:
        for yf in t.rglob("*.yaml"):
            text = yf.read_text()
            assert not re.search(r"image:\s*ghcr\.io/paddione/(website|workspace-brett):latest", text), f":latest tag in {yf}"

    # No hardcoded admin/admin grafana secrets in prod trees
    for t in [out_dir / "mentolder", out_dir / "korczewski"]:
        for yf in t.rglob("*.yaml"):
            text = yf.read_text()
            assert not ("key: admin-user" in text or "key: admin-password" in text)
            assert "YWRtaW4=" not in text


def test_flux_render_placeholder_digest_aborts(repo_root: Path, flux_env, tmp_path: Path):
    render_script = repo_root / "scripts" / "flux-render-artifact.sh"
    bad_env = flux_env.copy()
    bad_env["WEBSITE_IMAGE_DIGEST"] = "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    bad_env["BRETT_IMAGE_DIGEST"] = "sha256:2222222222222222222222222222222222222222222222222222222222222222"

    res = subprocess.run(
        ["bash", str(render_script), "--out", str(tmp_path / "out_bad")],
        cwd=repo_root,
        env=bad_env,
        capture_output=True,
        text=True,
    )
    assert res.returncode != 0
    assert "placeholder digest" in res.stdout or "placeholder digest" in res.stderr
