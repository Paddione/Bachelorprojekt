"""scripts/mcp-central/launch.mjs startet zentrale MCP-Server aus $MCP_SERVERS_HOME.

Pruefmodus: command output verification -- der Launcher wird ausgefuehrt, geprueft
werden Exit-Code, durchgereichtes stdio und der in stderr genannte Pfad.
"""

# [T901492]

import json
import os
import subprocess

FAKE_SERVER = """\
import readline from 'node:readline';
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (l) => {
  const m = JSON.parse(l);
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { argv: process.argv.slice(2) } }) + '\\n');
  process.exit(0);
});
"""


def _launch(repo_root, args, env_extra, stdin=""):
    env = {k: v for k, v in os.environ.items() if k != "MCP_SERVERS_HOME"}
    env.update(env_extra)
    proc = subprocess.run(
        ["node", str(repo_root / "scripts/mcp-central/launch.mjs"), *args],
        cwd=str(repo_root), env=env, input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=30,
    )
    return proc.returncode, proc.stdout.strip(), proc.stderr.strip()


def test_launcher_reicht_stdio_und_argumente_an_den_zentralen_server_durch(repo_root, tmp_path):
    (tmp_path / "ticket").mkdir()
    (tmp_path / "ticket" / "server.mjs").write_text(FAKE_SERVER, encoding="utf-8")
    req = json.dumps({"jsonrpc": "2.0", "id": 7, "method": "initialize"}) + "\n"
    rc, out, _ = _launch(repo_root, ["ticket/server.mjs", "--taskfile", "Taskfile.yml"],
                         {"MCP_SERVERS_HOME": str(tmp_path)}, stdin=req)
    assert rc == 0
    assert json.loads(out) == {"jsonrpc": "2.0", "id": 7, "result": {"argv": ["--taskfile", "Taskfile.yml"]}}


def test_launcher_faellt_ohne_mcp_servers_home_auf_home_mcp_servers_zurueck(repo_root, tmp_path):
    rc, _, err = _launch(repo_root, ["ticket/server.mjs"], {"HOME": str(tmp_path)})
    assert rc == 1
    assert str(tmp_path / "mcp-servers" / "ticket" / "server.mjs") in err


def test_launcher_nennt_den_fehlenden_quellpfad(repo_root, tmp_path):
    rc, _, err = _launch(repo_root, ["devflow/server.mjs"], {"MCP_SERVERS_HOME": str(tmp_path)})
    assert rc == 1
    assert str(tmp_path / "devflow" / "server.mjs") in err


def test_launcher_lehnt_pfade_ausserhalb_von_mcp_servers_home_ab(repo_root, tmp_path):
    for bad in ("../etc/passwd", "/etc/passwd"):
        (tmp_path / "x").mkdir(exist_ok=True)
        rc, out, _ = _launch(repo_root, [bad], {"MCP_SERVERS_HOME": str(tmp_path / "x")})
        assert rc == 2, bad
        assert out == "", bad
