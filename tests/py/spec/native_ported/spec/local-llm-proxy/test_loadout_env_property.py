"""Native migration of tests/spec/local-llm-proxy/loadout-env-property.bats."""

# [T002538]

import json


def _node(run_cmd, repo_root, js, *argv):
    return run_cmd(["node", "--input-type=module", "-e", js, *argv], cwd=repo_root)


def _start_cmd(run_cmd, repo_root, slug):
    js = f"""
    import {{ readFileSync }} from 'node:fs';
    const {{ buildStartCommand }} = await import('file://{repo_root}/scripts/llm-proxy/runner.mjs');
    const d = JSON.parse(readFileSync('{repo_root}/scripts/llm/loadouts.json', 'utf8'));
    const l = d.loadouts.find((x) => x.slug === '{slug}');
    if (!l) {{ console.error('slug nicht gefunden'); process.exit(1); }}
    console.log(buildStartCommand(l, '/m.gguf', d.defaults, '/bin/llama-server').join('\\n'));
    """
    return _node(run_cmd, repo_root, js)


def _validate(run_cmd, repo_root, doc):
    js = f"""
    const {{ parseLoadouts }} = await import('file://{repo_root}/scripts/llm-proxy/loadouts.mjs');
    try {{ parseLoadouts(process.argv[1]); console.log('OK'); }}
    catch (e) {{ console.log(e.message); }}
    """
    res = _node(run_cmd, repo_root, js, doc)
    return res.output


def _doc_with_env(env_json: str) -> str:
    return (
        '{"version":1,"modelRoots":["~/m"],"defaults":{"host":"127.0.0.1"},"loadouts":[\n'
        ' {"slug":"t","label":"t","model":"a.gguf","port":9999,\n'
        f'  "fit":{{"enabled":false}},"args":{{"ctx":8192,"ngl":0}},"env":{env_json}}}]}}\n'
    )


def _start_cmd_doc(run_cmd, repo_root, loadout_js: str):
    js = f"""
    const {{ buildStartCommand }} = await import('file://{repo_root}/scripts/llm-proxy/runner.mjs');
    const l = {loadout_js};
    console.log(buildStartCommand(l, '/m.gguf', {{ host: '127.0.0.1' }}, '/bin/llama-server').join('\\n'));
    """
    return _node(run_cmd, repo_root, js)


ENV_LOADOUT = (
    '{"slug":"t","label":"t","model":"a.gguf","port":9999,"fit":{"enabled":false},'
    '"args":{"ctx":8192,"ngl":0},"env":{"CUDA_VISIBLE_DEVICES":""}}'
)


def test_loadout_env_property_env_mit_leerem_wert_wird_akzeptiert(run_cmd, repo_root):
    assert _validate(run_cmd, repo_root, _doc_with_env('{"CUDA_VISIBLE_DEVICES":""}')) == "OK"


def test_loadout_env_property_env_mit_ungueltigem_variablennamen_wird_abgelehnt(run_cmd, repo_root):
    assert _validate(run_cmd, repo_root, _doc_with_env('{"GUELTIG_1":"x"}')) == "OK"
    out = _validate(run_cmd, repo_root, _doc_with_env('{"NICHT GUELTIG":"x"}'))
    assert out != "OK"
    assert "env-Name" in out


def test_loadout_env_property_env_mit_nicht_string_wert_wird_abgelehnt(run_cmd, repo_root):
    assert _validate(run_cmd, repo_root, _doc_with_env('{"A":"ok"}')) == "OK"
    assert _validate(run_cmd, repo_root, _doc_with_env('{"A":1}')) != "OK"


def test_loadout_env_property_env_als_array_wird_abgelehnt(run_cmd, repo_root):
    assert _validate(run_cmd, repo_root, _doc_with_env('["A=1"]')) != "OK"


def test_loadout_env_property_env_mit_cuda_visible_devices_erzeugt_die_systemd_property(run_cmd, repo_root):
    res = _start_cmd_doc(run_cmd, repo_root, ENV_LOADOUT)
    assert res.returncode == 0, res.output
    assert "--property=Environment=CUDA_VISIBLE_DEVICES=" in res.output.splitlines()


def test_loadout_env_property_die_environment_property_steht_vor_dem_trenner(run_cmd, repo_root):
    res = _start_cmd_doc(run_cmd, repo_root, ENV_LOADOUT)
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    env_idx = [i for i, l in enumerate(lines, 1) if l == "--property=Environment=CUDA_VISIBLE_DEVICES="]
    sep_idx = [i for i, l in enumerate(lines, 1) if l == "--"]
    assert env_idx and sep_idx
    assert env_idx[0] < sep_idx[0]


def test_loadout_env_property_ein_loadout_ohne_env_erzeugt_keine_environment_property(run_cmd, repo_root):
    res = _start_cmd(run_cmd, repo_root, "gemma26-factory")
    assert res.returncode == 0, res.output
    assert "--property=Restart=on-failure" in res.output.splitlines()
    n = sum(1 for l in res.output.splitlines() if "--property=Environment=" in l)
    assert n == 0
