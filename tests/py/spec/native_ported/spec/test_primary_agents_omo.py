"""Native migration of tests/spec/primary-agents-omo.bats."""

import glob
from pathlib import Path

import pytest

def _node(run_cmd, repo_root: Path, script: str):
    """node -e <script> im Repo-Root (require() loest relativ zum cwd auf)."""
    return run_cmd(["node", "-e", script], cwd=str(repo_root))


@pytest.fixture
def omo(repo_root):
    """BATS setup: Pfade der Konfiguration, Agenten-Verzeichnis und Registry."""
    return {
        "models": repo_root / ".opencode" / "agent-models.jsonc",
        "agents": repo_root / ".claude" / "agents",
        "registry": repo_root / "docs" / "agent-guide" / "registry" / "agents.yaml",
        "repo": repo_root,
    }


def test_t900858_opencode_declares_bp_build_bp_run_bp_ship_as_primaries(run_cmd, omo):
    # Positiv-Anker: die Config muss parsebar sein, sonst waere "nicht deklariert" vakuos.
    script = f"""
    const d = require('json5').parse(require('fs').readFileSync('{omo["models"]}','utf8'));
    const a = d.agent || {{}};
    const expect = {{
      'bp-build': 'llamacpp-local/Qwen3.8-27B',
      'bp-run': 'llamacpp-local/Qwen3.8-27B',
      'bp-ship': 'opencode-go/muse-spark-1.3-contributor',
    }};
    for (const [name, model] of Object.entries(expect)) {{
      const v = a[name];
      if (!v) {{ console.error('primary ' + name + ' fehlt in agent-models.jsonc'); process.exit(1); }}
      if (v.mode !== 'primary') {{ console.error(name + ' mode ' + v.mode + ' != primary'); process.exit(1); }}
      if (v.model !== model) {{ console.error(name + ' model ' + v.model + ' != ' + model); process.exit(1); }}
    }}
    process.exit(0);
    """
    r = _node(run_cmd, omo["repo"], script)
    assert r.returncode == 0, r.output


def test_t900858_claude_agents_mirrors_the_bp_triple_with_tier_models(run_cmd, omo):
    # Positiv-Anker: das Agenten-Verzeichnis existiert und hat Eintraege.
    assert omo["agents"].is_dir()
    entries = [p for p in omo["agents"].iterdir()]
    assert len(entries) > 0
    script = f"""
    const fs = require('fs');
    const expect = {{ 'bp-build': 'opus', 'bp-run': 'sonnet', 'bp-ship': 'sonnet' }};
    for (const [name, model] of Object.entries(expect)) {{
      const p = '{omo["agents"]}/' + name + '.md';
      let s;
      try {{ s = fs.readFileSync(p, 'utf8'); }}
      catch (e) {{ console.error('mirror fehlt: ' + p); process.exit(1); }}
      if (!s.includes('name: ' + name)) {{ console.error(p + ': frontmatter name fehlt'); process.exit(1); }}
      if (!s.includes('model: ' + model)) {{ console.error(p + ': model ' + model + ' fehlt'); process.exit(1); }}
    }}
    process.exit(0);
    """
    r = _node(run_cmd, omo["repo"], script)
    assert r.returncode == 0, r.output


def test_t900858_no_bachelorprojekt_agent_file_remains(omo):
    assert glob.glob(str(omo["agents"] / "bachelorprojekt-*.md")) == []


def test_t900858_legacy_opencode_primaries_are_retired_from_agent_models_jsonc(run_cmd, omo):
    script = f"""
    const d = require('json5').parse(require('fs').readFileSync('{omo["models"]}','utf8'));
    const a = d.agent || {{}};
    for (const name of ['local', 'qwen35-4b', 'exe-muse', 'reviewer']) {{
      if (!(name in a)) {{ console.error('positive anchor failed: agent ' + name + ' fehlt'); process.exit(1); }}
    }}
    const retired = ['glimmer-primary', 'big-pickle', 'ox-alpha', 'ox-alpha-free'];
    const bad = retired.filter(k => k in a);
    if (bad.length) {{ console.error('retired primaries still declared: ' + bad.join(',')); process.exit(1); }}
    process.exit(0);
    """
    r = _node(run_cmd, omo["repo"], script)
    assert r.returncode == 0, r.output


def test_t900858_agents_yaml_registry_tracks_the_cutover_roles_runtimes(run_cmd, omo):
    script = f"""
    const y = require('yaml');
    const fs = require('fs');
    const d = y.parse(fs.readFileSync('{omo["registry"]}','utf8'));
    for (const name of ['bp-build', 'bp-run', 'bp-ship']) {{
      if (!d.roles || !(name in d.roles)) {{ console.error('role fehlt: ' + name); process.exit(1); }}
      if (!d.runtimes || !(name in d.runtimes)) {{ console.error('runtime fehlt: ' + name); process.exit(1); }}
    }}
    const retired = ['bachelorprojekt-ops', 'bachelorprojekt-db', 'bachelorprojekt-infra',
      'bachelorprojekt-test', 'bachelorprojekt-website', 'bachelorprojekt-security',
      'glimmer-primary', 'big-pickle', 'ox-alpha', 'ox-alpha-free'];
    const bad = retired.filter(k => (d.roles && k in d.roles) || (d.runtimes && k in d.runtimes));
    if (bad.length) {{ console.error('retired entries still in registry: ' + bad.join(',')); process.exit(1); }}
    process.exit(0);
    """
    r = _node(run_cmd, omo["repo"], script)
    assert r.returncode == 0, r.output
