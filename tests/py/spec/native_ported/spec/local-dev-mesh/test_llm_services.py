"""Native migration of tests/spec/local-dev-mesh/llm-services.bats."""

import re
import subprocess

import pytest

SUPERVISOR_STUB = """#!/bin/sh
echo "invoked:{name}:$*" >> "{log}"
sleep 30
"""


@pytest.fixture
def ctx(repo_root, tmp_path):
    return {
        "repo": repo_root,
        "render": repo_root / "scripts" / "devmesh" / "render-stack.sh",
        "supervisor": repo_root / "docker" / "mcp-node" / "supervisor.sh",
        "migration": repo_root / "scripts" / "migrations" / "2026-09-16-devmesh-llm-proxy-backends.sql",
        "inventory": repo_root / "devmesh" / "inventory.yaml",
        "fix": tmp_path,
    }


@pytest.fixture
def core_manifest(ctx, run_cmd):
    res = run_cmd(["bash", str(ctx["render"]), "core"], cwd=ctx["repo"])
    if res.returncode != 0:
        pytest.fail(f"render core failed:\n{res.stderr}")
    path = ctx["fix"] / "core.yaml"
    path.write_text(res.stdout)
    return path


def _yq(run_cmd, args):
    res = run_cmd(["yq", *args])
    res.check()
    return res.stdout.rstrip("\n")


def test_requirement_devmesh_hosts_the_cpu_bound_llm_and_database_services_deployment_und_service_im_core_profil(
    ctx, run_cmd, core_manifest
):
    m = str(core_manifest)
    assert _yq(run_cmd, ["ea", "-r", 'select(.kind == "Deployment" and .metadata.name == "llm-services") | .metadata.name', m]) == "llm-services"
    services = _yq(run_cmd, ["ea", "-r",
                             'select(.kind == "Deployment" and .metadata.name == "llm-services") | .spec.template.spec.containers[] | select(.name == "mcp-node") | .env[] | select(.name == "MCP_NODE_SERVICES") | .value',
                             m])
    assert services == "llm-proxy,postgres,bge-mcp"
    ports = _yq(run_cmd, ["ea", "-r", 'select(.kind == "Service" and .metadata.name == "llm-services") | .spec.ports[].port', m])
    port_list = sorted(int(p) for p in ports.splitlines() if p)
    # Positiv-Anker: die Service-Ressource existiert ueberhaupt und traegt Ports
    assert port_list
    assert [str(p) for p in port_list] == ["13001", "13005", "18235"]


def test_requirement_the_gpu_endpoint_exposes_one_port_per_workstation_gpu_service_ein_benannter_port_je_inventar_eintrag_zusaetzlich_zu_http(
    ctx, run_cmd, core_manifest
):
    m = str(core_manifest)
    inv = str(ctx["inventory"])
    # Positiv-Anker: das Inventar listet mindestens einen GPU-Dienst
    inv_count = int(_yq(run_cmd, ["-r", ".gpu_endpoint.ports // [] | length", inv]))
    assert inv_count > 0
    rows = _yq(run_cmd, ["-r", ".gpu_endpoint.ports[] | [.name, .port] | @tsv", inv]).splitlines()
    for row in rows:
        if not row.strip():
            continue
        pname, pport = row.split("\t")
        svc_port = _yq(run_cmd, ["ea", "-r",
                                 f'select(.kind == "Service" and .metadata.name == "llm-gateway-host") | .spec.ports[] | select(.name == "{pname}") | .port',
                                 m])
        assert svc_port == pport, f"Service-Port fuer {pname}: erwartet {pport}, war '{svc_port}'"
        eps_port = _yq(run_cmd, ["ea", "-r",
                                 f'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .ports[] | select(.name == "{pname}") | .port',
                                 m])
        assert eps_port == pport, f"EndpointSlice-Port fuer {pname}: erwartet {pport}, war '{eps_port}'"
    # http bleibt zusaetzlich bestehen
    http_port = _yq(run_cmd, ["ea", "-r",
                              'select(.kind == "Service" and .metadata.name == "llm-gateway-host") | .spec.ports[] | select(.name == "http") | .port',
                              m])
    assert http_port == "80"
    addr = _yq(run_cmd, ["ea", "-r",
                         'select(.kind == "EndpointSlice" and .metadata.name == "llm-gateway-host") | .endpoints[0].addresses[0]',
                         m])
    inv_addr = _yq(run_cmd, ["-r", ".gpu_endpoint.address", inv])
    assert addr == inv_addr


def test_requirement_only_the_three_services_start_in_the_component_supervisor_startet_genau_llm_proxy_postgres_bge_mcp(ctx):
    supervisor = ctx["supervisor"]
    assert supervisor.is_file()
    bin_dir = ctx["fix"] / "bin"
    bin_dir.mkdir()
    log = ctx["fix"] / "supervisor.log"
    for name in ("node", "supergateway"):
        stub = bin_dir / name
        stub.write_text(SUPERVISOR_STUB.format(name=name, log=log))
        stub.chmod(0o755)

    # Token-Attrappen: postgres/bge-mcp pruefen nur Nicht-Leere (P2).
    env = {
        "PATH": f"{bin_dir}:/usr/bin:/bin",
        "MCP_NODE_SERVICES": "llm-proxy,postgres,bge-mcp",
        "MCP_SUPERVISOR_RESTART_DELAY": "100",
        "MCP_POSTGRES_TOKEN": "guard",
        "BGE_MCP_TOKEN": "guard",
        "DATABASE_URL": "postgresql://x/y",
        "DEV_POD_REPO": str(ctx["repo"]),
    }
    # Supervisor-Ausgabe landet im Log; timeout beendet den Supervisor per SIGTERM.
    with open(log, "a") as out:
        subprocess.run(["timeout", "2", "sh", str(supervisor)], env=env, stdout=out,
                       stderr=subprocess.STDOUT, timeout=30, check=False)
    assert log.exists() and log.stat().st_size > 0
    text = log.read_text()
    assert "start llm-proxy" in text
    assert "start postgres" in text
    assert "start bge-mcp" in text
    # Positiv-Anker oben belegt: fehlende Zeilen sind tatsaechliche Abwesenheit
    refused = re.findall(r"start (github|ticket-mcp|task-runner|codebase-memory)", text)
    assert refused == []


def test_requirement_devmesh_backend_registry_contains_no_loopback_urls_migration_seedet_keine_127_0_0_1_localhost_base_url(ctx):
    migration = ctx["migration"]
    assert migration.is_file()
    hits = sum(1 for line in migration.read_text().splitlines() if re.search(r"127\.0\.0\.1|localhost", line, re.I))
    assert hits == 0


def test_requirement_devmesh_backend_registry_contains_no_loopback_urls_mindestens_eine_llm_gateway_host_zeile_positiv_anker(ctx):
    migration = ctx["migration"]
    assert migration.is_file()
    hits = sum(1 for line in migration.read_text().splitlines() if "llm-gateway-host" in line)
    assert hits >= 1
