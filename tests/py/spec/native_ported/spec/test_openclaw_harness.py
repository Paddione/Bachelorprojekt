"""Native migration of tests/spec/openclaw-harness.bats."""

import os
import subprocess

import pytest

YAML_GET_JS = """const fs = require('node:fs');
const yaml = require(`${process.env.REPO_DIR}/node_modules/js-yaml`);
const d = yaml.load(fs.readFileSync(process.env.REG_YAML, 'utf8'));
const v = new Function('d', `return (${process.argv[2]});`)(d);
process.stdout.write(v === undefined ? 'undefined' : JSON.stringify(v));
"""


def _merged(args, cwd, env=None, stdin=None):
    """bats run equivalent: stdout and stderr merged, stdout exit status."""
    full = dict(os.environ)
    full.update(env or {})
    proc = subprocess.run(
        args, cwd=str(cwd), env=full, input=stdin,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300,
    )
    return proc.returncode, proc.stdout.strip()


@pytest.fixture
def yaml_get(repo_root):
    registry = repo_root / "docs" / "agent-guide" / "registry" / "capabilities.yaml"

    def _get(expr):
        return _merged(
            ["node", "-", expr],
            repo_root,
            env={"REPO_DIR": str(repo_root), "REG_YAML": str(registry)},
            stdin=YAML_GET_JS,
        )

    return _get


def test_registry_enthaelt_harnesses_openclaw_mit_rolle_openclaw_ops_und_user_scope_config(yaml_get):
    status, output = yaml_get("d.harnesses.openclaw.roles")
    assert status == 0
    assert output == '["openclaw-ops"]'
    status, output = yaml_get("d.harnesses.openclaw.config")
    assert status == 0
    assert output == '"~/.openclaw/openclaw.json"'


def test_schmaler_satz_k8s_lesen_task_runner_und_broker_tragen_openclaw_ops(yaml_get):
    for inst in ("mcp:mcp-kubernetes", "mcp:mcp-task-runner", "cli:openclaw-ask"):
        expr = (
            "(()=>{for(const [c,insts] of Object.entries(d.capabilities)){"
            f"if(insts['{inst}']&&Array.isArray(insts['{inst}'].roles))return insts['{inst}'].roles;"
            "}return null;})()"
        )
        status, output = yaml_get(expr)
        assert status == 0, output
        assert '"openclaw-ops"' in output, f"Rolle fehlt an {inst}: {output}"


def test_check_mjs_ist_gruen(repo_root, run_cmd):
    result = run_cmd(["node", str(repo_root / "scripts" / "toolset" / "check.mjs")])
    assert result.returncode == 0, result.output


def test_toolset_context_sh_openclaw_ops_enthaelt_k8s_lesen_und_broker_aber_keine_mutation(repo_root, run_cmd):
    result = run_cmd(["bash", str(repo_root / "scripts" / "toolset-context.sh"), "openclaw-ops"])
    assert result.returncode == 0, result.output
    assert "mcp:mcp-kubernetes" in result.output
    assert "cli:openclaw-ask" in result.output
    assert "mcp:mcp-task-runner" in result.output
    assert "kubernetes-mutation" not in result.output
    assert "cli:kubectl" not in result.output


def test_sync_harness_openclaw_dry_run_bleibt_offline_fehig(repo_root, run_cmd):
    result = run_cmd(["node", str(repo_root / "scripts" / "toolset" / "sync.mjs"), "--harness", "openclaw", "--dry-run"])
    assert result.returncode == 0, result.output
    assert "SKIP openclaw" in result.output


def test_adapter_modul_ist_registriert_und_kennt_das_user_scope_ziel(repo_root, run_cmd):
    adapters = repo_root / "scripts" / "toolset" / "lib" / "adapters" / "index.mjs"
    script = (
        f"import {{ ADAPTERS }} from '{adapters}'; "
        "if (!ADAPTERS.openclaw) throw new Error('openclaw adapter missing'); "
        "if (ADAPTERS.openclaw.file !== '~/.openclaw/openclaw.json') "
        "throw new Error('unexpected file: ' + ADAPTERS.openclaw.file); "
        "console.log('ok');"
    )
    result = run_cmd(["node", "--input-type=module", "-e", script], cwd=repo_root)
    assert result.returncode == 0, result.output
    assert result.output == "ok"
