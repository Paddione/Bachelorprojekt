"""Native migration of tests/spec/local-llm-proxy/bge-cpu-parallel-start.bats."""

def test_bge_cpu_parallel_start_loadouts_die_bge_cpu_loadouts_belegen_weiterhin_verschiedene_ports(run_cmd, repo_root):
    js = f"""
    import {{ parseLoadouts, findLoadout }} from '{repo_root}/scripts/llm-proxy/loadouts.mjs';
    import {{ readFileSync }} from 'node:fs';
    const doc = parseLoadouts(readFileSync('{repo_root}/scripts/llm/loadouts.json', 'utf8'));
    const a = findLoadout(doc, 'bge-embed-cpu')?.port;
    const b = findLoadout(doc, 'bge-rerank-cpu')?.port;
    console.log(Number.isInteger(a) && Number.isInteger(b) && a !== b ? 'DISTINCT' : `BAD:${{a}}/${{b}}`);
    """
    res = run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)
    assert res.returncode == 0
    assert res.output == "DISTINCT"
