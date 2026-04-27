<script lang="ts">
  import { onMount } from 'svelte';

  let lastReport: { createdAt: string } | null = null;
  let hasReport = false;
  let copied = false;

  const webhookToken = '(aus MONITORING_WEBHOOK_TOKEN — admin kennt den Wert)';

  const claudePrompt = `Run the Playwright e2e tests in tests/e2e/ against the prod cluster.
After the run completes, read the HTML report from tests/e2e/playwright-report/index.html
and POST it to /api/admin/tests/playwright-report with:
  Authorization: Bearer <MONITORING_WEBHOOK_TOKEN>
  Content-Type: text/html`;

  async function checkReport() {
    try {
      const res = await fetch('/api/admin/tests/playwright-report', { method: 'HEAD' }).catch(() => null);
      if (res && res.ok) {
        hasReport = true;
        // Get timestamp from a separate metadata endpoint if available,
        // or just mark as present
      }
    } catch { /* no report yet */ }
  }

  function copyPrompt() {
    navigator.clipboard.writeText(claudePrompt);
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  onMount(checkReport);
</script>

<div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
  <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-700">
    <span class="text-sm font-semibold text-gray-200">Playwright E2E</span>
    {#if lastReport}
      <span class="text-xs text-gray-400">Letzter Bericht: {new Date(lastReport.createdAt).toLocaleString('de-DE')}</span>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      <span class="text-xs text-gray-400">via Claude starten →</span>
      <button on:click={copyPrompt}
        class="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 rounded">
        {copied ? '✓ Kopiert' : 'Prompt kopieren'}
      </button>
    </div>
  </div>

  <div class="p-4">
    {#if hasReport}
      <iframe
        src="/api/admin/tests/playwright-report"
        title="Playwright Report"
        class="w-full border border-gray-700 rounded"
        style="height: 500px;"
        sandbox="allow-same-origin allow-scripts"
      ></iframe>
    {:else}
      <div class="flex flex-col gap-4">
        <p class="text-sm text-gray-400">Noch kein Bericht vorhanden. Kopiere den Prompt und füge ihn in Claude Code ein.</p>
        <div class="bg-gray-900 border border-gray-700 rounded p-3">
          <div class="text-xs text-gray-500 mb-2">Claude-Prompt</div>
          <pre class="text-xs text-blue-300 font-mono whitespace-pre-wrap leading-relaxed">{claudePrompt}</pre>
        </div>
      </div>
    {/if}
  </div>
</div>
