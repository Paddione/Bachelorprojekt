"""Native migration of tests/spec/local-llm-proxy/loadout-aux-files-exist.bats."""

import pytest

RESOLVE_AUX_JS = """
    import { readFileSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    const roots = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    const resolve = (rel) => roots.map(r => join(r, rel)).find(existsSync) ?? null;
    for (const l of doc.loadouts) {
      if (l.managed === 'external') continue;
      const aux = [
        ['mmprojPath', l.args?.mmprojPath],
        ['draftModelPath', l.speculative?.draftModelPath],
      ];
      for (const [field, rel] of aux) {
        if (!rel) continue;
        console.log(`${l.slug} ${field} ${resolve(rel) ? 'OK' : 'MISSING'}`);
      }
    }
"""

SANITY_JS = """
    import { readFileSync, existsSync } from 'node:fs';
    import { join } from 'node:path';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    const roots = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    const resolve = (rel) => roots.map(r => join(r, rel)).find(existsSync) ?? null;
    console.log(resolve('nirgends/kein-projektor-T002886.gguf') === null ? 'MISSING' : 'OK');
    const anyRoot = roots.some(existsSync);
    console.log(anyRoot ? (resolve('.') ? 'OK' : 'BROKEN') : 'NO_ROOT');
"""

ROOTS_JS = """
    import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
    import { join } from 'node:path';
    import os from 'node:os';
    const doc = JSON.parse(readFileSync('LOADOUTS', 'utf8'));
    const hasGguf = (dir, depth = 2) => {
      let entries;
      try { entries = readdirSync(dir); } catch { return false; }
      for (const e of entries) {
        if (e.toLowerCase().endsWith('.gguf')) return true;
        if (depth > 0) {
          const p = join(dir, e);
          let st; try { st = statSync(p); } catch { continue; }
          if (st.isDirectory() && hasGguf(p, depth - 1)) return true;
        }
      }
      return false;
    };
    const resolved = doc.modelRoots.map(r => r.replace(/^~/, os.homedir()));
    const complete = resolved.every(existsSync);
    console.log(complete && resolved.some(r => hasGguf(r)) ? 'yes' : 'no');
"""


def _node(run_cmd, repo_root, js):
    return run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)


def test_loadout_aux_files_exist_t002886_die_nebendatei_aufloesung_erkennt_eine_fehlende_datei_ueberhaupt(run_cmd, repo_root):
    res = _node(run_cmd, repo_root, SANITY_JS.replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json")))
    assert res.returncode == 0, res.output
    lines = res.output.splitlines()
    neg = lines[0] if len(lines) > 0 else ""
    pos = lines[1] if len(lines) > 1 else ""
    assert neg == "MISSING"
    assert pos in ("OK", "NO_ROOT"), f"positiv-fall: {pos}"


def test_loadout_aux_files_exist_t002886_jede_deklarierte_mmproj_draft_datei_loest_auf(run_cmd, repo_root):
    res = _node(run_cmd, repo_root, RESOLVE_AUX_JS.replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json")))
    assert res.returncode == 0, res.output
    if not res.output.strip():
        return  # kein Loadout deklariert Nebendateien: gueltiger Zustand
    roots = _node(run_cmd, repo_root, ROOTS_JS.replace("LOADOUTS", str(repo_root / "scripts/llm/loadouts.json")))
    if roots.stdout.strip() != "yes":
        pytest.skip("modelRoots im Testumfeld unvollstaendig oder ohne GGUF-Dateien (z. B. CI-Job als anderer Benutzer: '~' zeigt woandershin)")
    missing = [
        f"{p[0]} ({p[1]})"
        for p in (l.split() for l in res.output.splitlines())
        if len(p) >= 3 and p[2] == "MISSING"
    ]
    print(f"Nebendateien ohne Datei: {' '.join(missing) or '<keine>'}")
    assert not missing
