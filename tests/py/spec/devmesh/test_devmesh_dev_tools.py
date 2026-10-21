"""Paddiones Dev-Tools (brain, Session-Hub, k1-embed) laufen auf devmesh, nicht in mentolder-Prod.

Pruefmodus: Ausgabe von render-stack.sh bzw. kubectl kustomize.
"""
import subprocess

import pytest
import yaml


class _Loader(yaml.SafeLoader):
    """kustomize gibt `=` als Wert aus; PyYAML liest das sonst als unbekannten Tag."""


_Loader.add_constructor("tag:yaml.org,2002:value", lambda loader, node: loader.construct_scalar(node))


def _docs(text):
    return {(d["kind"], d["metadata"]["name"]): d for d in yaml.load_all(text, Loader=_Loader) if d}


@pytest.fixture(scope="module")
def devmesh(repo_root):
    result = subprocess.run(
        ["bash", "scripts/devmesh/render-stack.sh", "core"], cwd=repo_root,
        capture_output=True, text=True, check=True,
    )
    return result.stdout, _docs(result.stdout)


def test_brain_on_devmesh(devmesh):
    _, docs = devmesh
    for name in ("brain", "oauth2-proxy-brain"):
        assert docs["Deployment", name]["metadata"]["namespace"] == "workspace"
    hosts = [r["host"] for r in docs["Ingress", "devmesh-brain"]["spec"]["rules"]]
    assert hosts == ["brain.devmesh.korczewski.de"]
    proxy = docs["Deployment", "oauth2-proxy-brain"]["spec"]["template"]["spec"]["containers"][-1]
    assert "--client-id=brain" in proxy["args"]
    assert "--redirect-url=https://brain.devmesh.korczewski.de/oauth2/callback" in proxy["args"]
    brain_docs = [d for (_, name), d in docs.items() if "brain" in name]
    assert brain_docs and "mentolder.de" not in yaml.safe_dump_all(brain_docs)


def test_sessions_on_devmesh(devmesh):
    _, docs = devmesh
    assert docs["Deployment", "sessions-server"]["metadata"]["namespace"] == "workspace"
    proxy = docs["Deployment", "oauth2-proxy-session-hub"]["spec"]["template"]["spec"]["containers"][-1]
    assert "--whitelist-domain=*.sessions.devmesh.korczewski.de" in proxy["args"]
    cert = docs["Certificate", "sessions-wildcard"]["spec"]
    assert cert["dnsNames"] == ["*.sessions.devmesh.korczewski.de"]
    assert cert["issuerRef"] == {"name": "letsencrypt-devmesh", "kind": "ClusterIssuer"}
    matches = [r["match"] for r in docs["IngressRoute", "sessions-server"]["spec"]["routes"]]
    assert all(r"sessions.devmesh.korczewski.de$" in m for m in matches)


def test_k1_embed_cronjob(devmesh):
    _, docs = devmesh
    cron = docs["CronJob", "k1-embed"]["spec"]
    assert cron["concurrencyPolicy"] == "Forbid"
    pod = cron["jobTemplate"]["spec"]["template"]["spec"]
    env = {e["name"]: e.get("value") for e in pod["containers"][0]["env"]}
    assert env["PGHOST"] == "shared-db.workspace.svc.cluster.local"
    assert all("$JOB_ID" not in str(v) and "$MERGE_SHA" not in str(v) for v in env.values())


def test_mentolder_overlay_clean(repo_root):
    result = subprocess.run(
        ["kubectl", "kustomize", "--load-restrictor=LoadRestrictionsNone", "prod-fleet/mentolder"],
        cwd=repo_root, capture_output=True, text=True, check=True,
    )
    names = {name for _, name in _docs(result.stdout)}
    assert "mentolder-web" in names  # Positiv-Anker: der Render liefert das mentolder-Overlay
    assert not names & {"brain", "oauth2-proxy-brain", "sessions-server", "oauth2-proxy-session-hub"}
    assert not (repo_root / ".github/workflows/k1-embed.yml").exists()
