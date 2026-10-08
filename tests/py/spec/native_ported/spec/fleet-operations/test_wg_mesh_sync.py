"""Native migration of tests/spec/fleet-operations/wg-mesh-sync.bats."""
import importlib.util
import shutil
import stat
from pathlib import Path

import pytest

pytestmark = pytest.mark.repo_lock("wg-mesh-sync")

TERMINAL_SIDEKICK_NOTE = "terminal-sidekick"
PK4_KEY = "tK3WzIcumUjACWqbXNgCqoSP9JhICAUHA+D8kSzMJ2o="
PEER_CATEGORIES = ("nodes", "gpu_hosts", "home_workers", "workers", "devc_servers", "laptops")

REGISTRY_TWO = """fleet:
  wg_subnet: "10.20.0.0/24"
  listen_port: 51820
  interface: "wg-fleet"
  nodes:
    - name: node-a
      endpoint: "10.0.0.1:51820"
      wg_ip: "10.20.0.1"
      public_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    - name: node-b
      endpoint: "10.0.0.2:51820"
      wg_ip: "10.20.0.2"
      public_key: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB="
"""

REGISTRY_THREE = REGISTRY_TWO + """    - name: node-c
      endpoint: "10.0.0.3:51820"
      wg_ip: "10.20.0.3"
      public_key: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC="
"""

REGISTRY_ONE = """fleet:
  wg_subnet: "10.20.0.0/24"
  listen_port: 51820
  interface: "wg-fleet"
  nodes:
    - name: node-a
      endpoint: "10.0.0.1:51820"
      wg_ip: "10.20.0.1"
      public_key: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
"""

SSH_EXIT_255 = """#!/usr/bin/env bash
echo "ssh $*" >> "${SSH_LOG:-/dev/null}"
exit 255
"""

SSH_DRY_RUN = """#!/usr/bin/env bash
echo "ssh $*" >> "${SSH_LOG:-/dev/null}"
# Letztes Argument ist das Remote-Kommando.
cmd="${*: -1}"
if [[ "$cmd" == *"wg show"* ]]; then
  exit 0   # keine Peers -> stdout bleibt leer
fi
echo "STUB-CALLED: $cmd" >> "${SSH_LOG:-/dev/null}"
exit 0
"""

SSH_BLOCKING = """#!/usr/bin/env bash
echo "ssh $*" >> "${SSH_LOG:-/dev/null}"
cmd="${*: -1}"
case "$cmd" in
  *"wg show"*)
    exit 0   # keine Ist-Peers auf node-a -> node-b fehlt (die Drift)
    ;;
  *"sudo cat /etc/wireguard/"*)
    cat "$FAKE_CONF"
    exit 0
    ;;
  *"sudo cp /etc/wireguard/"*)
    exit 0  # Sicherung "erfolgreich" (Datei selbst hier nicht simuliert)
    ;;
  *"sudo tee -a /etc/wireguard/"*)
    cat >> "$FAKE_CONF"
    exit 0
    ;;
  *"wg set"*)
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
"""

SSH_SUDO_FAIL = """#!/usr/bin/env bash
echo "sudo: a password is required" >&2
exit 1
"""

SSH_RECORD_CALLS = """#!/usr/bin/env bash
cat > /dev/null
echo "$*" >> "$SSH_CALL_LOG"
exit 0
"""


@pytest.fixture
def paths(repo_root: Path, tmp_path: Path):
    return {
        "gen": repo_root / "scripts" / "hetzner" / "generate-wg-conf.sh",
        "sync": repo_root / "scripts" / "wg-mesh-sync.sh",
        "mesh": repo_root / "wireguard" / "wg-mesh-nodes.yaml",
        "tmp": tmp_path,
    }


@pytest.fixture(autouse=True)
def _require_python_yaml():
    # Original: skip "python3 not installed" / "PyYAML not installed".
    if shutil.which("python3") is None:
        pytest.skip("python3 not installed")
    if importlib.util.find_spec("yaml") is None:
        pytest.skip("PyYAML not installed")


def _write_exec(path: Path, content: str) -> Path:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


def _sync(run_cmd, sync: Path, args, env=None):
    """wg-mesh-sync.sh mit stdin=/dev/null (ssh-Stubs duerfen nicht auf das Terminal warten)."""
    return run_cmd(
        ["bash", "-c", 'bash "$1" "${@:2}" < /dev/null', "wg-mesh-sync", str(sync), *args],
        env=env,
        timeout=300,
    )


def _gen_peers_only(run_cmd, gen: Path, node: str = "pk-hetzner-4"):
    return run_cmd(
        ["bash", str(gen), "--env", "fleet", "--node-name", node, "--peers-only"],
        timeout=300,
    )


# ── --peers-only auf der echten Registry ────────────────────────────

def test_t900083_peers_only_gibt_genau_die_public_keys_der_uebrigen_fleet_teilnehmer_aus(paths, run_cmd):
    import yaml

    res = _gen_peers_only(run_cmd, paths["gen"])
    assert res.returncode == 0, f"FAIL: exit={res.returncode}. stdout={res.stdout}"

    # Positiv-Anker: laeuft und findet die Umgebung.
    stdout_lines = [l for l in res.stdout.splitlines() if l.strip()]
    assert stdout_lines, "FAIL: leere Ausgabe."

    # Erwartete Menge dynamisch aus der Registry berechnen (Semantik statt Darstellung).
    with open(paths["mesh"], encoding="utf-8") as f:
        mesh = yaml.safe_load(f)
    env = mesh["fleet"]
    expected = 0
    for cat in PEER_CATEGORIES:
        for node in env.get(cat) or []:
            if node["name"] == "pk-hetzner-4":
                continue
            if node.get("public_key"):
                expected += 1

    actual = len(stdout_lines)
    assert str(actual) == str(expected), \
        f"FAIL: erwartet {expected} Peer-Zeilen, erhalten {actual}. stdout={res.stdout}"


def test_t900083_peers_only_enthaelt_nicht_den_node_selbst(paths, run_cmd):
    res = run_cmd(
        ["bash", str(paths["gen"]), "--env", "fleet", "--node-name", "pk-hetzner-4", "--peers-only"],
        timeout=300,
    )
    assert res.returncode == 0, res.output
    # pk-hetzner-4's eigener Public Key darf nicht in der Ausgabe stehen.
    assert PK4_KEY not in res.output, "FAIL: Ausgabe enthaelt den Public Key von pk-hetzner-4 selbst."


def test_t900083_peers_only_enthaelt_keinen_interface_block_und_kein_privatekey(paths, run_cmd):
    res = run_cmd(
        ["bash", str(paths["gen"]), "--env", "fleet", "--node-name", "pk-hetzner-4", "--peers-only"],
        timeout=300,
    )
    assert res.returncode == 0, res.output
    assert "[Interface]" not in res.output, "FAIL: Ausgabe enthaelt einen [Interface]-Block."
    assert "privatekey" not in res.output.lower(), "FAIL: Ausgabe enthaelt PrivateKey."


def test_t900083_peers_only_ueberspringt_peers_ohne_public_key_stderr_hinweis(paths, run_cmd):
    res = _gen_peers_only(run_cmd, paths["gen"])
    assert res.returncode == 0, res.output
    # Der Hinweis darf NICHT in stdout landen.
    assert TERMINAL_SIDEKICK_NOTE not in res.stdout.lower(), \
        f"FAIL: terminal-sidekick (leerer public_key) landete in stdout. stdout={res.stdout}"
    # Positiv-Anker: der Hinweis MUSS auf stderr stehen.
    assert TERMINAL_SIDEKICK_NOTE in res.stderr.lower(), \
        "FAIL: kein stderr-Hinweis auf das uebersprungene terminal-sidekick."


# ── wg-mesh-sync.sh — Grundgeruest ──────────────────────────────────

def test_t900083_wg_mesh_sync_sh_existiert_und_ist_ausfuehrbar(paths):
    sync = paths["sync"]
    assert sync.is_file(), f"MISSING: {sync}"
    assert sync.stat().st_mode & stat.S_IXUSR, f"NOT executable: {sync}"


def test_t900083_reconcile_env_korczewski_lehnt_fehlenden_interface_key_ab_exit_ungleich_0(paths, run_cmd):
    res = _sync(run_cmd, paths["sync"], ["reconcile", "--env", "korczewski"])
    assert res.returncode != 0, f"FAIL: exit={res.returncode}, erwartet != 0 fuer korczewski ohne interface-Key."
    assert "interface" in res.output.lower(), \
        f"FAIL: Fehlermeldung nennt nicht den fehlenden interface-Key. output={res.output}"


def test_t900083_drift_env_fleet_ohne_erreichbare_nodes_endet_mit_exit_0_skip(paths, run_cmd):
    ssh = _write_exec(paths["tmp"] / "ssh", SSH_EXIT_255)
    ssh_log = paths["tmp"] / "ssh.log"
    res = _sync(
        run_cmd, paths["sync"], ["drift", "--env", "fleet"],
        env={"SSH_LOG": str(ssh_log), "WG_MESH_SYNC_SSH": str(ssh)},
    )
    assert res.returncode == 0, f"FAIL: exit={res.returncode}, erwartet 0 (Skip) ohne erreichbare Nodes. output={res.output}"
    low = res.output.lower()
    assert any(s in low for s in ("skip", "uebersprungen", "nicht erreichbar")), \
        f"FAIL: keine Skip-Meldung. output={res.output}"


def test_t900083_reconcile_env_fleet_dry_run_listet_aenderungen_ohne_wg_set_syncconf_auszufuehren(paths, run_cmd):
    (paths["tmp"] / "registry.yaml").write_text(REGISTRY_TWO, encoding="utf-8")
    ssh = _write_exec(paths["tmp"] / "ssh", SSH_DRY_RUN)
    ssh_log = paths["tmp"] / "ssh.log"

    res = _sync(
        run_cmd, paths["sync"], ["reconcile", "--env", "fleet", "--dry-run"],
        env={
            "SSH_LOG": str(ssh_log),
            "WG_MESH_SYNC_SSH": str(ssh),
            "WG_REGISTRY_FILE": str(paths["tmp"] / "registry.yaml"),
        },
    )
    assert res.returncode == 0, f"FAIL: exit={res.returncode} bei --dry-run. output={res.output}"
    low = res.output.lower()
    assert any(s.lower() in low for s in ("node-a", "node-b", "BBBB", "AAAA")), \
        f"FAIL: keine Aenderungsliste in der Ausgabe. output={res.output}"

    # Kein 'wg set'/'wg syncconf' darf in den protokollierten SSH-Aufrufen stehen.
    if ssh_log.exists():
        log = ssh_log.read_text(encoding="utf-8").lower()
        assert "wg set" not in log and "wg syncconf" not in log, \
            f"FAIL: --dry-run hat eine mutierende wg-Aktion ausgeloest. log:\n{log}"


# ── Review-Befund PR #5489 (BLOCKING): reconcile darf den [Interface]-Block nicht verlieren ──

def test_t900083_reconcile_erhaelt_die_address_zeile_im_interface_block_review_befund_blocking(paths, run_cmd):
    (paths["tmp"] / "registry.yaml").write_text(REGISTRY_TWO, encoding="utf-8")
    conf = paths["tmp"] / "node-a.conf"
    conf.write_text(
        "[Interface]\n"
        "PrivateKey = local-private-key-placeholder\n"
        "Address = 10.20.0.1/32\n"
        "ListenPort = 51820\n",
        encoding="utf-8",
    )
    ssh = _write_exec(paths["tmp"] / "ssh", SSH_BLOCKING)
    ssh_log = paths["tmp"] / "ssh.log"

    res = _sync(
        run_cmd, paths["sync"], ["reconcile", "--env", "fleet", "--node", "node-a"],
        env={
            "FAKE_CONF": str(conf),
            "SSH_LOG": str(ssh_log),
            "WG_MESH_SYNC_SSH": str(ssh),
            "WG_REGISTRY_FILE": str(paths["tmp"] / "registry.yaml"),
        },
    )
    assert res.returncode == 0, f"FAIL: exit={res.returncode} beim Reconcile. output={res.output}"

    content = conf.read_text(encoding="utf-8")
    # Positiv-Anker: der fehlende Peer (node-b) wurde als [Peer]-Block angehaengt.
    assert "PublicKey = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=" in content, \
        f"FAIL: fehlender Peer wurde nicht an die .conf angehaengt.\n{content}"
    # Die eigentliche Zusicherung: Address ist NICHT verlorengegangen.
    assert "Address = 10.20.0.1/32" in content, \
        f"FAIL: Address-Zeile im [Interface]-Block ist nach dem Reconcile verschwunden. Endzustand der .conf:\n{content}"


# ── Review-Befund PR #5489 (klein #3): Remote-Befehl scheitert -> Exit != 0, KEIN Skip ──

def test_t900083_drift_meldet_einen_fehlgeschlagenen_remote_befehl_als_fehler_nicht_als_skip(paths, run_cmd):
    (paths["tmp"] / "registry.yaml").write_text(REGISTRY_ONE, encoding="utf-8")
    ssh = _write_exec(paths["tmp"] / "ssh", SSH_SUDO_FAIL)

    res = _sync(
        run_cmd, paths["sync"], ["drift", "--env", "fleet", "--node", "node-a"],
        env={
            "WG_MESH_SYNC_SSH": str(ssh),
            "WG_REGISTRY_FILE": str(paths["tmp"] / "registry.yaml"),
        },
    )
    assert res.returncode != 0, \
        f"FAIL: exit={res.returncode}, erwartet != 0 bei fehlgeschlagenem Remote-Befehl (kein Skip). output={res.output}"
    low = res.output.lower()
    assert "error" in low or "fehlgeschlagen" in low, \
        f"FAIL: keine Fehlermeldung, obwohl der Remote-Befehl scheiterte. output={res.output}"


# ── Regression PR #5489: die Schleife muss JEDEN Node besuchen ──

def test_t900083_drift_besucht_jeden_node_nicht_nur_den_ersten(paths, run_cmd):
    (paths["tmp"] / "registry.yaml").write_text(REGISTRY_THREE, encoding="utf-8")
    # Der Stub liest seinen stdin leer — genau das Verhalten von ssh, das den Defekt ausgeloest hat.
    ssh = _write_exec(paths["tmp"] / "ssh", SSH_RECORD_CALLS)
    call_log = paths["tmp"] / "calls.log"
    call_log.write_text("", encoding="utf-8")

    _sync(
        run_cmd, paths["sync"], ["drift", "--env", "fleet"],
        env={
            "SSH_CALL_LOG": str(call_log),
            "WG_MESH_SYNC_SSH": str(ssh),
            "WG_REGISTRY_FILE": str(paths["tmp"] / "registry.yaml"),
        },
    )

    # Positiv-Anker: der Stub wurde ueberhaupt aufgerufen.
    log = call_log.read_text(encoding="utf-8")
    assert log.strip(), "ssh-Stub nie aufgerufen"
    # Alle drei Hosts wurden kontaktiert, nicht nur der erste.
    for host in ("10.0.0.1", "10.0.0.2", "10.0.0.3"):
        assert host in log, f"Node {host} nie kontaktiert — Schleife bricht vorzeitig ab\n{log}"
