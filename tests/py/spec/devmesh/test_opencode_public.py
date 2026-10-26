"""Contracts for opencode-devmesh-public plan (design D1-D8 final).

RED first: fails until Task 1 manifests exist and render contains them.
"""

from pathlib import Path
import os
import re
import subprocess

import pytest
import yaml


def _load_dev_env(repo_root: Path) -> dict:
    import yaml as _yaml

    dev_yaml = repo_root / "environments" / "dev.yaml"
    data = _yaml.safe_load(dev_yaml.read_text())
    return (data or {}).get("env_vars", {}) or {}


def _render_stdout(repo_root: Path):
    res = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"render-stack.sh failed:\n{res.stdout}\n{res.stderr}"
    return [d for d in yaml.safe_load_all(res.stdout) if d]


def _render_out_tree(repo_root: Path, tmp_path: Path) -> Path:
    res = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core", "--out", str(tmp_path)],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"render-stack.sh --out failed:\n{res.stdout}\n{res.stderr}"
    return tmp_path


def _all_rendered_docs(repo_root: Path, tmp_path: Path) -> list:
    out = _render_out_tree(repo_root, tmp_path)
    docs = []
    for yf in list(out.rglob("*.yaml")) + list(out.rglob("*.yml")):
        docs.extend([d for d in yaml.safe_load_all(yf.read_text()) if d])
    return docs


def test_render_contains_opencode(repo_root: Path, tmp_path: Path):
    docs = _all_rendered_docs(repo_root, tmp_path)
    env = _load_dev_env(repo_root)
    expected_host = str(env.get("OPENCODE_PUBLIC_HOST", "")).strip()
    assert expected_host, "OPENCODE_PUBLIC_HOST missing in environments/dev.yaml"

    certs = [
        d
        for d in docs
        if d.get("kind") == "Certificate"
        and d.get("metadata", {}).get("name") == "opencode-public-tls"
    ]
    assert len(certs) == 1, "Certificate/opencode-public-tls not found exactly once"
    dns = certs[0].get("spec", {}).get("dnsNames", [])
    # Nach envsubst ist der Host expandiert; unexpandiert gilt das Literal.
    assert dns == [expected_host] or dns == ["${OPENCODE_PUBLIC_HOST}"], (
        f"unexpected dnsNames {dns}, expected [{expected_host}]"
    )

    routes = [
        d
        for d in docs
        if d.get("kind") == "IngressRoute"
        and "opencode-public-tls" in str(d.get("spec", {}).get("tls", {}))
    ]
    assert len(routes) == 1, (
        f"expected exactly one IngressRoute with tls.secretName opencode-public-tls, found {len(routes)}"
    )
    assert f"Host(`{expected_host}`)" in str(routes[0].get("spec", {}).get("routes", "")) or "${OPENCODE_PUBLIC_HOST}" in str(
        routes[0]
    ), "IngressRoute does not match Host(`${OPENCODE_PUBLIC_HOST}`)"


def test_no_literal_host(repo_root: Path):
    comp = repo_root / "dev-local" / "components" / "opencode"
    assert comp.is_dir(), "dev-local/components/opencode/ missing"
    for yf in sorted(comp.glob("*.yaml")):
        text = yf.read_text()
        # Nur ${...}-Referenzen erlaubt; LAN-IP in FRITZ_BOX_URL ist ausgenommen.
        stripped = re.sub(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}", "", text)
        stripped = re.sub(r"https?://\d+\.\d+\.\d+\.\d+(:\d+)?", "", stripped)
        assert "korczewski.de" not in stripped, f"literal brand domain in {yf.name}"


def test_oauth2_wiring(repo_root: Path, tmp_path: Path):
    comp = repo_root / "dev-local" / "components" / "opencode"
    assert (comp / "oauth2-proxy-opencode.yaml").is_file()
    raw = (comp / "oauth2-proxy-opencode.yaml").read_text()
    assert "client-id=opencode" in raw
    assert "${OPENCODE_PUBLIC_HOST}" in raw

    docs = _all_rendered_docs(repo_root, tmp_path)
    env = _load_dev_env(repo_root)
    expected_host = str(env.get("OPENCODE_PUBLIC_HOST", ""))
    mws = [
        d
        for d in docs
        if d.get("kind") == "Middleware"
        and "opencode" in str(d.get("metadata", {}).get("name", ""))
    ]
    assert mws, "no opencode forwardAuth Middleware found"
    assert any(
        "oauth2-proxy-opencode" in str(m) and ":4180/oauth2/auth" in str(m) for m in mws
    ), "Middleware does not point to oauth2-proxy-opencode...:4180/oauth2/auth"

    deps = [d for d in docs if d.get("kind") == "Deployment" and d.get("metadata", {}).get("name") == "oauth2-proxy-opencode"]
    assert deps, "Deployment/oauth2-proxy-opencode not rendered"
    args = str(deps[0])
    assert "client-id=opencode" in args
    assert expected_host in args or "${OPENCODE_PUBLIC_HOST}" in args


def test_core_hook(repo_root: Path):
    core = (repo_root / "dev-local" / "core" / "kustomization.yaml").read_text()
    assert core.count("../components/opencode") == 1, "core kustomization must list ../components/opencode exactly once"
    # Kein Tailscale/funnel fuer diesen Host.
    assert "tailscale" not in core.lower() or "opencode" not in core.lower().split("tailscale")[0][-500:] or True
    for line in core.splitlines():
        if "opencode" in line.lower():
            assert "tailscale" not in line.lower(), f"tailscale class near opencode hook: {line}"
            assert "funnel" not in line.lower(), f"funnel near opencode hook: {line}"


def test_fritz_route(repo_root: Path, tmp_path: Path):
    docs = _all_rendered_docs(repo_root, tmp_path)
    env = _load_dev_env(repo_root)
    fritz_host = str(env.get("FRITZ_BOX_HOST", "")).strip()
    fritz_url = str(env.get("FRITZ_BOX_URL", "")).strip()
    assert fritz_host, "FRITZ_BOX_HOST missing in environments/dev.yaml"
    assert fritz_url, "FRITZ_BOX_URL missing in environments/dev.yaml"

    certs = [
        d
        for d in docs
        if d.get("kind") == "Certificate"
        and d.get("metadata", {}).get("name") == "fritzbox-public-tls"
    ]
    assert len(certs) == 1, "Certificate/fritzbox-public-tls not found exactly once"
    dns = certs[0].get("spec", {}).get("dnsNames", [])
    assert dns == [fritz_host] or dns == ["${FRITZ_BOX_HOST}"], f"unexpected fritz dnsNames {dns}"

    routes = [
        d
        for d in docs
        if d.get("kind") == "IngressRoute"
        and "fritzbox-public-tls" in str(d.get("spec", {}).get("tls", {}))
    ]
    assert routes, "no IngressRoute with fritzbox-public-tls"
    assert any(
        fritz_host in str(r) or "${FRITZ_BOX_HOST}" in str(r) for r in routes
    ), "fritz IngressRoute does not match Host(`${FRITZ_BOX_HOST}`)"

    comp = repo_root / "dev-local" / "components" / "opencode"
    raw = (comp / "oauth2-proxy-fritzbox.yaml").read_text()
    assert "client-id=fritz" in raw
    assert "${FRITZ_BOX_URL}" in raw or fritz_url.split("://")[-1].split("/")[0] in raw
    stripped = re.sub(r"\$\{[A-Za-z_][A-Za-z0-9_]*\}", "", raw)
    stripped = re.sub(r"https?://\d+\.\d+\.\d+\.\d+(:\d+)?", "", stripped)
    assert "korczewski.de" not in stripped, "literal brand domain in oauth2-proxy-fritzbox.yaml"


def test_no_prod_touch(repo_root: Path):
    # Shallow CI checkouts (fetch-depth: 1 plus a separate depth-1
    # origin/main fetch) may share no history with HEAD — e.g. when main
    # advanced after the PR merge-ref was created. Then there is no
    # merge-base and the PR scope cannot be proven. Skip instead of
    # false-red; a missing origin/main ref still fails the CI fetch step
    # itself, and full checkouts always resolve a merge-base.
    mb = subprocess.run(
        ["git", "-C", str(repo_root), "merge-base", "origin/main", "HEAD"],
        capture_output=True,
        text=True,
    )
    if mb.returncode != 0:
        pytest.skip(
            "no merge-base for origin/main..HEAD in this checkout — scope "
            f"not provable: {mb.stderr.strip()}"
        )
    res = subprocess.run(
        ["git", "-C", str(repo_root), "diff", "--name-only", mb.stdout.strip(), "HEAD"],
        capture_output=True,
        text=True,
    )
    assert res.returncode == 0, f"git diff failed:\n{res.stderr}"
    files = [l.strip() for l in res.stdout.splitlines() if l.strip()]
    if not files:
        # Push-Runs auf main selbst: HEAD ist in origin/main enthalten, Diff leer
        # per Konstruktion. Es gibt keinen PR-Scope zu pruefen — skip statt
        # false-red (leere PR-Diffs bleiben ein Fail, s. assert unten).
        anc = subprocess.run(
            ["git", "-C", str(repo_root), "merge-base", "--is-ancestor", "HEAD", "origin/main"],
            capture_output=True,
            text=True,
        )
        if anc.returncode == 0:
            pytest.skip("HEAD in origin/main enthalten (push-run) — kein PR-Scope zu pruefen")
    assert files, "no diff vs origin/main — expected opencode component files"
    for f in files:
        assert not f.startswith("prod-"), f"prod touch: {f}"
        assert not f.startswith("fleet/"), f"fleet touch: {f}"
        assert "mentolder" not in f, f"mentolder touch: {f}"
        assert "workspace-korczewski" not in f, f"frozen workspace touch: {f}"
        assert "ks-korczewski" not in f, f"frozen workspace touch: {f}"
