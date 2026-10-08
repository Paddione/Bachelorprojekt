"""Native migration of tests/spec/llm-pipeline/bge-usecase-reachability.bats."""

import re
import subprocess

import pytest


def _proc(args):
    """Prozessaufruf mit stdin=/dev/null; Fehlerausgabe wird wie im Original verworfen."""
    return subprocess.run(args, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300)


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """setup_file: kubectl kustomize k3d > RENDERED (Fehler -> leere Datei)."""
    out = tmp_path_factory.mktemp("bge-usecase") / "k3d-rendered.yaml"
    r = _proc(["kubectl", "kustomize", str(repo_root / "k3d")])
    out.write_text(r.stdout if r.returncode == 0 else "", encoding="utf-8")
    return out


def _yq(expr, path):
    """yq eval-all -> (returncode, stdout); stderr zaehlt zu $output wie bei BATS run."""
    r = _proc(["yq", "eval-all", expr, str(path)])
    return r.returncode, (r.stdout + r.stderr).rstrip("\n")


def test_bge_gerendertes_k3d_manifest_traegt_ingress_ausnahmen_fuer_embed_und_rerank(rendered):
    assert rendered.stat().st_size > 0
    rc, out = _yq('select(.kind == "NetworkPolicy") | .metadata.name', rendered)
    # Positiv-Anker: das Muster existiert fuer vaultwarden.
    assert rc == 0
    lines = out.splitlines()
    assert "allow-website-to-vaultwarden-ingress" in lines
    assert "allow-website-to-bge-embed-ingress" in lines
    assert "allow-website-to-bge-rerank-ingress" in lines


def test_bge_die_ingress_ausnahmen_adressieren_den_pod_port_8080_nicht_den_service_port_8081(rendered):
    assert rendered.stat().st_size > 0
    for role in ("embed", "rerank"):
        rc, out = _yq(
            f'select(.kind == "NetworkPolicy" and .metadata.name == "allow-website-to-bge-{role}-ingress")'
            " | .spec.podSelector.matchLabels.app",
            rendered,
        )
        assert rc == 0
        assert out == f"bge-{role}"

        rc, out = _yq(
            f'select(.kind == "NetworkPolicy" and .metadata.name == "allow-website-to-bge-{role}-ingress")'
            " | .spec.ingress[0].ports[0].port",
            rendered,
        )
        assert rc == 0
        assert out == "8080"


def test_bge_deployments_mit_readwriteonce_pvc_nutzen_strategy_recreate_statt_rollingupdate(rendered):
    assert rendered.stat().st_size > 0
    for role in ("embed", "rerank"):
        rc, out = _yq(f'select(.kind == "Deployment" and .metadata.name == "bge-{role}") | .metadata.name', rendered)
        assert rc == 0
        assert out == f"bge-{role}"

        rc, out = _yq(
            f'select(.kind == "PersistentVolumeClaim" and .metadata.name == "bge-{role}-models")'
            " | .spec.accessModes[0]",
            rendered,
        )
        assert rc == 0
        assert out == "ReadWriteOnce"

        rc, out = _yq(f'select(.kind == "Deployment" and .metadata.name == "bge-{role}") | .spec.strategy.type', rendered)
        assert rc == 0
        assert out == "Recreate"


def test_bge_mcp_laeuft_als_supervisor_kind_im_llm_services_deployment_kein_hintergrundjob(repo_root):
    r = _proc(["kubectl", "kustomize", "--load-restrictor=LoadRestrictionsNone", str(repo_root / "dev-local/core")])
    if r.returncode != 0:
        pytest.skip("kubectl kustomize Vorbedingung fehlt")
    deploy_out = r.stdout
    assert "MCP_NODE_SERVICES" in deploy_out
    assert "bge-mcp" in deploy_out
    amp = sum(1 for line in deploy_out.splitlines() if re.search(r"port-forward.*&", line))
    assert amp == 0


def test_bge_mcp_ein_fehlgeschlagener_upstream_aufruf_nennt_rolle_und_ziel_url(repo_root):
    server = repo_root / "scripts/bge-mcp/server.mjs"
    assert server.is_file()
    src = server.read_text(encoding="utf-8")
    # Positiv-Anker: der Shim behandelt Upstream-Fehler ueberhaupt.
    assert "isError" in src
    ok = bool(re.search(r"upstream", src, re.I)) and bool(
        re.search(r"\$\{\s*url\s*\}|\$\{\s*endpoint\s*\}|\$\{\s*target\s*\}", src)
    )
    assert ok, "missing"
