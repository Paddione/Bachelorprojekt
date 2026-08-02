#!/usr/bin/env bats
# T002570 — embedAll() muss bge-m3 zuerst versuchen und bei Fehlschlag mit
# einer geloggten Warnung auf Voyage AI zurueckfallen. Vor dem Fix ging
# embedAll() ohne explizites model='bge-m3' sofort auf Voyage, ohne bge je
# zu versuchen und ohne Fallback-Warnung zu loggen — der Live-Beweis dafuer
# sind die wiederholt fehlgeschlagenen knowledge-ingest-bugs/-prs CronJobs.
#
# Pruefmodus: command output verification [T002448-M4]. Ein Node-Inline-
# Skript mockt fetch (bge unerreichbar, Voyage antwortet), ruft embedAll()
# echt auf und prueft Rueckgabewert UND Log-Ausgabe — kein Source-Grep.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  LIB="${REPO_ROOT}/scripts/knowledge/lib-knowledge-pg.mjs"
}

@test "T002570: embedAll() faellt bei unerreichbarem bge auf Voyage zurueck und loggt die Warnung" {
  [ -f "${LIB}" ]

  run node --input-type=module -e "
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

    const { embedAll } = await import('${LIB}');
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
  "
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"OK: fallback worked and was logged"* ]]
}
