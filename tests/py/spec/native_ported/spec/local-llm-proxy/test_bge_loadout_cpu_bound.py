"""Native migration of tests/spec/local-llm-proxy/bge-loadout-cpu-bound.bats."""

PARSE = """
    import { parseLoadouts, findLoadout } from '{root}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('{root}/scripts/llm/loadouts.json', 'utf8'));
"""

SLUGS_JS = """
    import { parseLoadouts } from '{root}/scripts/llm-proxy/loadouts.mjs';
    import { readFileSync } from 'node:fs';
    const doc = parseLoadouts(readFileSync('{root}/scripts/llm/loadouts.json', 'utf8'));
    for (const l of doc.loadouts) {
      if (/bge|embed|rerank/i.test(l.slug) || /bge/i.test(l.model)) console.log(l.slug);
    }
"""


def _node(run_cmd, root, js):
    return run_cmd(["node", "--input-type=module", "-e", js], cwd=root)


def _slugs(run_cmd, root):
    res = _node(run_cmd, root, SLUGS_JS.replace("{root}", str(root)))
    assert res.returncode == 0, res.output
    return [s for s in res.stdout.split() if s]


def _parsed(root, body):
    return PARSE.replace("{root}", str(root)) + body


def test_bge_loadout_cpu_bound_es_gibt_ueberhaupt_bge_loadouts(run_cmd, repo_root):
    res = _node(run_cmd, repo_root, _parsed(repo_root, "    console.log(String(doc.loadouts.length));\n"))
    assert res.returncode == 0, res.output
    assert int(res.output) > 0

    res = run_cmd(["node", "--input-type=module", "-e", SLUGS_JS.replace("{root}", str(repo_root))], cwd=repo_root)
    assert res.returncode == 0, res.output
    lines = res.stdout.splitlines()
    assert "bge-embed-cpu" in lines
    assert "bge-rerank-cpu" in lines


def test_bge_loadout_cpu_bound_jedes_bge_loadout_setzt_args_ngl_auf_0(run_cmd, repo_root):
    slugs = _slugs(run_cmd, repo_root)
    assert slugs, "no bge loadouts found"
    for slug in slugs:
        res = _node(run_cmd, repo_root, _parsed(repo_root, f"    console.log(JSON.stringify(findLoadout(doc, '{slug}').args?.ngl));\n"))
        assert res.returncode == 0, res.output
        assert res.output == "0", slug


def test_bge_loadout_cpu_bound_jedes_bge_loadout_blendet_die_gpu_zusaetzlich_per_cuda_visible_devices_aus(run_cmd, repo_root):
    slugs = _slugs(run_cmd, repo_root)
    assert slugs, "no bge loadouts found"
    for slug in slugs:
        res = _node(
            run_cmd,
            repo_root,
            _parsed(repo_root, f"    const l = findLoadout(doc, '{slug}');\n    console.log(JSON.stringify(l.env?.CUDA_VISIBLE_DEVICES));\n"),
        )
        assert res.returncode == 0, res.output
        assert res.output == '""', slug


def test_bge_loadout_cpu_bound_bge_loadouts_stehen_nicht_in_der_gpu_gruppe_der_chat_modelle(run_cmd, repo_root):
    res = _node(
        run_cmd,
        repo_root,
        _parsed(repo_root, "    console.log(findLoadout(doc, 'gptoss-context').exclusiveGroup ?? 'null');\n"),
    )
    assert res.returncode == 0, res.output
    assert res.output == "chat-gpu"

    slugs = _slugs(run_cmd, repo_root)
    assert slugs, "no bge loadouts found"
    for slug in slugs:
        res = _node(
            run_cmd,
            repo_root,
            _parsed(repo_root, f"    console.log(findLoadout(doc, '{slug}').exclusiveGroup ?? 'null');\n"),
        )
        assert res.returncode == 0, res.output
        assert res.output != "chat-gpu", slug


def test_bge_loadout_cpu_bound_die_datei_ist_nach_den_ergaenzungen_weiterhin_kanonisch_serialisiert(run_cmd, repo_root):
    res = run_cmd(
        ["node", str(repo_root / "scripts/llm/loadouts-format.mjs"), "--check", str(repo_root / "scripts/llm/loadouts.json")],
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
