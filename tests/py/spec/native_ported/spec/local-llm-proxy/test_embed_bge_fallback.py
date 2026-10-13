"""Native migration of tests/spec/local-llm-proxy/embed-bge-fallback.bats."""

JS = """
    process.env.LLM_EMBED_URL = 'http://127.0.0.1:1';

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('127.0.0.1:1')) {
        throw new Error('connect ECONNREFUSED (mocked bge failure)');
      }
      return originalFetch(url, opts);
    };

    const { embedAll } = await import('{lib}');
    try {
      await embedAll(['hallo welt']);
      console.error('UNEXPECTED_SUCCESS');
      process.exit(1);
    } catch (err) {
      // T016562: Voyage ist entfernt — totes bge muss fail-closed werfen,
      // nicht auf einen externen Anbieter ausweichen.
      if (/bge|ECONNREFUSED|LLM_EMBED_URL/.test(err.message)) {
        console.log('OK: fail-closed without voyage');
      } else {
        console.error('WRONG_ERROR', err.message);
        process.exit(1);
      }
    }
    """


def test_embed_bge_fallback_t016562_embedall_faellt_bei_unerreichbarem_bge_fail_closed_ohne_voyage(run_cmd, repo_root):
    lib = repo_root / "scripts/knowledge/lib-knowledge-pg.mjs"
    assert lib.is_file()
    res = run_cmd(
        ["node", "--input-type=module", "-e", JS.replace("{lib}", str(lib))],
        cwd=repo_root,
    )
    assert res.returncode == 0, res.output
    assert "OK: fail-closed without voyage" in res.output
