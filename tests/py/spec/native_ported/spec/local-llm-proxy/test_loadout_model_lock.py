"""Native migration of tests/spec/local-llm-proxy/loadout-model-lock.bats."""

# [T900885]

def test_shipped_loadouts_carry_no_factory_block(run_cmd, repo_root):
    js = (
        "import{readLoadouts}from'./scripts/llm-proxy/loadouts.mjs';\n"
        "const{doc}=readLoadouts();\n"
        "if(doc.factory!=null){console.log('factory-still-present');process.exit(1)}\n"
        "console.log('factory-absent-ok')\n"
    )
    res = run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "factory-absent-ok" in res.output
