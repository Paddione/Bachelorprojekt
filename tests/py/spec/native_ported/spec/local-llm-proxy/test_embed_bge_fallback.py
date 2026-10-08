"""Native migration of tests/spec/local-llm-proxy/embed-bge-fallback.bats."""

JS = """
    process.env.LLM_EMBED_URL = 'http://127.0.0.1:1';
    process.env.VOYAGE_API_KEY = 'fake-key-for-test';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('127.0.0.1:1')) {
        throw new Error('connect ECONNREFUSED (mocked bge failure)');
      }
      if (u.includes('voyageai.com')) {
        return {
          ok: true,
          json: async () => ({
            data: [{ embedding: Array(1024).fill(0.1) }],
            usage: { total_tokens: 3 },
          }),
        };
      }
      return originalFetch(url, opts);
    };

    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => { warnings.push(args.join(' ')); originalWarn(...args); };

    const { embedAll } = await import('{lib}');
    const result = await embedAll(['hallo welt']);

    if (!Array.isArray(result) || result.length !== 1 || result[0].length !== 1024) {
      console.error('UNEXPECTED_RESULT', JSON.stringify(result));
      process.exit(1);
    }
    const sawFallbackWarning = warnings.some(w => /bge/i.test(w) && /voyage/i.test(w));
    if (!sawFallbackWarning) {
      console.error('NO_FALLBACK_WARNING_LOGGED. warnings=' + JSON.stringify(warnings));
      process.exit(1);
    }
    console.log('OK: fallback worked and was logged');
"""


def test_embed_bge_fallback_t002570_embedall_faellt_bei_unerreichbarem_bge_auf_voyage_zurueck_und_loggt_die_warnung(run_cmd, repo_root):
    lib = repo_root / "scripts/knowledge/lib-knowledge-pg.mjs"
    assert lib.is_file()
    res = run_cmd(
        ["node", "--input-type=module", "-e", JS.replace("{lib}", str(lib))],
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
    assert "OK: fallback worked and was logged" in res.output
