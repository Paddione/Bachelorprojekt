"""Native migration of tests/spec/local-llm-proxy/bge-no-probe-import.bats."""

PROBE_JS = """
    import { readFileSync, existsSync } from 'node:fs';
    import { dirname, resolve } from 'node:path';

    const visited = new Set();
    const targetFile = resolve('{root}/scripts/llm-proxy/bge-routes.mjs');
    const discoveryFile = resolve('{root}/scripts/llm-proxy/discovery.mjs');

    function checkImports(file) {
      if (visited.has(file)) return;
      visited.add(file);
      if (file === discoveryFile) {
        console.error('FAIL: discovery.mjs is imported in the bge-routes dependency graph!');
        process.exit(1);
      }
      if (!existsSync(file)) return;
      const content = readFileSync(file, 'utf8');
      const importRegex = /(?:import|from)\\s+['\\"](\\.[^'\\"]+)['\\"]/g;
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        const depPath = resolve(dirname(file), match[1]);
        const candidates = [depPath, depPath + '.mjs', depPath + '.js'];
        for (const c of candidates) {
          if (existsSync(c)) {
            checkImports(c);
            break;
          }
        }
      }
    }

    checkImports(targetFile);
    console.log('no probe import OK');
"""


def test_bge_no_probe_import_bge_routes_mjs_importiert_discovery_mjs_weder_direkt_noch_transitiv(run_cmd, repo_root):
    js = PROBE_JS.replace("{root}", str(repo_root))
    res = run_cmd(["node", "--input-type=module", "-e", js], cwd=repo_root)
    assert res.returncode == 0, res.output
    assert "no probe import OK" in res.output
