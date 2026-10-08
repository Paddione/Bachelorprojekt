"""Native migration of tests/spec/llm-local-dev/opencode-compaction.bats."""
import re
import shutil

import pytest

JSON5_PROBE = "try{require('json5')}catch(e){process.exit(77)}"

JS_SUBAGENTS = """
    const j5 = require('json5'), fs = require('fs');
    const dcp = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/dcp.jsonc', 'utf8'));
    console.log(String(dcp.experimental && dcp.experimental.allowSubAgents));
  """

JS_TRIGGER = """
    const j5 = require('json5'), fs = require('fs');
    const oc = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/opencode.jsonc', 'utf8'));
    const am = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/agent-models.jsonc', 'utf8'));
    const [prov, id] = oc.model.split('/');
    const lim = am.provider[prov].models[id].limit;
    // Prompt loop (session/overflow.ts): buffer is mapped to reserved, but only
    // honoured when limit.input is set — otherwise context − output.
    const v1 = lim.input ? lim.input - oc.compaction.buffer : lim.context - lim.output;
    const v2 = lim.context - Math.max(lim.output, oc.compaction.buffer);
    console.log(v1 + ' ' + v2);
  """

JS_DCP_LIMITS = """
    const j5 = require('json5'), fs = require('fs');
    const oc = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/opencode.jsonc', 'utf8'));
    const am = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/agent-models.jsonc', 'utf8'));
    const dcp = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/dcp.jsonc', 'utf8')).compress;
    const [prov, id] = oc.model.split('/');
    const lim = am.provider[prov].models[id].limit;
    const res = (v) => typeof v === 'string' ? Math.round(parseFloat(v) / 100 * lim.context) : v;
    const min = res(dcp.modelMinLimits[oc.model]), max = res(dcp.modelMaxLimits[oc.model]);
    const trig = Math.min(lim.input ? lim.input - oc.compaction.buffer : lim.context - lim.output,
                          lim.context - Math.max(lim.output, oc.compaction.buffer));
    console.log(min + ' ' + max + ' ' + (min < max && max < trig));
  """

JS_REVIEWER = """
    const j5 = require('json5'), fs = require('fs');
    const d = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/agent-models.jsonc', 'utf8'));
    const agents = d.agent || {};
    const bad = Object.keys(agents).filter((k) => {
      const n = String(agents[k].description || agents[k].note || '').toLowerCase();
      const p = agents[k].permission || {};
      return n.includes('reviewer') && (p.edit === 'allow' || p.write === 'allow' || p.bash === 'allow');
    });
    if (bad.length) { console.error('reviewer-role agents with write: ' + bad.join(',')); process.exit(1); }
  """


@pytest.fixture
def compaction_file(repo_root):
    path = repo_root / ".opencode" / "opencode.jsonc"
    return path.read_text(encoding="utf-8")


def _require_json5(run_cmd, repo_root):
    if not shutil.which("node"):
        pytest.skip("node not installed")
    probe = run_cmd(["node", "-e", JSON5_PROBE], cwd=repo_root)
    if probe.returncode != 0:
        pytest.skip("json5 not resolvable")


def _node(run_cmd, repo_root, script):
    return run_cmd(["node", "-e", script], cwd=repo_root, env={"REPO": str(repo_root)})


def test_compaction_block_auto_true(compaction_file):
    assert '"auto": true' in compaction_file


def test_compaction_block_keep_tokens_16000(compaction_file):
    assert '"keep": { "tokens": 16000 }' in compaction_file


def test_compaction_block_buffer_33600(compaction_file):
    assert '"buffer": 33600' in compaction_file


def test_compaction_block_no_v1_reserved_key(compaction_file):
    assert '"compaction":' in compaction_file
    assert '"reserved":' not in compaction_file


def test_compaction_block_no_v1_preserve_recent_tokens_key(compaction_file):
    assert '"compaction":' in compaction_file
    assert '"preserve_recent_tokens":' not in compaction_file


def test_compaction_block_threshold_math_comment(compaction_file):
    assert "153600 − max(8192, 33600) = 120000" in compaction_file
    assert "153600 − 33600 = 120000" in compaction_file


def test_dcp_allowsubagents_true_so_subagents_get_nudges_t900362(run_cmd, repo_root):
    _require_json5(run_cmd, repo_root)
    result = _node(run_cmd, repo_root, JS_SUBAGENTS)
    result.check()
    assert result.output == "true"


def test_compaction_trigger_for_the_default_model_is_120000_on_v1_and_v2_t900350_t900362_t900365(run_cmd, repo_root):
    _require_json5(run_cmd, repo_root)
    result = _node(run_cmd, repo_root, JS_TRIGGER)
    result.check()
    assert result.output == "120000 120000"


def test_dcp_local_limits_resolve_below_the_default_models_compaction_trigger_t900350_t900365(run_cmd, repo_root):
    _require_json5(run_cmd, repo_root)
    result = _node(run_cmd, repo_root, JS_DCP_LIMITS)
    result.check()
    assert result.output == "61440 107520 true"


def test_reviewer_role_edit_and_bash_denied_in_the_runtimes_mirror(repo_root):
    text = (repo_root / "docs" / "agent-guide" / "registry" / "agents.yaml").read_text(encoding="utf-8")
    # T900399: der zuvor gespiegelte Rollen-Block entfaellt mit dem
    # Factory-Subsystem; reviewer lebt jetzt nur noch unter runtimes:.
    assert "runtimes:" in text
    # Negativ-Guard: der entfallene Block darf nicht mehr vorkommen.
    assert "factory_roles:" not in text
    lines = text.splitlines()
    runtimes_idx = next(i for i, line in enumerate(lines) if line.startswith("runtimes:"))
    rest = lines[runtimes_idx:]
    reviewer_idx = next(i for i, line in enumerate(rest) if line.startswith("  reviewer:"))
    reviewer_block = "\n".join(rest[reviewer_idx:])
    assert "write_capable: false" in reviewer_block
    assert re.search(r"no edit/write/bash/task dispatch", reviewer_block, re.IGNORECASE)


def test_reviewer_role_no_per_agent_write_allow_skip_guarded(run_cmd, repo_root):
    if not shutil.which("node"):
        pytest.skip("json5 not resolvable - mirror test above is authoritative")
    probe = run_cmd(["node", "-e", JSON5_PROBE], cwd=repo_root)
    if probe.returncode != 0:
        pytest.skip("json5 not resolvable - mirror test above is authoritative")
    result = _node(run_cmd, repo_root, JS_REVIEWER)
    assert result.returncode == 0, result.output


def test_agents_md_line_count_advisory_check_160(repo_root):
    agents = repo_root / "AGENTS.md"
    lines = agents.read_text(encoding="utf-8").count("\n")
    if lines > 160:
        print(f"# ADVISORY: AGENTS.md line count is {lines} (advisory target: <= 160)")
    assert agents.stat().st_size > 0
