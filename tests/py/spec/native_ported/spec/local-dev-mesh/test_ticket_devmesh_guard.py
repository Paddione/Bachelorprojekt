"""Native migration of tests/spec/local-dev-mesh/ticket-devmesh-guard.bats."""

import os
import re
import shutil

import pytest

KUBECONFIG_YAML = """apiVersion: v1
kind: Config
contexts:
  - {name: devmesh, context: {cluster: devmesh, user: u}}
  - {name: scratch, context: {cluster: devmesh-copy, user: u}}
  - {name: lan-srv, context: {cluster: lan-srv, user: u}}
  - {name: other, context: {cluster: other, user: u}}
clusters:
  - {name: devmesh, cluster: {server: "https://gpu-metal.example.ts.net:6443"}}
  - {name: devmesh-copy, cluster: {server: "https://gpu-metal.example.ts.net:6443"}}
  - {name: lan-srv, cluster: {server: "https://10.1.0.101:6443"}}
  - {name: other, cluster: {server: "https://10.99.0.1:6443"}}
users:
  - {name: u, user: {}}
"""

INVENTORY_YAML = """peers:
  - {name: gpu-metal, role: server, lan_ip: 10.1.0.101, tailnet_name: gpu-metal}
  - {name: pk-desktop, role: client, lan_ip: 10.10.0.3, tailnet_name: pk-desktop}
"""

CORE_SH = """CTX="$1"; NS=workspace
source "$REPO_ROOT/scripts/vda/ticket/_ticket-core.sh"
_exec_sql pod/shared-db-0 <<<"$2"
"""


def _kubectl_stub(log, real):
    return f"""#!/usr/bin/env bash
echo "$*" >> "{log}"
if [[ "${{1:-}}" == "config" ]]; then exec "{real}" "$@"; fi
case " $* " in
  *" get pod "*) echo "pod/shared-db-0" ;;
esac
exit 0
"""


@pytest.fixture
def guard(repo_root, tmp_path, monkeypatch):
    real_kubectl = shutil.which("kubectl")
    log = tmp_path / "kubectl.log"
    log.write_text("")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    stub = bin_dir / "kubectl"
    stub.write_text(_kubectl_stub(log, real_kubectl))
    stub.chmod(0o755)
    kubeconfig = tmp_path / "kubeconfig.yaml"
    kubeconfig.write_text(KUBECONFIG_YAML)
    inventory = tmp_path / "inventory.yaml"
    inventory.write_text(INVENTORY_YAML)
    monkeypatch.setenv("STUB_LOG", str(log))
    monkeypatch.setenv("PATH", f"{bin_dir}:{os.environ.get('PATH', '')}")
    monkeypatch.setenv("KUBECONFIG", str(kubeconfig))
    monkeypatch.setenv("DEVMESH_INVENTORY", str(inventory))
    return {
        "repo": repo_root,
        "ticket": repo_root / "scripts" / "ticket.sh",
        "log": log,
        "fix": tmp_path,
    }


def _guard_names_fleet(output):
    return any("T900118" in l and "fleet" in l for l in output.splitlines())


def _no_exec_calls(log):
    return re.search(r"(^| )exec ", log.read_text(), re.M) is None


def _ticket(run_cmd, g, ctx, *args):
    return run_cmd(["bash", str(g["ticket"]), *args], cwd=g["repo"], env={"TICKET_CTX": ctx})


CREATE = ("create", "--type", "chore", "--title", "x", "--description", "y")


def test_positiv_anker_create_gegen_nicht_devmesh_context_passiert_den_guard(guard, run_cmd):
    res = _ticket(run_cmd, guard, "other", *CREATE)
    assert not any("T900118" in l for l in res.output.splitlines())
    assert "config view" in guard["log"].read_text()


def test_create_mit_ticket_ctx_devmesh_wird_verweigert_nennt_fleet_schreibt_nicht(guard, run_cmd):
    res = _ticket(run_cmd, guard, "devmesh", *CREATE)
    assert res.returncode != 0
    assert _guard_names_fleet(res.output)
    assert _no_exec_calls(guard["log"])


def test_umbenannter_context_mit_devmesh_api_server_wird_verweigert(guard, run_cmd):
    res = _ticket(run_cmd, guard, "scratch", *CREATE)
    assert res.returncode != 0
    assert _guard_names_fleet(res.output)
    assert _no_exec_calls(guard["log"])


def test_context_auf_die_lan_adresse_eines_inventar_servers_wird_verweigert(guard, run_cmd):
    res = _ticket(run_cmd, guard, "lan-srv", "update-status", "--id", "T900115", "--status", "done")
    assert res.returncode != 0
    assert _guard_names_fleet(res.output)


def test_get_mit_ticket_ctx_devmesh_scheitert_nicht_am_guard_und_erreicht_die_db_schicht(guard, run_cmd):
    res = _ticket(run_cmd, guard, "devmesh", "get", "--id", "T900115")
    assert not any("T900118" in l for l in res.output.splitlines())
    assert re.search(r"(^| )exec ", guard["log"].read_text(), re.M)


def test_exec_sql_select_laeuft_update_gegen_devmesh_endet_mit_exit_3_ohne_exec(guard, run_cmd):
    core = guard["fix"] / "core.sh"
    core.write_text(CORE_SH)
    env = {"REPO_ROOT": str(guard["repo"])}
    res = run_cmd(["bash", str(core), "devmesh", "SELECT 1"], env=env)
    assert res.returncode == 0, res.output
    assert re.search(r"(^| )exec ", guard["log"].read_text(), re.M)
    guard["log"].write_text("")
    res = run_cmd(["bash", str(core), "devmesh", "UPDATE tickets.tickets SET title = 'x'"], env=env)
    assert res.returncode == 3, res.output
    assert _guard_names_fleet(res.output)
    assert _no_exec_calls(guard["log"])


def test_ticket_mcp_node_runticket_create_gegen_devmesh_wird_mit_fleet_hinweis_abgewiesen(guard, run_cmd):
    node = shutil.which("node")
    assert node is not None, "node not installed"
    repo = guard["repo"]
    script = (
        "import { runTicket } from '" + str(repo / "scripts" / "ticket-mcp-node" / "runner.mjs") + "';\n"
        "try {\n"
        "  await runTicket(['create', '--type', 'chore', '--title', 'x', '--description', 'y']);\n"
        "  console.log('RESOLVED');\n"
        "  process.exit(0);\n"
        "} catch (e) {\n"
        "  console.error(e.message);\n"
        "  process.exit(4);\n"
        "}\n"
    )
    res = run_cmd([node, "--input-type=module", "-e", script], cwd=repo,
                  env={"TICKET_MCP_REPO_ROOT": str(repo), "REPO_ROOT": str(repo), "TICKET_CTX": "devmesh"})
    assert res.returncode == 4, res.output
    assert _guard_names_fleet(res.output)
