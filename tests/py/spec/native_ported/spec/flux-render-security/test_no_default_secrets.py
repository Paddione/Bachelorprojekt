"""Native migration of tests/spec/flux-render-security/no-default-secrets.bats."""

import re
from pathlib import Path

import pytest

FIXTURE_ENV = {
    "SMTP_PORT": "587",
    "SMTP_HOST": "smtp.example.org",
    "SMTP_USER": "x",
    "POCKET_ID_SMTP_TLS": "starttls",
    "POCKET_ID_FRONTEND_URL": "https://auth.example",
    "POCKET_ID_URL": "http://pocket-id:1411",
    "POCKET_ID_DOMAIN": "id.example",
    "WEBSITE_IMAGE_DIGEST": "sha256:565e7cecafd4d792620b4c68a168046481567dec53c4f61545f62f3edd1c7d41",
    "BRETT_IMAGE_DIGEST": "sha256:9090909090909090909090909090909090909090909090909090909090909090",
}


def _prod_trees(out: Path):
    return [out / "mentolder", out / "korczewski"]


def _yaml_files(trees):
    for tree in trees:
        if tree.is_dir():
            yield from sorted(p for p in tree.rglob("*.yaml") if p.is_file())


def _files_matching(trees, pattern: str):
    rx = re.compile(pattern)
    hits = []
    for path in _yaml_files(trees):
        if rx.search(path.read_text(encoding="utf-8", errors="replace")):
            hits.append(path)
    return hits


def _context_windows(lines, pattern, before, after):
    """Lines within `before`/`after` of each match, as grep -B/-A would print them."""
    rx = re.compile(pattern)
    idx = [i for i, l in enumerate(lines) if rx.search(l)]
    keep = set()
    for i in idx:
        keep.update(range(max(0, i - before), min(len(lines), i + after + 1)))
    return [lines[i] for i in sorted(keep)]


@pytest.fixture
def render(run_cmd, repo_root, tmp_path):
    script = repo_root / "scripts/flux-render-artifact.sh"
    out = tmp_path / "render"
    out.mkdir()
    res = run_cmd(["bash", str(script), "--out", str(out)], env=FIXTURE_ENV, timeout=900)
    return res, out


def test_no_default_secrets_renderer_produces_the_prod_trees_offline_positive_anchor(render):
    res, out = render
    assert res.returncode == 0, res.output
    for tree in _prod_trees(out):
        assert tree.is_dir(), f"missing {tree}"


def test_no_default_secrets_kein_monitoring_grafana_secret_mit_admin_user_admin_password_im_gerenderten_artefakt(render):
    res, out = render
    assert res.returncode == 0, res.output
    secret_files = _files_matching(_prod_trees(out), r"kind: Secret")
    assert len(secret_files) > 0
    bad = _files_matching(_prod_trees(out), r"key: admin-user|key: admin-password")
    assert not bad, f"admin-user/admin-password Secret-Keys gefunden: {bad}"


def test_no_default_secrets_keine_base64_ywrtaw3_admin_in_gerenderten_secrets(render):
    res, out = render
    assert res.returncode == 0, res.output
    bad = _files_matching(_prod_trees(out), r"YWRtaW4")
    assert not bad, f"base64 admin gefunden: {bad}"


def test_no_default_secrets_gf_security_admin_user_verwendet_value_admin_statt_secretkeyref_zu_monitoring_grafana(render):
    res, out = render
    assert res.returncode == 0, res.output
    manifest = out / "mentolder" / "mentolder.yaml"
    assert manifest.is_file()
    lines = manifest.read_text(encoding="utf-8").splitlines()
    assert any("GF_SECURITY_ADMIN_USER" in l for l in lines)
    context = _context_windows(lines, "GF_SECURITY_ADMIN_USER", before=3, after=5)
    joined = "\n".join(context)
    if "valueFrom" in joined:
        assert "monitoring-grafana" not in joined, (
            "GF_SECURITY_ADMIN_USER verweist noch auf monitoring-grafana Secret:\n" + joined
        )


def test_no_default_secrets_sidecar_req_username_verwendet_value_admin_statt_secretkeyref_zu_monitoring_grafana(render):
    res, out = render
    assert res.returncode == 0, res.output
    manifest = out / "mentolder" / "mentolder.yaml"
    assert manifest.is_file()
    lines = manifest.read_text(encoding="utf-8").splitlines()
    assert any("REQ_USERNAME" in l for l in lines)
    for idx, line in enumerate(lines):
        if "REQ_USERNAME" not in line:
            continue
        lineno = idx + 1
        start = max(1, lineno - 2)
        end = min(len(lines), lineno + 5)
        context = "\n".join(lines[start - 1:end])
        assert not ("valueFrom" in context and "monitoring-grafana" in context), (
            "REQ_USERNAME verweist noch auf monitoring-grafana Secret:\n" + context
        )
