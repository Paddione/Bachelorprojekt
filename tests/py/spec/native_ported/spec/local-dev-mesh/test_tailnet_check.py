"""Native migration of tests/spec/local-dev-mesh/tailnet-check.bats."""

import re
import shutil
import subprocess

import pytest

INVENTORY = """peers:
  - name: srv-a
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.1.0.201
    tailnet_name: srv-a
  - name: srv-b
    role: server
    tag: "tag:devmesh"
    lan_ip: 10.10.10.201
    tailnet_name: srv-b
  - name: cli-a
    role: client
    tag: "tag:devclient"
    lan_ip: null
    tailnet_name: cli-a
"""

TAILSCALE_STUB = r"""#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
eol=$'\n'; [[ "${STUB_CRLF:-0}" == 1 ]] && eol=$'\r\n'
case "$1" in
  status)
    printf '{"BackendState": "%s"}%s' "${STUB_STATE:-Running}" "$eol"
    exit 0 ;;
  ping)
    target="${*: -1}"
    if [[ " ${STUB_DOWN:-} " == *" $target "* ]]; then
      printf 'timeout waiting for ping reply%s' "$eol"; exit 1
    fi
    if [[ " ${STUB_RELAY:-} " == *" $target "* ]]; then
      printf 'pong from %s (100.64.0.9) via DERP(fra) in 41ms%s' "$target" "$eol"
      printf 'direct connection not established%s' "$eol"; exit 1
    fi
    printf 'pong from %s (100.64.0.9) via 10.1.0.201:41641 in 2ms%s' "$target" "$eol"
    exit 0 ;;
esac
exit 64
"""


@pytest.fixture
def tc(repo_root, tmp_path, monkeypatch):
    if shutil.which("python3") is None:
        pytest.skip("python3 not installed")
    if subprocess.run(
        ["python3", "-c", "import yaml"], capture_output=True).returncode != 0:
        pytest.skip("PyYAML not installed")
    inv = tmp_path / "inventory.yaml"
    inv.write_text(INVENTORY)
    cli = tmp_path / "tailscale"
    cli.write_text(TAILSCALE_STUB)
    cli.chmod(0o755)
    log = tmp_path / "calls.log"
    log.write_text("")
    for var in ("STUB_STATE", "STUB_RELAY", "STUB_DOWN", "STUB_CRLF"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("STUB_LOG", str(log))
    monkeypatch.setenv("DEVMESH_INVENTORY", str(inv))
    monkeypatch.setenv("TAILSCALE_CLI", str(cli))
    return {"script": repo_root / "scripts" / "devmesh" / "tailnet-check.sh", "tmp": tmp_path,
            "repo": repo_root, "log": log}


def _run(run_cmd, tc, *args, **env):
    return run_cmd(["bash", str(tc["script"]), *args], env=env)


def _has_line_with(output, *needles):
    return any(all(n in l for n in needles) for l in output.splitlines())


def test_t900116_alle_server_direkt_erreichbar_exit_0_clients_werden_nicht_gepingt(tc, run_cmd):
    res = _run(run_cmd, tc)
    assert res.returncode == 0, f"exit={res.returncode} output={res.output}"
    # Positiv-Anker: beide Server wurden tatsaechlich gepingt.
    log = tc["log"].read_text()
    assert re.search(r"^ping .*srv-a$", log, re.M), f"srv-a nie gepingt\n{log}"
    assert re.search(r"^ping .*srv-b$", log, re.M), f"srv-b nie gepingt\n{log}"
    assert _has_line_with(res.output, "srv-a", "direct"), f"srv-a nicht direct: {res.output}"
    assert not re.search(r"^ping .*cli-a$", log, re.M), f"Client wurde gepingt\n{log}"


def test_t900116_server_nur_ueber_derp_erreichbar_relay_und_exit_0_trotz_ping_exit_1(tc, run_cmd):
    res = _run(run_cmd, tc, STUB_RELAY="srv-b")
    assert res.returncode == 0, f"exit={res.returncode} output={res.output}"
    assert _has_line_with(res.output, "srv-b", "relay"), f"srv-b nicht relay: {res.output}"
    assert _has_line_with(res.output, "srv-a", "direct"), f"srv-a nicht direct: {res.output}"


def test_t900116_ein_server_antwortet_nicht_exit_1_und_nennt_ihn(tc, run_cmd):
    res = _run(run_cmd, tc, STUB_DOWN="srv-b")
    assert res.returncode == 1, f"exit={res.returncode}, erwartet 1. output={res.output}"
    assert _has_line_with(res.output, "srv-b", "unerreichbar"), f"srv-b nicht genannt: {res.output}"
    # Positiv-Anker: der andere Server wurde weiterhin geprueft (Schleife bricht nicht ab).
    assert _has_line_with(res.output, "srv-a", "direct"), f"srv-a fehlt: {res.output}"


def test_t900116_dienst_im_zustand_nostate_exit_2_kein_peer_als_unerreichbar_gemeldet(tc, run_cmd):
    res = _run(run_cmd, tc, STUB_STATE="NoState")
    assert res.returncode == 2, f"exit={res.returncode}, erwartet 2. output={res.output}"
    # Positiv-Anker: der Zustand wurde tatsaechlich abgefragt und wird genannt.
    log = tc["log"].read_text()
    assert re.search(r"^status", log, re.M), "status nie abgefragt"
    assert "NoState" in res.output, f"Zustand nicht genannt: {res.output}"
    assert not re.search(r"^ping", log, re.M), f"trotz NoState gepingt\n{log}"
    assert "srv-" not in res.output, f"Peer statt Dienstzustand gemeldet: {res.output}"


def test_t900116_tailscale_cli_fehlt_exit_2(tc, run_cmd):
    res = _run(run_cmd, tc, TAILSCALE_CLI=str(tc["tmp"] / "gibt-es-nicht"))
    assert res.returncode == 2, f"exit={res.returncode}, erwartet 2. output={res.output}"
    assert "Tailscale-CLI" in res.output, f"fehlende CLI nicht genannt: {res.output}"


def test_t900116_crlf_ausgabe_der_windows_cli_wird_korrekt_gelesen(tc, run_cmd):
    res = _run(run_cmd, tc, STUB_CRLF="1", STUB_RELAY="srv-b")
    assert res.returncode == 0, f"exit={res.returncode} output={res.output}"
    assert _has_line_with(res.output, "srv-a", "direct"), f"srv-a nicht direct: {res.output}"
    assert _has_line_with(res.output, "srv-b", "relay"), f"srv-b nicht relay: {res.output}"


def test_t900116_server_mit_client_tag_inventar_ungueltig_exit_2_ohne_ping(tc, run_cmd):
    bad = tc["tmp"] / "bad.yaml"
    bad.write_text(
        "peers:\n"
        "  - name: srv-x\n"
        "    role: server\n"
        '    tag: "tag:devclient"\n'
        "    lan_ip: 10.1.0.202\n"
        "    tailnet_name: srv-x\n"
    )
    res = _run(run_cmd, tc, "--inventory", str(bad))
    assert res.returncode == 2, f"exit={res.returncode}, erwartet 2. output={res.output}"
    assert _has_line_with(res.output, "srv-x", "tag:devmesh"), f"Tag-Fehler nicht benannt: {res.output}"
    assert not re.search(r"^ping", tc["log"].read_text(), re.M)


def test_t900116_echtes_inventar_server_tragen_tag_devmesh_clients_tag_devclient(tc, run_cmd):
    res = _run(run_cmd, tc, "--inventory", str(tc["repo"] / "devmesh" / "inventory.yaml"), "--list")
    assert res.returncode == 0, f"exit={res.returncode} output={res.output}"
    rows = [l.split("\t") for l in res.output.splitlines()]
    servers = sum(1 for r in rows if len(r) > 1 and r[1] == "server")
    clients = sum(1 for r in rows if len(r) > 1 and r[1] == "client")
    # Positiv-Anker: das Inventar liefert ueberhaupt Server und Clients.
    assert servers >= 1 and clients >= 1, f"servers={servers} clients={clients}: {res.output}"
    wrong = [
        "\t".join(r) for r in rows
        if len(r) > 2 and ((r[1] == "server" and r[2] != "tag:devmesh") or (r[1] == "client" and r[2] != "tag:devclient"))
    ]
    assert wrong == [], f"falscher Tag: {wrong}"
    # --list braucht keine Tailscale-CLI.
    assert tc["log"].read_text() == "", "--list rief die CLI auf"
