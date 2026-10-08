"""Native migration of tests/spec/local-llm-proxy.bats."""

import os
import re
import shutil
import socket
import subprocess
import time
import urllib.request

import pytest

STUB_JS = r"""
    const [port,label,model]=process.argv.slice(1);
    require("http").createServer((req,res)=>{
      let b=""; req.on("data",c=>b+=c); req.on("end",()=>{
        res.setHeader("content-type","application/json");
        if(req.url.startsWith("/v1/models"))
          return res.end(JSON.stringify({object:"list",data:[{id:model,object:"model"}]}));
        if(req.url.startsWith("/v1/chat/completions")){
          const m=(JSON.parse(b||"{}").model)||null;
          return res.end(JSON.stringify({backend:label,served:model,requested:m,
            choices:[{message:{role:"assistant",content:"ok"}}]}));
        }
        res.statusCode=404; res.end("{}");
      });
    }).listen(Number(port),"127.0.0.1");
"""

SANITIZE_JS = r"""
    import("./scripts/llm-proxy/fixups.mjs").then(m => {
      process.stdout.write(m.sanitizeGbnfPattern(process.argv[1]));
    });
"""

TOOL_SCHEMA_JS = r"""
    import assert from "node:assert";
    import { sanitizeToolSchemaPatterns } from "./scripts/llm-proxy/fixups.mjs";
    const BS = String.fromCharCode(92);
    const pat = "^[/_." + BS + "-A-Za-z0-9=]+$";
    const body = { tools: [{ type: "function", function: { name: "pods_list",
      parameters: { type: "object", properties: {
        labelSelector: { type: "string", pattern: pat } } } } }] };
    const out = sanitizeToolSchemaPatterns(body);
    const got = out.tools[0].function.parameters.properties.labelSelector.pattern;
    assert.strictEqual(got, "^[/_.A-Za-z0-9=-]+$", "Pattern nicht korrekt entschaerft");
    assert.strictEqual(body.tools[0].function.parameters.properties.labelSelector.pattern,
      pat, "Original-Body wurde mutiert");
"""

NO_TOOLS_JS = r"""
    import("./scripts/llm-proxy/fixups.mjs").then(m => {
      const body = { messages:[{role:"user",content:"hi"}] };
      process.stdout.write(JSON.stringify(m.sanitizeToolSchemaPatterns(body)));
    });
"""

FREE_PORT_JS = 'const s=require("net").createServer();s.listen(0,()=>{console.log(String(s.address().port));s.close();})'

LOADOUT_FIT_JS = r"""
    const d=require("./scripts/llm/loadouts.json");
    let checked=0;
    d.loadouts.forEach(l => {
      if(l.fit && l.fit.enabled===true){
        checked++;
        if(l.args.ctx!==null){console.error(l.slug+": ctx ist "+l.args.ctx);process.exitCode=1}
        if(l.args.ngl!==null){console.error(l.slug+": ngl ist "+l.args.ngl);process.exitCode=1}
      }
    });
    if(checked===0){console.error("kein --fit-Loadout geprueft");process.exitCode=1}
"""

LOADOUT_PORTS_JS = r"""
    const d = require("./scripts/llm/loadouts.json");
    const withPort = d.loadouts.filter(l => l.port != null);
    if (!withPort.length) { console.error("kein Loadout mit Port"); process.exit(2) }
    const seen = new Map();
    for (const l of withPort) {
      const prev = seen.get(l.port);
      if (prev === undefined) { seen.set(l.port, l.exclusiveGroup ?? null); continue }
      if (prev == null || prev !== l.exclusiveGroup) {
        console.error(`${l.slug}: Port ${l.port} doppelt, aber Gruppen ${prev} != ${l.exclusiveGroup}`);
        process.exit(1)
      }
    }
    console.log(`geprueft: ${withPort.length} Loadouts`);
"""

LOADOUT_VALID_JS = (
    'const d=require("./scripts/llm/loadouts.json"); '
    "if(!Array.isArray(d.loadouts)||!d.loadouts.length) process.exit(1); "
    "console.log(String(d.loadouts.length))"
)


def _free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _wait_listening(port, attempts=40):
    for _ in range(attempts):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


def _stdout_only(args, cwd, env=None):
    """Mirrors the 2>/dev/null helpers: stdout only, exit status."""
    full = dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, timeout=120,
    )
    return proc.returncode, proc.stdout


@pytest.fixture
def proxy(tmp_path, repo_root):
    """setup()/teardown(): two stub backends, proxy process with env-based backend list."""
    state = {"procs": [], "proxy": None, "tmp": tmp_path, "root": repo_root}
    port_a, port_b, proxy_port = _free_port(), _free_port(), _free_port()
    stub_a = subprocess.Popen(
        ["node", "-e", STUB_JS, str(port_a), "backendA", "m1"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    stub_b = subprocess.Popen(
        ["node", "-e", STUB_JS, str(port_b), "backendB", "m2"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    state["procs"] = [stub_a, stub_b]
    state.update(PORT_A=port_a, PORT_B=port_b, PROXY_PORT=proxy_port, STUB_A=stub_a, STUB_B=stub_b)
    _wait_listening(port_a)
    _wait_listening(port_b)
    backends = (
        "[\n"
        f'    {{"name":"a","kind":"llamacpp","baseUrl":"http://127.0.0.1:{port_a}/v1","enabled":true,"priority":1,"fixups":[],"modelAliases":{{}}}},\n'
        f'    {{"name":"b","kind":"lmstudio","baseUrl":"http://127.0.0.1:{port_b}/v1","enabled":true,"priority":2,"fixups":[],"modelAliases":{{}}}}]'
    )
    state["env"] = {"LLM_PROXY_PORT": str(proxy_port), "LLM_PROXY_BACKENDS_JSON": backends}
    yield state
    if state["proxy"] is not None and state["proxy"].poll() is None:
        state["proxy"].kill()
        state["proxy"].wait()
    for proc in state["procs"]:
        if proc.poll() is None:
            proc.kill()
            proc.wait()


def _start_proxy(state):
    proc = subprocess.Popen(
        ["node", str(state["root"] / "scripts" / "llm-proxy" / "server.mjs")],
        cwd=str(state["root"]), env={**os.environ, **state["env"]},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    state["proxy"] = proc
    url = f"http://127.0.0.1:{state['PROXY_PORT']}/livez"
    for _ in range(40):
        try:
            with urllib.request.urlopen(url, timeout=1) as resp:
                if resp.status == 200:
                    return
        except Exception:
            pass
        time.sleep(0.25)
    pytest.fail("proxy did not become live")


def _kill_stubs(state):
    for proc in state["procs"]:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    time.sleep(0.3)


def _curl_chat(run_cmd, state, model, extra=()):
    args = ["curl", "-sf", "-D", "-", "-o", "/dev/null",
            "-H", "content-type: application/json", *extra,
            "-d", '{"model":"%s","messages":[]}' % model,
            f"http://127.0.0.1:{state['PROXY_PORT']}/v1/chat/completions"]
    return run_cmd(args)


def test_get_v1_models_aggregiert_beide_backends_m1_m2(run_cmd, proxy):
    _start_proxy(proxy)
    result = run_cmd(["curl", "-sf", f"http://127.0.0.1:{proxy['PROXY_PORT']}/v1/models"])
    assert result.returncode == 0, result.output
    assert '"m1"' in result.output
    assert '"m2"' in result.output


def test_routing_exakte_id_m2_backend_b_via_x_llm_proxy_backend(run_cmd, proxy):
    _start_proxy(proxy)
    result = _curl_chat(run_cmd, proxy, "m2")
    assert result.returncode == 0, result.output
    assert re.search(r"x-llm-proxy-backend: b", result.output, re.I)
    assert re.search(r"x-llm-proxy-served-model: m2", result.output, re.I)


def test_stale_id_verfuegbarkeits_fallback_x_llm_proxy_served_model(run_cmd, proxy):
    _start_proxy(proxy)
    result = _curl_chat(run_cmd, proxy, "does-not-exist")
    assert result.returncode == 0, result.output
    assert re.search(r"x-llm-proxy-served-model: m1", result.output, re.I)


def test_alle_backends_down_503_mit_error_code_no_backend(run_cmd, proxy, tmp_path):
    _kill_stubs(proxy)
    _start_proxy(proxy)
    body = tmp_path / "llmproxy_body"
    result = run_cmd([
        "curl", "-s", "-o", str(body), "-w", "%{http_code}",
        "-H", "content-type: application/json", "-d", '{"model":"m1","messages":[]}',
        f"http://127.0.0.1:{proxy['PROXY_PORT']}/v1/chat/completions",
    ])
    assert result.output == "503", result.output
    assert '"no_backend"' in body.read_text(encoding="utf-8")


def _sanitize(run_cmd, repo_root, pattern):
    """_sanitize(): node import of fixups.mjs, stderr discarded."""
    return _stdout_only(["node", "-e", SANITIZE_JS, pattern], repo_root)


def test_sanitize_gbnf_pattern_gbnf_backslash_minus_in_zeichenklasse_wandert_ans_klassenende(repo_root):
    status, output = _sanitize(None, repo_root, r"^[/_.\-A-Za-z0-9=, ()!]+$")
    assert status == 0
    assert output == "^[/_.A-Za-z0-9=, ()!-]+$"


def test_sanitize_gbnf_pattern_erzeugt_keine_ungewollte_range_dot_minus_a(repo_root):
    _, output = _sanitize(None, repo_root, r"^[/_.\-A-Za-z0-9=, ()!]+$")
    assert ".-A" not in output


def test_sanitize_gbnf_pattern_backslash_minus_ausserhalb_einer_klasse_wird_zum_literal(repo_root):
    _, output = _sanitize(None, repo_root, r"a\-b")
    assert output == "a-b"


def test_sanitize_gbnf_pattern_pattern_ohne_backslash_minus_bleibt_unveraendert(repo_root):
    _, output = _sanitize(None, repo_root, "^[a-z0-9-]+$")
    assert output == "^[a-z0-9-]+$"


def test_sanitize_gbnf_pattern_andere_escapes_bleiben_erhalten(repo_root):
    _, output = _sanitize(None, repo_root, r"^\d+\.\d+[\w\-]$")
    assert output == r"^\d+\.\d+[\w-]$"


def test_sanitize_gbnf_pattern_negierte_klasse_behaelt_und_bekommt_minus_ans_ende(repo_root):
    _, output = _sanitize(None, repo_root, r"[^\-a]")
    assert output == "[^a-]"


def test_sanitize_tool_schema_patterns_patcht_verschachtelte_tools_pattern(run_cmd, repo_root):
    result = run_cmd(["node", "--input-type=module", "-e", TOOL_SCHEMA_JS], cwd=repo_root)
    assert result.returncode == 0


def test_sanitize_tool_schema_patterns_body_ohne_tools_bleibt_unangetastet(run_cmd, repo_root):
    result = run_cmd(["node", "-e", NO_TOOLS_JS], cwd=repo_root)
    assert result.output == '{"messages":[{"role":"user","content":"hi"}]}'


def test_server_mjs_wendet_den_sanitizer_unbedingt_an_nicht_als_db_opt_in(repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "server.mjs").read_text(encoding="utf-8")
    assert "sanitizeToolSchemaPatterns" in text


def test_llm_services_deployment_setzt_workspace_pg_url_statt_kubectl_exec_pfad_t900191_d3(repo_root):
    proc = subprocess.run(
        ["bash", str(repo_root / "scripts" / "devmesh" / "render-stack.sh"), "core"],
        cwd=str(repo_root), stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, timeout=600,
    )
    if proc.returncode != 0:
        pytest.skip("render-stack.sh Vorbedingung fehlt (siehe llm-services.bats)")
    deploy_out = proc.stdout.rstrip("\n")
    assert "WORKSPACE_PG_URL" in deploy_out
    lines = deploy_out.splitlines()
    window = []
    for index, line in enumerate(lines):
        if "name: WORKSPACE_PG_URL" in line:
            window.extend(lines[index:index + 2])
    assert any("shared-db" in line for line in window)


def test_proxy_start_erkennt_eine_bereits_laufende_instanz_t002277(repo_root):
    taskfile = (repo_root / "taskfiles" / "Taskfile.llm.yml").read_text(encoding="utf-8").splitlines()
    block = []
    in_block = False
    for line in taskfile:
        if not in_block and re.match(r"^  proxy:start:", line):
            in_block = True
            block.append(line)
            continue
        if in_block:
            if re.match(r"^  [a-z]", line):
                block.append(line)
                break
            block.append(line)
    count = sum(1 for line in block if re.search(r"curl .*127\.0\.0\.1:\$PORT/(livez|health)", line))
    assert str(count) != "0"


def test_gemma_migration_registriert_das_backend_mit_alias_t002277(repo_root):
    mig = repo_root / "scripts" / "migrations" / "2026-07-27-llm-proxy-gemma-backend.sql"
    assert mig.is_file()
    text = mig.read_text(encoding="utf-8")
    assert '"gemma-4-12b"' in text
    assert re.search(r"llamacpp-gemma", text)


def test_devmesh_deploy_wartet_den_rollout_status_ab_statt_erfolg_zu_melden_t900191_nachfolger_t002281(repo_root):
    taskfile = (repo_root / "taskfiles" / "Taskfile.devmesh.yml").read_text(encoding="utf-8").splitlines()
    block = []
    in_block = False
    for line in taskfile:
        if not in_block and re.match(r"^  deploy:", line):
            in_block = True
            block.append(line)
            continue
        if in_block:
            if re.match(r"^  [a-z]", line):
                block.append(line)
                break
            block.append(line)
    count = sum(1 for line in block if "rollout status" in line)
    assert str(count) != "0"


def test_t002336_node_test_llm_proxy_suite_passes_readiness_routing(run_cmd, repo_root):
    result = run_cmd(["node", "--test", str(repo_root / "scripts" / "llm-proxy" / "server.test.mjs")], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert "fail 0" in result.output


def test_t002336_health_meldet_503_bei_totem_prio_1_backend_livez_bleibt_200(run_cmd, proxy, tmp_path):
    _kill_stubs(proxy)
    _start_proxy(proxy)
    body = tmp_path / "llmproxy_health"
    result = run_cmd([
        "curl", "-s", "-o", str(body), "-w", "%{http_code}",
        f"http://127.0.0.1:{proxy['PROXY_PORT']}/health",
    ])
    assert result.output == "503", result.output
    text = body.read_text(encoding="utf-8")
    assert '"ready":false' in text
    assert '"name":"a"' in text

    result = run_cmd(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                      f"http://127.0.0.1:{proxy['PROXY_PORT']}/livez"])
    assert result.output == "200", result.output


def test_t002394_loadouts_json_ist_gueltiges_json_mit_mindestens_einem_loadout(run_cmd, repo_root):
    result = run_cmd(["node", "-e", LOADOUT_VALID_JS], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert int(result.output) >= 1


def test_t002394_kein_loadout_mit_fit_pinnt_ctx_oder_ngl_fit_regression(run_cmd, repo_root):
    result = run_cmd(["node", "-e", LOADOUT_FIT_JS], cwd=repo_root)
    assert result.returncode == 0, result.output


def test_t002394_t002459_ports_sind_eindeutig_unter_gleichzeitig_lauffaehigen_loadouts(run_cmd, repo_root):
    result = run_cmd(["node", "-e", LOADOUT_PORTS_JS], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert "geprueft: " in result.output


def test_t002394_server_mjs_importiert_loadouts_modul(repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "server.mjs").read_text(encoding="utf-8")
    assert "from './loadouts.mjs'" in text


def test_t002394_admin_routen_sind_in_server_mjs_definiert(repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "server.mjs").read_text(encoding="utf-8")
    assert "'/admin/state'" in text
    assert "'/admin/reload'" in text


def test_t002394_admin_route_verweist_aufs_sdlc_cockpit_410(run_cmd, repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "server.mjs").read_text(encoding="utf-8")
    assert re.search(r"'/admin'|'/admin/'.*GET", text)
    run_cmd(["curl", "-s", "http://127.0.0.1:18235/admin"])


def test_t002483_slot_queue_mjs_exports_extract_slot_id(repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "slot-queue.mjs").read_text(encoding="utf-8")
    assert "export function extractSlotId" in text


def test_t002483_enqueue_accepts_slot_id_parameter(repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "slot-queue.mjs").read_text(encoding="utf-8")
    assert any(re.search(r"function enqueue.*slotId", line) for line in text.splitlines())


def test_t002483_slot_id_forges_per_slot_queue_key(repo_root):
    text = (repo_root / "scripts" / "llm-proxy" / "slot-queue.mjs").read_text(encoding="utf-8")
    assert "`${name}:slot${slotId}`" in text


def test_t002483_response_includes_x_llm_proxy_slot_header_when_slot_present(run_cmd, proxy):
    _start_proxy(proxy)
    result = _curl_chat(run_cmd, proxy, "m2", extra=("-H", "x-slot-id: 7"))
    assert result.returncode == 0, result.output
    assert re.search(r"x-llm-proxy-slot: 7", result.output, re.I)
