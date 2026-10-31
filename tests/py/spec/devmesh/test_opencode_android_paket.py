"""Android-Paket: opencode-Server dauerhaft per Tailscale erreichbar.

Vertrag (RED ohne die Paket-Aenderungen):
- offizielles Image ghcr.io/anomalyco/opencode mit Versionstag + Digest-Pin
- OPENCODE_SERVER_PASSWORD aus workspace-secrets (Basic-Auth, User opencode)
- Tailscale-Service opencode-tailnet (expose + hostname opencode, Port 4096)
- NetworkPolicies fuer app=opencode (4096 in; DNS/443/8001/8080 out) und
  app=oauth2-proxy-opencode (4180 in; DNS/443/1411 out)
- vLLM-Provider-Konfig (ConfigMap, gueltiges JSON, baseURL + Modell) und Mount
"""

import json
from pathlib import Path

import pytest
import yaml


def _comp_docs(repo_root: Path, name: str) -> list:
    comp = repo_root / "dev-local" / "components" / "opencode" / name
    assert comp.is_file(), f"dev-local/components/opencode/{name} missing"
    return [d for d in yaml.safe_load_all(comp.read_text()) if d]


def _deployment(repo_root: Path) -> dict:
    docs = _comp_docs(repo_root, "opencode.yaml")
    deps = [d for d in docs if d.get("kind") == "Deployment"]
    assert len(deps) == 1
    return deps[0]


def _container(repo_root: Path) -> dict:
    containers = _deployment(repo_root)["spec"]["template"]["spec"]["containers"]
    main = [c for c in containers if c.get("name") == "opencode"]
    assert len(main) == 1, f"opencode-Container nicht genau einmal: {[c.get('name') for c in containers]}"
    return main[0]


def test_official_image_pinned(repo_root: Path):
    image = _container(repo_root)["image"]
    assert image.startswith("ghcr.io/anomalyco/opencode:"), f"kein offizielles Image: {image}"
    ref = image.split("ghcr.io/anomalyco/opencode:", 1)[1]
    tag, _, digest = ref.partition("@")
    assert tag and "." in tag and tag != "latest", f"versionierter Tag erwartet: {image}"
    assert digest.startswith("sha256:") and len(digest) > 20, f"Digest-Pin erwartet: {image}"


def test_server_password_from_workspace_secrets(repo_root: Path):
    container = _container(repo_root)
    matches = [
        e for e in container.get("env", [])
        if isinstance(e, dict) and e.get("name") == "OPENCODE_SERVER_PASSWORD"
    ]
    assert len(matches) == 1, f"OPENCODE_SERVER_PASSWORD nicht genau einmal: {matches}"
    entry = matches[0]
    assert "valueFrom" in entry, f"kein valueFrom: {entry}"
    ref = (entry.get("valueFrom") or {}).get("secretKeyRef", {})
    assert ref.get("name") == "workspace-secrets", f"falsches Secret: {ref}"
    assert ref.get("key") == "OPENCODE_SERVER_PASSWORD", f"falscher Key: {ref}"


def test_tailnet_service(repo_root: Path):
    docs = _comp_docs(repo_root, "opencode-tailnet.yaml")
    svcs = [d for d in docs if d.get("kind") == "Service"]
    assert len(svcs) == 1
    svc = svcs[0]
    annotations = svc["metadata"].get("annotations", {})
    assert annotations.get("tailscale.com/expose") == "true"
    assert annotations.get("tailscale.com/hostname") == "opencode"
    assert svc["spec"]["selector"] == {"app": "opencode"}
    ports = svc["spec"]["ports"]
    assert any(p.get("targetPort") == 4096 for p in ports), f"Port 4096 fehlt: {ports}"


def _policy_for(docs: list, app: str) -> dict:
    pols = [
        d for d in docs
        if d.get("kind") == "NetworkPolicy"
        and d.get("spec", {}).get("podSelector", {}).get("matchLabels", {}).get("app") == app
    ]
    assert len(pols) == 1, f"NetworkPolicy fuer app={app} fehlt"
    return pols[0]


def test_networkpolicies(repo_root: Path):
    docs = _comp_docs(repo_root, "networkpolicy.yaml")
    op = _policy_for(docs, "opencode")
    ingress_ports = {p.get("port") for r in op["spec"].get("ingress", []) for p in r.get("ports", [])}
    assert 4096 in ingress_ports, f"Ingress 4096 fehlt: {ingress_ports}"
    egress_ports = {p.get("port") for r in op["spec"].get("egress", []) for p in r.get("ports", [])}
    for needed in (53, 443, 8001, 8080):
        assert needed in egress_ports, f"Egress {needed} fehlt: {egress_ports}"

    proxy = _policy_for(docs, "oauth2-proxy-opencode")
    pingress = {p.get("port") for r in proxy["spec"].get("ingress", []) for p in r.get("ports", [])}
    assert 4180 in pingress, f"Ingress 4180 fehlt: {pingress}"


def test_vllm_provider_config(repo_root: Path):
    docs = _comp_docs(repo_root, "opencode-config.yaml")
    cms = [d for d in docs if d.get("kind") == "ConfigMap"]
    assert len(cms) == 1
    raw = cms[0]["data"]["opencode.json"]
    cfg = json.loads(raw)
    providers = cfg.get("provider", {})
    # Live Backends (Stand 2026-10-31, verifiziert im Cluster):
    # - devmesh-vllm-4b: vllm-w4a4.serving:8001 (Qwen3.5-4B QUASAR W4A4)
    # - devmesh-llamacpp-2b: llm-gateway-2b:8080 (qwen35-2b-worker)
    # vllm-serve:8000 ist skaliert auf 0 (keine Endpoints) und darf nicht
    # referenziert sein.
    assert not any(
        p.get("options", {}).get("baseURL", "").startswith("http://vllm-serve:")
        for p in providers.values()
    ), "toter vllm-serve-Backend referenziert"
    expected = {
        "devmesh-vllm-4b": "http://vllm-w4a4.serving.svc.cluster.local:8001/v1",
        "devmesh-llamacpp-2b": "http://llm-gateway-2b:8080/v1",
    }
    for pid, base_url in expected.items():
        assert pid in providers, f"Provider {pid} fehlt: {sorted(providers)}"
        p = providers[pid]
        assert p.get("options", {}).get("baseURL") == base_url, (
            f"baseURL von {pid} unerwartet: {p.get('options', {}).get('baseURL')}"
        )
        assert p.get("npm") == "@ai-sdk/openai-compatible", f"Provider-npm unerwartet: {p.get('npm')}"
        assert p.get("models"), f"Provider {pid} hat keine Modelle"
    assert cfg.get("model", "").startswith("devmesh-vllm-4b/"), (
        f"model zeigt nicht auf devmesh-vllm-4b: {cfg.get('model')}"
    )
    assert cfg.get("small_model", "").startswith("devmesh-llamacpp-2b/"), (
        f"small_model zeigt nicht auf devmesh-llamacpp-2b: {cfg.get('small_model')}"
    )

    mounts = _container(repo_root).get("volumeMounts", [])
    assert any(
        m.get("mountPath") == "/tmp/.config/opencode/opencode.json" and m.get("subPath") == "opencode.json"
        for m in mounts
    ), f"Config-Mount fehlt: {mounts}"


def test_repo_sync_sidecar(repo_root: Path):
    containers = _deployment(repo_root)["spec"]["template"]["spec"]["containers"]
    sync = [c for c in containers if c.get("name") == "repo-sync"]
    assert len(sync) == 1, f"repo-sync-Sidecar fehlt: {[c.get('name') for c in containers]}"
    sync = sync[0]
    image = sync["image"]
    assert image.startswith("alpine/git@sha256:"), f"unerwartetes Sync-Image: {image}"
    digest = image.split("alpine/git@", 1)[1]
    assert digest.startswith("sha256:") and len(digest) > 20, f"Digest-Pin erwartet: {image}"
    env = {e["name"]: e for e in sync.get("env", []) if isinstance(e, dict)}
    assert "REPOS" in env, f"REPOS-Env fehlt: {sorted(env)}"
    for repo in ("Paddione/dotfiles", "Paddione/Bachelorprojekt", "Paddione/news-agent",
                 "Paddione/agentic-resources", "Paddione/unsloth-boxes"):
        assert repo in env["REPOS"].get("value", ""), f"{repo} fehlt in REPOS"
    tok = env.get("GITHUB_TOKEN", {})
    ref = (tok.get("valueFrom") or {}).get("secretKeyRef", {})
    assert ref.get("name") == "workspace-secrets" and ref.get("key") == "GHCR_PAT", (
        f"Token-Ref unerwartet: {ref}")
    mounts = {m.get("mountPath") for m in sync.get("volumeMounts", [])}
    assert "/workspace" in mounts, f"/workspace-Mount fehlt im Sidecar: {mounts}"
    assert sync.get("resources", {}).get("limits"), "Sidecar braucht Resource-Limits"
    cmd = " ".join(str(c) for c in sync.get("command", []))
    # Token-Hygiene: Auth nur via x-access-token-URL, Remote wird danach
    # immer auf die tokenfreie URL zurueckgesetzt.
    assert "x-access-token" in cmd, "kein Token-Clone in Sidecar-Command"
    assert cmd.count('remote set-url origin') >= 2, "Remote-URL wird nicht tokenfrei zurueckgesetzt"


def test_component_kustomization_lists_new_resources(repo_root: Path):
    kust = repo_root / "dev-local" / "components" / "opencode" / "kustomization.yaml"
    text = kust.read_text()
    for name in ("opencode-config.yaml", "opencode-tailnet.yaml", "networkpolicy.yaml"):
        assert name in text, f"{name} nicht in kustomization.yaml"
