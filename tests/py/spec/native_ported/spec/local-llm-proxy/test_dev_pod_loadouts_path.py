"""Native migration of tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats."""

import json


def test_dev_pod_loadouts_path_1_1_readloadouts_succeeds_when_cwd_is_outside_the_repo_root(run_cmd, repo_root, tmp_path):
    js = f"""
    import('{repo_root}/scripts/llm-proxy/loadouts.mjs').then(m => {{
      const {{ doc }} = m.readLoadouts();
      if (!doc || typeof doc.roles !== 'object') process.exit(1);
      console.log('OK');
    }}).catch(err => {{
      console.error(err.message);
      process.exit(2);
    }});
    """
    res = run_cmd(["node", "-e", js], cwd=tmp_path)
    assert res.returncode == 0, res.output
    assert res.output == "OK"


def test_dev_pod_loadouts_path_1_2_resolvedefaultloadoutspath_respects_loadouts_path_env_var(run_cmd, repo_root, tmp_path):
    custom = tmp_path / "custom-loadouts.json"
    custom.write_text(
        '{"version":1,"modelRoots":[],"loadouts":[],"roles":{"embed":{"chain":["http://127.0.0.1:8080"]}}}',
        encoding="utf-8",
    )
    js = f"""
    import('{repo_root}/scripts/llm-proxy/loadouts.mjs').then(m => {{
      const p = m.resolveDefaultLoadoutsPath ? m.resolveDefaultLoadoutsPath() : m.DEFAULT_PATH;
      if (p !== process.env.LOADOUTS_PATH) {{
        console.error('mismatch: ' + p);
        process.exit(1);
      }}
      const {{ doc }} = m.readLoadouts();
      if (doc?.roles?.embed?.chain?.[0] !== 'http://127.0.0.1:8080') process.exit(2);
      console.log('OK');
    }}).catch(err => {{
      console.error(err.message);
      process.exit(3);
    }});
    """
    res = run_cmd(["node", "-e", js], cwd=tmp_path, env={"LOADOUTS_PATH": str(custom)})
    assert res.returncode == 0, res.output
    assert res.output == "OK"


def test_dev_pod_loadouts_path_1_3_supervisor_sh_passes_loadouts_path_to_llm_proxy(repo_root):
    import re

    text = (repo_root / "docker/mcp-node/supervisor.sh").read_text(encoding="utf-8", errors="replace")
    assert any(re.search(r"LOADOUTS_PATH=.*loadouts\.json", line) for line in text.splitlines())
