"""Native migration of tests/spec/openclaw-ops-bot.bats."""

import json
import os
import socket
import subprocess
import time

import pytest
import yaml

TOKEN = "test-token-0123456789abcdef"

JSON_GET_JS = """const fs = require('node:fs');
const [file, expr] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8')
  .split('\\n').filter((l) => !/^\\s*\\/\\//.test(l)).join('\\n');
const c = JSON.parse(text);
const v = new Function('c', `return (${expr});`)(c);
process.stdout.write(v === undefined ? 'undefined' : JSON.stringify(v));
"""

ALLOWLIST_JS = """const fs = require('node:fs');
const text = fs.readFileSync(process.argv[2], 'utf8')
  .split('\\n').filter((l) => !/^\\s*\\/\\//.test(l)).join('\\n');
const c = JSON.parse(text);
// Ein Eintrag erlaubt <bin> <args>, wenn sein pattern auf das Binary passt (Name, Pfad
// oder Wildcard) und sein argPattern (fehlt es: alles) auf die Argumente matcht.
const allows = (e, bin, args) => {
  const p = String(e.pattern ?? '').split('/').pop();
  if (p !== bin && p !== '*' && p !== '**') return false;
  return e.argPattern === undefined || new RegExp(e.argPattern).test(args);
};
const readOnly = [['kubectl', '--context fleet get pods -A'], ['flux', 'get kustomizations -A'],
  ['gh', 'run list --branch main --limit 5'], ['git', 'status']];
const forbidden = [['rm', '-rf /tmp/x'], ['kubectl', 'delete pod x'],
  ['kubectl', '--context fleet apply -f x.yaml'], ['kubectl', 'patch deploy x -p {}'],
  ['kubectl', 'scale deploy x --replicas=0'], ['flux', 'reconcile kustomization x'],
  ['flux', 'suspend kustomization x'], ['flux', 'resume kustomization x'],
  ['git', 'push origin main']];
const errors = [];
for (const id of ['ops', 'task-runner']) {
  const list = c.agents?.[id]?.allowlist;
  if (!Array.isArray(list) || list.length === 0) { errors.push(`${id}: allowlist fehlt/leer`); continue; }
  for (const [bin, args] of readOnly) {
    if (!list.some((e) => allows(e, bin, args))) errors.push(`${id}: verbietet ${bin} ${args}`);
  }
  for (const [bin, args] of forbidden) {
    if (list.some((e) => allows(e, bin, args))) errors.push(`${id}: erlaubt ${bin} ${args}`);
  }
}
if (errors.length) { console.log(errors.join('\\n')); process.exit(1); }
console.log('allowlist ok');
"""


def _merged(args, cwd, env=None, stdin=None):
    full = dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full, input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout.strip()


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture
def bot(tmp_path, repo_root):
    """Mirrors setup()/teardown(): starts the fake gateway and exposes paths."""
    t = tmp_path
    (t / "home").mkdir()
    log = t / "requests.log"
    log.write_text("", encoding="utf-8")
    port_file = t / "port"
    fake_out = open(t / "fake.out", "w", encoding="utf-8")
    proc = subprocess.Popen(
        ["node", str(repo_root / "tests" / "spec" / "fixtures" / "openclaw-fake-gateway.mjs"),
         TOKEN, str(port_file), str(log)],
        stdout=fake_out, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
    )
    for _ in range(50):
        if port_file.exists() and port_file.stat().st_size > 0:
            break
        time.sleep(0.1)
    if not (port_file.exists() and port_file.stat().st_size > 0):
        proc.kill()
        pytest.fail(f"fake gateway did not start: {(t / 'fake.out').read_text(encoding='utf-8')}")
    state = {
        "T": t,
        "LOG": log,
        "FAKE_URL": f"http://127.0.0.1:{port_file.read_text(encoding='utf-8').strip()}",
        "CONFIG": repo_root / "openclaw" / "openclaw.json5",
        "APPROVALS": repo_root / "openclaw" / "exec-approvals.json5",
        "ASK": repo_root / "scripts" / "openclaw-ask.sh",
        "REPO": repo_root,
    }
    yield state
    proc.kill()
    proc.wait()
    fake_out.close()


def _json_get(bot, expr, file=None):
    """Port of json_get: evaluates a JS expression against the JSON5-template (comments dropped)."""
    target = str(file or bot["CONFIG"])
    return _merged(["node", "-", target, expr], bot["REPO"], stdin=JSON_GET_JS)


def test_taskfile_pins_node_by_checksum_and_no_longer_installs_opencode(repo_root):
    tf = repo_root / "taskfiles" / "Taskfile.openclaw.yml"
    with open(tf, encoding="utf-8") as fh:
        checksum = str(yaml.safe_load(fh)["vars"]["NODE24_SHA256"])
    assert checksum and len(checksum) == 64 and all(c in "0123456789abcdef" for c in checksum)
    text = tf.read_text(encoding="utf-8")
    for needle in ("sudo", "npm install -g opencode", "command -v opencode"):
        assert needle not in text, f"verbotenes Muster in Taskfile.openclaw.yml: {needle}"


def test_template_binds_loopback_and_uses_env_references(bot):
    status, output = _json_get(bot, "c.gateway.bind")
    assert status == 0
    assert output == '"loopback"'
    assert _json_get(bot, "c.gateway.port")[1] == "18789"
    assert _json_get(bot, "c.gateway.auth.mode")[1] == '"token"'
    assert _json_get(bot, "c.gateway.auth.token")[1] == '"${OPENCLAW_GATEWAY_TOKEN}"'
    assert _json_get(bot, 'c.models.providers["opencode-go"].apiKey')[1] == '"${OPENCODE_GO_API_KEY}"'


def test_write_tools_are_denied_for_both_agents(bot):
    for agent in ("ops", "task-runner"):
        status, output = _json_get(bot, f"c.agents.entries['{agent}'].tools.deny")
        assert status == 0, f"kein deny fuer {agent}: {output}"
        status, _ = _merged(
            ["jq", "-e", '(["write","edit","apply_patch"] - .) == []'],
            bot["REPO"], stdin=output,
        )
        assert status == 0, f"{agent} deny unvollstaendig: {output}"


def test_primary_is_local_fallback_is_opencode_go(bot):
    status, output = _json_get(bot, "c.agents.defaults.model")
    assert status == 0
    status, _ = _merged(
        ["jq", "-e", '.primary == "local/local-default"\n'
                     '    and .fallbacks == ["opencode-go/muse-spark-1.3-contributor"]'],
        bot["REPO"], stdin=output,
    )
    assert status == 0, output
    assert _json_get(bot, 'c.agents.defaults.models["opencode-go/muse-spark-1.3-contributor"].params.thinking')[1] == '"low"'
    assert _json_get(bot, "c.models.providers.local.baseUrl")[1] == '"${OPENCLAW_LOCAL_BASE_URL}"'


def test_ops_is_the_default_agent_with_a_30_minute_telegram_heartbeat_and_exec_in_allowlist_mode(bot):
    status, output = _json_get(bot, "c.agents.entries.ops")
    assert status == 0
    status, _ = _merged(
        ["jq", "-e", '.default == true\n    and .heartbeat.every == "30m"\n'
                     '    and .heartbeat.target == "telegram"\n'
                     '    and .heartbeat.to == "${TELEGRAM_CHAT_ID}"'],
        bot["REPO"], stdin=output,
    )
    assert status == 0, output
    assert _json_get(bot, '"heartbeat" in c.agents.entries["task-runner"]')[1] == "false"
    assert _json_get(bot, "c.tools.exec.security")[1] == '"allowlist"'


def test_exec_allowlist_of_both_agents_permits_only_read_only_commands(bot):
    status, output = _merged(
        ["node", "-", str(bot["APPROVALS"])], bot["REPO"], stdin=ALLOWLIST_JS
    )
    assert status == 0, output
    assert output == "allowlist ok"


def test_heartbeat_scratch_md_lists_every_check_and_no_reply_and_the_workspace_has_no_heartbeat_md(bot):
    path = bot["REPO"] / "openclaw" / "heartbeat-scratch.md"
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    for needle in (
        "NO_REPLY",
        "flux get kustomizations --context fleet -A",
        "kubectl --context fleet get pods -A --field-selector=status.phase!=Running,status.phase!=Succeeded",
        "gh run list --branch main --limit 5",
        "bash scripts/ticket.sh list --status plan_staged",
    ):
        assert needle in text, f"fehlt in heartbeat-scratch.md: {needle}"
    assert not (bot["REPO"] / "openclaw" / "workspace" / "HEARTBEAT.md").exists()


def test_successful_call_prints_the_answer(bot, run_cmd):
    env = {
        "HOME": str(bot["T"] / "home"),
        "OPENCLAW_GATEWAY_URL": bot["FAKE_URL"],
        "OPENCLAW_GATEWAY_TOKEN": TOKEN,
    }
    result = run_cmd([str(bot["ASK"]), "--timeout", "10", "status"], env=env)
    assert result.returncode == 0, result.output
    assert "RESULT: done" in result.output.splitlines()
    lines = bot["LOG"].read_text(encoding="utf-8").splitlines()
    entries = [json.loads(line) for line in lines if line.strip()]
    ok = [e for e in entries if e.get("auth") == "ok"]
    assert [e["body"]["model"] for e in ok] == ["openclaw/task-runner"]
    assert [e["body"]["messages"][-1]["content"] for e in ok] == ["status"]


def test_gateway_without_listener(bot, run_cmd):
    port = _free_port()
    env = {
        "HOME": str(bot["T"] / "home"),
        "OPENCLAW_GATEWAY_URL": f"http://127.0.0.1:{port}",
        "OPENCLAW_GATEWAY_TOKEN": TOKEN,
    }
    result = run_cmd([str(bot["ASK"]), "--timeout", "10", "status"], env=env)
    assert result.returncode == 3, result.output
    assert f"http://127.0.0.1:{port}" in result.output


def test_missing_token_exits_2_without_contacting_the_gateway(bot, run_cmd, monkeypatch):
    monkeypatch.delenv("OPENCLAW_GATEWAY_TOKEN", raising=False)
    env = {"HOME": str(bot["T"] / "home"), "OPENCLAW_GATEWAY_URL": bot["FAKE_URL"]}
    result = run_cmd([str(bot["ASK"]), "--timeout", "10", "status"], env=env)
    assert result.returncode == 2, result.output
    assert bot["LOG"].read_text(encoding="utf-8") == ""


def test_wrong_token_exits_4_with_the_gateway_error_text(bot, run_cmd):
    env = {
        "HOME": str(bot["T"] / "home"),
        "OPENCLAW_GATEWAY_URL": bot["FAKE_URL"],
        "OPENCLAW_GATEWAY_TOKEN": "wrong-token",
    }
    result = run_cmd([str(bot["ASK"]), "--timeout", "10", "status"], env=env)
    assert result.returncode == 4, result.output
    assert "invalid gateway token" in result.output
    auth = [json.loads(line).get("auth") for line in bot["LOG"].read_text(encoding="utf-8").splitlines() if line.strip()]
    assert auth == ["bad"]
