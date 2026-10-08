"""Native migration of tests/spec/local-llm-proxy/gemma-loadout-autorestart-queue.bats."""

import json
import os
import re
import subprocess
import time

import pytest

STUB_JS = """
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

FREE_PORT_JS = 'const s=require("net").createServer();s.listen(0,()=>{console.log(String(s.address().port));s.close();})'


def _free_port(run_cmd, repo_root):
    res = run_cmd(["node", "-e", FREE_PORT_JS], cwd=repo_root)
    assert res.returncode == 0, res.output
    return res.stdout.strip()


def _node_module(run_cmd, repo_root, body):
    js = (
        "    import assert from 'node:assert/strict';\n" + body
    )
    return run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)


@pytest.fixture
def stubs(run_cmd, repo_root):
    port_a = _free_port(run_cmd, repo_root)
    port_b = _free_port(run_cmd, repo_root)
    proxy_port = _free_port(run_cmd, repo_root)
    pa = subprocess.Popen(["node", "-e", STUB_JS, port_a, "backendA", "m1"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    pb = subprocess.Popen(["node", "-e", STUB_JS, port_b, "backendB", "m2"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    backends = (
        "[\n"
        f'    {{"name":"a","kind":"llamacpp","baseUrl":"http://127.0.0.1:{port_a}/v1","enabled":true,"priority":1,"fixups":[],"modelAliases":{{}}}},\n'
        f'    {{"name":"b","kind":"lmstudio","baseUrl":"http://127.0.0.1:{port_b}/v1","enabled":true,"priority":2,"fixups":[],"modelAliases":{{}}}}]'
    )
    env = {"LLM_PROXY_PORT": proxy_port, "LLM_PROXY_BACKENDS_JSON": backends}
    state = {"proxy": None, "env": env, "port": proxy_port, "stubs": (pa, pb)}
    yield state
    for p in [state["proxy"], pa, pb]:
        if p is not None:
            try:
                p.kill()
                p.wait(timeout=5)
            except Exception:
                pass


def _start_proxy(repo_root, state):
    state["proxy"] = subprocess.Popen(
        ["node", str(repo_root / "scripts/llm-proxy/server.mjs")],
        cwd=str(repo_root), env={**os.environ, **state["env"]},
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(40):
        res = subprocess.run(
            ["curl", "-sf", f"http://127.0.0.1:{state['port']}/livez"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        if res.returncode == 0:
            return True
        time.sleep(0.25)
    return False


def test_gemma_loadout_autorestart_queue_build_start_command_setzt_restart_properties_vor_dem_trenner(run_cmd, repo_root):
    res = _node_module(run_cmd, repo_root, f"""
    const {{ buildStartCommand }} = await import('file://{repo_root}/scripts/llm-proxy/runner.mjs');
    const lo = {{ slug: 'probe', port: 9999, args: {{}}, fit: {{ enabled: true }} }};
    const cmd = buildStartCommand(lo, '/m.gguf', {{ host: '127.0.0.1' }}, '/bin/llama-server');

    const iRestart = cmd.indexOf('--property=Restart=on-failure');
    const iSec     = cmd.indexOf('--property=RestartSec=5');
    const iSep     = cmd.indexOf('--');
    assert.ok(iRestart >= 0, 'Restart=on-failure fehlt');
    assert.ok(iSec >= 0, 'RestartSec=5 fehlt');
    assert.ok(iSep >= 0, 'der --Trenner fehlt');
    assert.ok(iRestart < iSep, 'Restart steht hinter dem --Trenner');
    assert.ok(iSec < iSep, 'RestartSec steht hinter dem --Trenner');
    assert.ok(cmd.includes('--collect'), '--collect fehlt');
    console.log('ok');
""")
    assert res.returncode == 0, res.output
    assert "ok" in res.output.splitlines()


def test_gemma_loadout_autorestart_queue_gemma26_factory_steht_in_der_ausgelieferten_registry_und_laesst_fit_intakt(run_cmd, repo_root):
    res = _node_module(run_cmd, repo_root, f"""
    const {{ readLoadouts }} = await import('file://{repo_root}/scripts/llm-proxy/loadouts.mjs');
    const {{ doc }} = readLoadouts('{repo_root}/scripts/llm/loadouts.json');
    const by = (s) => doc.loadouts.find((l) => l.slug === s);

    const f = by('gemma26-factory');
    assert.ok(f, 'gemma26-factory fehlt');

    assert.equal(f.port, 8091, 'Port muss 8091 sein');
    assert.equal(f.fit?.enabled, true, 'fit muss aktiv sein');
    assert.ok(f.fit.targetMarginMib != null, 'targetMarginMib fehlt');
    assert.ok(f.fit.minCtx != null, 'minCtx fehlt');
    assert.equal(f.args.ctx, null, 'ctx darf nicht gepinnt sein');
    assert.equal(f.args.ngl, null, 'ngl darf nicht gepinnt sein');
    assert.equal(f.args.parallel, 3, 'gemma26-factory ist das 3-Slot-Profil');
    console.log('ok');
""")
    assert res.returncode == 0, res.output
    assert "ok" in res.output.splitlines()


def test_gemma_loadout_autorestart_queue_alle_gpu_chat_loadouts_schliessen_einander_per_exclusivegroup_aus(run_cmd, repo_root):
    res = _node_module(run_cmd, repo_root, f"""
    const {{ readLoadouts }} = await import('file://{repo_root}/scripts/llm-proxy/loadouts.mjs');
    const {{ doc }} = readLoadouts('{repo_root}/scripts/llm/loadouts.json');

    const solo = doc.loadouts.filter((l) => !l.exclusiveGroup);
    assert.ok(solo.length > 0, 'kein Loadout ohne exclusiveGroup — Anker verloren');

    const chatGpu = doc.loadouts.filter((l) => l.exclusiveGroup === 'chat-gpu');
    assert.ok(chatGpu.length >= 2,
      'erwartet mindestens zwei Loadouts in chat-gpu, sonst ist der Ausschluss gegenstandslos');
    console.log('solo=' + solo.length + ' chatGpu=' + chatGpu.length);
""")
    assert res.returncode == 0, res.output


def test_gemma_loadout_autorestart_queue_gemma26_factory_traegt_kvu_gptoss_context_nicht(run_cmd, repo_root):
    res = _node_module(run_cmd, repo_root, f"""
    const {{ readLoadouts }} = await import('file://{repo_root}/scripts/llm-proxy/loadouts.mjs');
    const {{ buildServerArgv }} = await import('file://{repo_root}/scripts/llm-proxy/runner.mjs');
    const {{ doc }} = readLoadouts('{repo_root}/scripts/llm/loadouts.json');
    const argv = (s) => buildServerArgv(
      doc.loadouts.find((l) => l.slug === s), '/m.gguf', {{ host: '127.0.0.1' }}, {{}});

    assert.ok(argv('gemma26-factory').includes('-kvu'), 'gemma26-factory ohne -kvu');
    assert.ok(!argv('gptoss-context').includes('-kvu'), 'gptoss-context traegt faelschlich -kvu');
    console.log('ok');
""")
    assert res.returncode == 0, res.output
    assert "ok" in res.output.splitlines()


def test_gemma_loadout_autorestart_queue_unbekanntes_modell_ergibt_weiterhin_503_no_backend_ohne_health_wartezeit(run_cmd, repo_root, stubs, tmp_path):
    for p in stubs["stubs"]:
        p.kill()
        p.wait(timeout=5)
    assert _start_proxy(repo_root, stubs), "proxy did not become live"

    body_file = tmp_path / "nb-body"
    res = run_cmd([
        "curl", "-s", "-o", str(body_file), "-w", "%{http_code}", "--max-time", "20",
        "-X", "POST", f"http://127.0.0.1:{stubs['port']}/v1/chat/completions",
        "-H", "Content-Type: application/json",
        "-d", '{"model":"does-not-exist","messages":[{"role":"user","content":"x"}]}',
    ], cwd=repo_root)
    code = res.stdout.strip()
    body = body_file.read_text(encoding="utf-8", errors="replace") if body_file.exists() else ""
    assert code == "503", f"code={code} body={body}"
    assert "no_backend" in body


def test_gemma_loadout_autorestart_queue_node_test_llm_proxy_suiten_loadouts_runner_server_sind_gruen(run_cmd, repo_root):
    res = run_cmd([
        "node", "--test",
        str(repo_root / "scripts/llm-proxy/loadouts.test.mjs"),
        str(repo_root / "scripts/llm-proxy/runner.test.mjs"),
        str(repo_root / "scripts/llm-proxy/server.test.mjs"),
    ], cwd=repo_root)
    assert res.returncode == 0, res.output
    fail_lines = [l for l in res.output.splitlines() if l.startswith("# fail ")]
    assert any(l == "# fail 0" for l in fail_lines), fail_lines
