<script lang="ts">
  type TestResult = { req: string; test: string; desc: string; status: 'pass' | 'fail' | 'skip'; duration_ms: number; detail?: string };
  type Summary = { total: number; pass: number; fail: number; skip: number };

  let tier: 'prod' | 'local' = 'prod';
  let filterInput = '';
  let running = false;
  let logLines: string[] = [];
  let results: TestResult[] = [];
  let summary: Summary | null = null;
  let currentTest = '';
  let durationMs = 0;
  let error: string | null = null;
  let eventSource: EventSource | null = null;
  let logEl: HTMLPreElement;

  async function startRun() {
    if (running) return;
    running = true;
    logLines = [];
    results = [];
    summary = null;
    error = null;
    currentTest = '';

    const testIds = filterInput
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch('/api/admin/tests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, testIds }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({ error: 'Fehler' }));
      error = json.error ?? `HTTP ${res.status}`;
      running = false;
      return;
    }

    const { jobId } = await res.json();
    const startTime = Date.now();

    eventSource = new EventSource(`/api/admin/tests/stream/${jobId}`);

    eventSource.addEventListener('log', (e) => {
      const { line } = JSON.parse(e.data);
      logLines = [...logLines, line];
      // Extract current test ID from log line e.g. "[SA-07]"
      const match = line.match(/\[([A-Z]+-\d+)\]/);
      if (match) currentTest = match[1];
      // Auto-scroll log
      setTimeout(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; }, 0);
    });

    eventSource.addEventListener('result', (e) => {
      results = [...results, JSON.parse(e.data)];
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      summary = data.summary;
      durationMs = data.durationMs ?? Date.now() - startTime;
      running = false;
      currentTest = '';
      eventSource?.close();
    });

    eventSource.onerror = () => {
      if (!running) return; // already done
      error = 'Verbindung unterbrochen';
      running = false;
      eventSource?.close();
    };
  }

  function statusIcon(status: TestResult['status']) {
    if (status === 'pass') return '✓';
    if (status === 'fail') return '✗';
    return '⊘';
  }

  function statusColor(status: TestResult['status']) {
    if (status === 'pass') return 'text-green-400';
    if (status === 'fail') return 'text-red-400';
    return 'text-gray-400';
  }

  function fmtDuration(ms: number) {
    const s = Math.floor(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
  }

  async function downloadResult(format: 'json' | 'md') {
    // We don't have jobId here — download latest from the server
    const res = await fetch(`/api/admin/tests/results/latest?format=${format}`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results.${format === 'md' ? 'md' : 'json'}`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
  <!-- Controls bar -->
  <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700 flex-wrap">
    <span class="text-sm font-semibold text-gray-200">Bash-Tests</span>

    <!-- Tier toggle -->
    <div class="flex border border-gray-600 rounded overflow-hidden text-xs">
      <button on:click={() => tier = 'prod'}
        class="px-3 py-1.5 {tier === 'prod' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}">
        prod
      </button>
      <button on:click={() => tier = 'local'}
        class="px-3 py-1.5 {tier === 'local' ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-400 hover:text-gray-200'}">
        local
      </button>
    </div>

    <input
      bind:value={filterInput}
      placeholder="FA-15 SA-07 … (leer = alle)"
      class="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs font-mono text-gray-200 w-48 focus:outline-none focus:border-blue-500"
    />

    <button on:click={startRun} disabled={running}
      class="ml-auto px-4 py-1.5 text-sm font-semibold bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded">
      {running ? '● läuft' : '▶ Starten'}
    </button>

    {#if running && currentTest}
      <span class="text-xs text-blue-400 font-mono animate-pulse">● {currentTest}</span>
    {/if}
  </div>

  {#if error}
    <div class="px-4 py-2 text-sm text-red-400 bg-red-900/20">{error}</div>
  {/if}

  <!-- Split panel -->
  <div class="grid grid-cols-2 min-h-[200px] max-h-[400px]">
    <!-- Left: log -->
    <div class="border-r border-gray-700 flex flex-col">
      <div class="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wide border-b border-gray-700/50">Ausgabe</div>
      <pre bind:this={logEl}
        class="flex-1 overflow-auto p-3 text-xs font-mono text-gray-300 leading-relaxed bg-gray-900/50 whitespace-pre-wrap"
      >{#each logLines as line}{line + '\n'}{/each}{#if running}<span class="animate-pulse text-gray-500">▌</span>{/if}</pre>
    </div>

    <!-- Right: results table -->
    <div class="flex flex-col">
      <div class="px-3 py-1.5 border-b border-gray-700/50 flex justify-between items-center">
        <span class="text-xs text-gray-500 uppercase tracking-wide">Ergebnis</span>
        {#if results.length > 0}
          <div class="flex gap-3 text-xs">
            <span class="text-green-400">✓ {results.filter(r => r.status === 'pass').length}</span>
            <span class="text-red-400">✗ {results.filter(r => r.status === 'fail').length}</span>
            <span class="text-gray-400">⊘ {results.filter(r => r.status === 'skip').length}</span>
          </div>
        {/if}
      </div>
      <div class="flex-1 overflow-auto bg-gray-900/50">
        {#each results as result}
          <div class="grid grid-cols-[55px_28px_1fr_55px] gap-1 px-2 py-1.5 border-b border-gray-700/30 text-xs items-center
            {result.status === 'fail' ? 'bg-red-900/10' : ''}">
            <span class="font-mono text-gray-400">{result.req}</span>
            <span class="text-gray-500">{result.test}</span>
            <span class="text-gray-300 truncate" title={result.detail || result.desc}>{result.desc}</span>
            <span class="text-right font-mono {statusColor(result.status)}">
              {statusIcon(result.status)} {result.duration_ms}ms
            </span>
          </div>
        {/each}
        {#if running && results.length === 0}
          <div class="p-3 text-xs text-gray-500 text-center">Wartet auf erste Ergebnisse…</div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Summary bar -->
  {#if summary}
    <div class="flex items-center gap-4 px-4 py-2.5 bg-gray-900/60 border-t border-gray-700 text-xs flex-wrap">
      <span class="text-green-400">✓ {summary.pass} bestanden</span>
      <span class="text-red-400">✗ {summary.fail} fehlgeschlagen</span>
      <span class="text-gray-400">⊘ {summary.skip} übersprungen</span>
      <span class="text-gray-500 ml-auto">Dauer: {fmtDuration(durationMs)}</span>
      <button on:click={() => downloadResult('json')} class="text-blue-400 hover:text-blue-300">↓ JSON</button>
      <button on:click={() => downloadResult('md')} class="text-blue-400 hover:text-blue-300">↓ Markdown</button>
    </div>
  {/if}
</div>
