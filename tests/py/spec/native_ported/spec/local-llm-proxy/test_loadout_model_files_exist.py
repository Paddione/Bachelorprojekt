"""Native migration of tests/spec/local-llm-proxy/loadout-model-files-exist.bats."""

# [T002753]

import pytest

ROOTS_JS = """
    import { readFileSync, existsSync } from 'node:fs';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    const resolved = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    console.log(resolved.every(existsSync) ? 'yes' : 'no');
"""

RESOLVE_ALL_JS = """
    import { resolveModelPath } from 'REPO/scripts/llm-proxy/models.mjs';
    import { readFileSync } from 'node:fs';
    const doc = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    for (const l of doc.loadouts) {
      if (l.managed === 'external' || l.enabled === false) continue;
      console.log(l.slug + ' ' + (resolveModelPath(doc, l) ? 'OK' : 'MISSING'));
    }
"""

FAKE_JS = """
    import { resolveModelPath } from 'REPO/scripts/llm-proxy/models.mjs';
    import { readFileSync } from 'node:fs';
    const doc = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    const fake = { slug: 'gibt-es-nicht', model: 'nirgends/kein-modell-T002753.gguf' };
    console.log(resolveModelPath(doc, fake) === null ? 'MISSING' : 'OK');
"""


def _subst(js, repo_root):
    return js.replace("REPO", str(repo_root)).replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json"))


def test_loadout_model_files_exist_t002753_jedes_loadout_loest_seine_modelldatei_auf(run_cmd, repo_root):
    roots = run_cmd(["node", "--input-type=module", "-e", _subst(ROOTS_JS, repo_root)], cwd=repo_root)
    if roots.stdout.strip() != "yes":
        pytest.skip("modelRoots im Testumfeld unvollstaendig (z. B. CI-Job als anderer Benutzer: '~' zeigt woandershin)")

    res = run_cmd(["node", "--input-type=module", "-e", _subst(RESOLVE_ALL_JS, repo_root)], cwd=repo_root)
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    ok_count = sum(1 for l in lines if l.endswith(" OK"))
    if ok_count == 0:
        pytest.skip("keine Modelldateien im Testumfeld vorhanden (Runner ohne GGUF-Gewichte)")
    assert ok_count >= 1

    missing = [l.split(" ")[0] for l in lines if l.split(" ")[-1] == "MISSING"]
    print(f"Loadouts ohne Modelldatei: {' '.join(missing) or '<keine>'}")
    assert "bge-rerank-cpu OK" in lines
    assert not missing


def test_loadout_model_files_exist_t002753_die_aufloesung_erkennt_eine_fehlende_datei_ueberhaupt(run_cmd, repo_root):
    res = run_cmd(["node", "--input-type=module", "-e", _subst(FAKE_JS, repo_root)], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert res.output == "MISSING"
