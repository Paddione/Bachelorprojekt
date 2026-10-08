"""Native migration of tests/spec/local-dev-mesh/dev-local-render.bats."""

import re

import pytest


@pytest.fixture
def ctx(repo_root, tmp_path, monkeypatch):
    inv = tmp_path / "inventory.yaml"
    inv.write_text("gpu_endpoint:\n  peer: pk-desktop\n  address: 100.101.102.103\n  port: 18235\n")
    monkeypatch.setenv("DEVMESH_INVENTORY", str(inv))
    return {
        "repo": repo_root,
        "render": repo_root / "scripts" / "devmesh" / "render-stack.sh",
        "fix": tmp_path,
        "inv": inv,
    }


def _render(run_cmd, ctx, profile):
    res = run_cmd(["bash", str(ctx["render"]), profile])
    out = ctx["fix"] / f"{profile}.yaml"
    out.write_text(res.stdout)
    (ctx["fix"] / f"{profile}.err").write_text(res.stderr)
    if res.returncode != 0:
        pytest.fail(f"render {profile} failed:\n{res.stderr}")
    return out


def _yq(run_cmd, args):
    res = run_cmd(["yq", *args])
    res.check()
    return res.stdout.rstrip("\n")


def _deploys(run_cmd, manifest):
    res = run_cmd(["yq", "ea", "-r", '[select(.kind == "Deployment") | .metadata.name] | .[]', str(manifest)])
    res.check()
    return res.stdout.splitlines()


def test_env_resolve_dev_liefert_env_context_devmesh(ctx, run_cmd):
    repo = ctx["repo"]
    res = run_cmd(
        ["bash", "-c", 'source "$1/scripts/env-resolve.sh" dev "$1/environments" && echo "ENV_CONTEXT=$ENV_CONTEXT"',
         "_", str(repo)]
    )
    assert res.returncode == 0, res.output
    assert "ENV_CONTEXT=devmesh" in res.output.splitlines()


def test_profil_core_enthaelt_die_console_und_keine_schweren_dienste(ctx, run_cmd):
    manifest = _render(run_cmd, ctx, "core")
    names = _deploys(run_cmd, manifest)
    assert "sdlc-console" in names
    assert "shared-db" in names
    heavy = [n for n in names if n in {"nextcloud", "collabora", "spreed-signaling", "vaultwarden"}]
    assert heavy == []


def test_profil_full_enthaelt_nextcloud_collabora_talk_und_vaultwarden(ctx, run_cmd):
    manifest = _render(run_cmd, ctx, "full")
    names = _deploys(run_cmd, manifest)
    assert "sdlc-console" in names
    for d in ("nextcloud", "collabora", "spreed-signaling", "vaultwarden"):
        assert d in names, d


def test_core_endpointslice_traegt_inventar_adresse_und_port_als_zahl_hosts_sind_aufgeloest(ctx, run_cmd):
    manifest = _render(run_cmd, ctx, "core")
    addr = _yq(run_cmd, ["ea", "-r",
                         'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .endpoints[0].addresses[0]',
                         str(manifest)])
    assert addr == "100.101.102.103"
    tag = _yq(run_cmd, ["ea", "-r",
                        'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .ports[0].port | tag',
                        str(manifest)])
    assert tag == "!!int"
    hosts = _yq(run_cmd, ["ea", "-r",
                          'select(.kind == "Ingress" and .metadata.name == "devmesh-core") | .spec.rules[].host',
                          str(manifest)]).splitlines()
    assert "web.devmesh.mentolder.de" in hosts
    text = manifest.read_text()
    left = re.search(r"(^|[^$])\$\{(DEVMESH_DOMAIN|GPU_ENDPOINT_ADDRESS|GPU_ENDPOINT_PORT|POCKET_ID_DOMAIN)\}",
                     text, re.M)
    assert left is None, left.group(0) if left else ""


def test_gpu_endpoint_ausserhalb_100_64_0_0_10_bricht_mit_exit_2_ab(ctx, run_cmd):
    _render(run_cmd, ctx, "core")
    res = run_cmd(["yq", "-i", '.gpu_endpoint.address = "10.10.0.3"', str(ctx["inv"])])
    res.check()
    res = run_cmd(["bash", str(ctx["render"]), "core"])
    assert res.returncode == 2
    assert "gpu_endpoint" in res.output
