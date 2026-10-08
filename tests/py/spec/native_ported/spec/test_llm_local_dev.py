"""Native migration of tests/spec/llm-local-dev.bats."""

import glob
import os
import re
import subprocess

import pytest
import yaml


NODE_NO_DUP_GEMMA26 = r"""
const s = require('fs').readFileSync('__REPO__/.opencode/opencode.jsonc','utf8');
const j = s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
const o = JSON.parse(j);
process.exit('llamacpp-gemma26' in (o.provider || {}) ? 1 : 0);
"""

NODE_CTX_MEASURED = r"""
const fs = require('fs');
const s = fs.readFileSync('__REPO__/.opencode/agent-models.jsonc','utf8');
const j = s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
const o = JSON.parse(j);
const m = ((o.provider || {})['llamacpp-local'] || {}).models || {};
const entry = m['Qwen3.8-27B'];
if (!entry) { console.error('Qwen3.8-27B fehlt im llamacpp-local-Katalog'); process.exit(1); }
const ctx = (entry.limit || {}).context;
if (!Number.isInteger(ctx) || ctx <= 0) {
  console.error('ctx ' + ctx + ' ist keine positive ganze Zahl'); process.exit(1);
}
if (ctx === 262144) {
  console.error('ctx ' + ctx + ' ist das advertised max_model_len, nicht die served KV'); process.exit(1);
}
if (ctx > 153600) {
  console.error('ctx ' + ctx + ' uebersteigt die served 153600 KV'); process.exit(1);
}
process.exit(0);
"""

NODE_LOCAL_FAMILY = r"""
const fs = require('fs');
const s = fs.readFileSync('__REPO__/.opencode/agent-models.jsonc','utf8');
const j = s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
const a = JSON.parse(j).agent || {};
const expect = { local: 'subagent', reviewer: 'subagent', 'bp-build': 'primary', 'bp-run': 'primary' };
for (const [name, mode] of Object.entries(expect)) {
  const v = a[name];
  if (!v) { console.error(name + ' fehlt in agent-models.jsonc'); process.exit(1); }
  if (v.mode !== mode) { console.error(name + ' mode ' + v.mode + ' != ' + mode); process.exit(1); }
  if (v.model !== 'llamacpp-local/Qwen3.8-27B') {
    console.error(name + ' model ' + v.model + ' != llamacpp-local/Qwen3.8-27B'); process.exit(1);
  }
}
process.exit(0);
"""

NODE_LOCAL_PRIMARY = r"""
const fs = require('fs');
const s = fs.readFileSync('__REPO__/.opencode/agent-models.jsonc','utf8');
const j = s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
const o = JSON.parse(j);
const prim = (o.agent || {})['bp-build'];
if (!prim) { console.error('bp-build fehlt'); process.exit(1); }
if (prim.mode !== 'primary') { console.error('bp-build mode ' + prim.mode + ' != primary'); process.exit(1); }
const model = prim.model;
if (model !== 'llamacpp-local/Qwen3.8-27B') {
  console.error('bp-build model ' + model + ' != llamacpp-local/Qwen3.8-27B'); process.exit(1);
}
const [prov, mid] = model.split('/');
const entry = ((o.provider[prov] || {}).models || {})[mid];
if (!entry) { console.error('model ' + model + ' fehlt im Provider ' + prov); process.exit(1); }
const ctx = (entry.limit || {}).context;
if (!Number.isInteger(ctx) || ctx <= 0) {
  console.error('ctx ' + ctx + ' ist keine positive ganze Zahl'); process.exit(1);
}
if (ctx === 262144) {
  console.error('ctx ' + ctx + ' ist das advertised max_model_len, nicht die served KV'); process.exit(1);
}
if (ctx > 153600) {
  console.error('ctx ' + ctx + ' uebersteigt die served 153600 KV'); process.exit(1);
}
process.exit(0);
"""

NODE_NO_WILDCARD = r"""
const s = require('fs').readFileSync('__REPO__/.opencode/agent-models.jsonc','utf8');
const j = s.replace(/^\s*\/\/.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
const t = ((JSON.parse(j).agent || {}).orchestrator || {}).permission || {};
const keys = Object.keys(t.task || {});
const wild = keys.filter(k => k.startsWith('gemma') && k.includes('*'));
if (wild.length) { console.error('wildcard gemma grants: ' + JSON.stringify(wild)); process.exit(1); }
process.exit(0);
"""

NODE_DEAD_ENTRIES = r"""
const j5 = require('json5');
const d = j5.parse(require('fs').readFileSync('__REPO__/.opencode/agent-models.jsonc','utf8'));
const m = ((d.provider || {})['llamacpp-local'] || {}).models || {};
if (!('Qwen3.8-27B' in m)) {
  console.error('positive anchor failed: Qwen3.8-27B fehlt im llamacpp-local-Katalog'); process.exit(1);
}
const dead = ['Qwen3.8-27B-gsq','Qwen3.6-35B-A3B-NVFP4','qwen38-220k','gptoss-context','gemma26-factory','gemma4','gemma26-throughput','gemma12-vision','hauhau-qwen36']
  .filter(k => k in m);
if (dead.length) { console.error('dead catalog entries still declared: ' + dead.join(',')); process.exit(1); }
process.exit(0);
"""

NODE_CONTEXT_VALUE = r"""
const d = require('json5').parse(require('fs').readFileSync('__REPO__/.opencode/agent-models.jsonc','utf8'));
const e = (((d.provider || {})['llamacpp-local'] || {}).models || {})['Qwen3.8-27B'];
console.log(e ? e.limit.context : 'missing');
"""

PY_NO_BAD_BASEURL = r"""
import re
s = open('__REPO__/.opencode/agent-models.jsonc').read()
bad = re.findall(r'"(llamacpp[^"]*)"\s*:\s*\{.*?"baseURL"\s*:\s*"[^"]*:8091[^"]*"', s, re.S)
print(len(bad))
"""


def _merged(args, cwd, stdin=None):
    proc = subprocess.run(
        args, cwd=str(cwd), env=dict(os.environ), input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout.rstrip("\n")


def _node(repo_root, template):
    return _merged(["node", "-e", template.replace("__REPO__", str(repo_root))], repo_root)


@pytest.fixture
def taskfile(repo_root):
    return repo_root / "taskfiles" / "Taskfile.openclaw.yml"


def test_taskfile_openclaw_yml_exists(taskfile):
    assert taskfile.is_file()


def test_taskfile_openclaw_yml_is_valid_yaml_parseable(taskfile):
    with open(taskfile, encoding="utf-8") as fh:
        yaml.safe_load(fh)


def test_taskfile_openclaw_yml_declares_install_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*install:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_configure_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*configure:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_start_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*start:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_status_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*status:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_logs_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*logs:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_backup_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*backup:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_restore_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*restore:", text, re.M) is not None


def test_taskfile_openclaw_yml_declares_wipe_task(taskfile):
    text = taskfile.read_text(encoding="utf-8")
    assert re.search(r"^\s*wipe:", text, re.M) is not None




def test_dotfiles_openclaw_env_example_exists(repo_root):
    assert (repo_root / "dotfiles" / "openclaw" / ".env.example").is_file()


def test_opencode_jsonc_defines_no_duplicate_llamacpp_gemma26_provider(repo_root):
    status, output = _node(repo_root, NODE_NO_DUP_GEMMA26)
    assert status == 0, output


def test_no_opencode_config_points_a_baseurl_at_the_bonsai_port_8093(repo_root):
    pattern = re.compile(r'"baseURL": *"https?://[^"]*:8093')
    comment = re.compile(r"^\s*//")
    kept = []
    for path in sorted(glob.glob(str(repo_root / ".opencode" / "*.jsonc"))):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                line = line.rstrip("\n")
                if pattern.search(line) and not comment.search(line):
                    kept.append(line)
    assert kept == [], "\n".join(kept)


def test_agent_models_jsonc_defines_the_llamacpp_local_provider_t002545_t002633(repo_root):
    text = (repo_root / ".opencode" / "agent-models.jsonc").read_text(encoding="utf-8")
    assert '"llamacpp-local"' in text


def test_agent_models_jsonc_points_the_local_llama_cpp_provider_at_the_llm_proxy_not_at_8091_t002558(repo_root):
    path = repo_root / ".opencode" / "agent-models.jsonc"
    text = path.read_text(encoding="utf-8")
    assert re.search(r'"baseURL": *"http://127\.0\.0\.1:1919/v1"', text)
    assert not re.search(r'"baseURL": *"http://127\.0\.0\.1:18235', text)

    script = PY_NO_BAD_BASEURL.replace("__REPO__", str(repo_root))
    status, output = _merged(["python3", "-"], repo_root, stdin=script)
    assert output == "0", output


def test_agent_models_jsonc_declares_a_measured_context_for_the_local_model_not_n_ctx_train(repo_root):
    status, output = _node(repo_root, NODE_CTX_MEASURED)
    assert status == 0, output


def test_agent_models_jsonc_defines_the_local_family_on_qwen3_8_27b(repo_root):
    status, output = _node(repo_root, NODE_LOCAL_FAMILY)
    assert status == 0, output


def test_agent_models_jsonc_provides_a_local_primary_with_measured_context(repo_root):
    status, output = _node(repo_root, NODE_LOCAL_PRIMARY)
    assert status == 0, output


def test_orchestrator_may_not_dispatch_gemma_via_a_wildcard_t002298(repo_root):
    status, output = _node(repo_root, NODE_NO_WILDCARD)
    assert status == 0, output


def test_t016419_dead_checkpoint_catalog_entries_are_removed(repo_root):
    status, output = _node(repo_root, NODE_DEAD_ENTRIES)
    assert status == 0, output


def test_t900348_t900365_catalog_context_matches_c_and_port_of_the_llama_cpp_unit(repo_root):
    unit = repo_root / "scripts" / "llm" / "qwen38-gsq-iq3xxs.service"
    text = unit.read_text(encoding="utf-8")

    def _second_fields(pattern):
        values = []
        for line in text.splitlines():
            for match in re.finditer(pattern, line):
                values.append(match.group(0).split()[1])
        return values

    context_values = _second_fields(r"-c [0-9]+")
    assert context_values, "grep -oE '-c [0-9]+' liefert nichts"
    assert "\n".join(context_values) == "153600"
    port_values = _second_fields(r"--port [0-9]+")
    assert "\n".join(port_values) == "1919"
    status, output = _node(repo_root, NODE_CONTEXT_VALUE)
    assert output == "153600", output


def test_t900051_freetoken_smoke_test_verifies_version_model_kv_and_concurrency(repo_root):
    smoke = repo_root / ".opencode" / "skills" / "freetoken-setup" / "scripts" / "smoke-test.sh"
    status, output = _merged(["bash", "-n", str(smoke)], repo_root)
    assert status == 0, output
    text = smoke.read_text(encoding="utf-8")
    for needle in ("engine version:", "model mismatch:", "usable KV capacity:", "--max-running-requests 1"):
        assert needle in text, f"fehlt in smoke-test.sh: {needle}"


def test_t014105_opencode_sync_agents_sh_distributes_plugins_to_the_global_config(repo_root):
    text = (repo_root / "scripts" / "opencode-sync-agents.sh").read_text(encoding="utf-8")
    assert re.search("plugin", text) is not None
