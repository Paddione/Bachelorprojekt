<script lang="ts">
  export let trackingUrl: string = '';
</script>

<div class="space-y-4">
  {#if trackingUrl}
    <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span class="text-sm font-semibold text-gray-200">Anforderungs-Tracking (Bachelorprojekt)</span>
        <a href={trackingUrl} target="_blank" rel="noopener noreferrer"
           class="text-xs text-blue-400 hover:text-blue-300">↗ Öffnen</a>
      </div>
      <iframe
        src={trackingUrl}
        title="Bachelorprojekt Tracking"
        class="w-full border-0"
        style="height: 600px;"
        sandbox="allow-same-origin allow-scripts allow-forms"
      ></iframe>
    </div>
  {:else}
    <div class="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
      <p class="text-sm text-gray-400 mb-2">Tracking-URL nicht konfiguriert.</p>
      <p class="text-xs text-gray-500">Setze <code class="font-mono bg-gray-900 px-1 rounded">TRACKING_EXTERNAL_URL</code> in der Umgebungskonfiguration.</p>
      <p class="text-xs text-gray-500 mt-1">Dev-Default: <code class="font-mono bg-gray-900 px-1 rounded">http://tracking.localhost</code></p>
    </div>
  {/if}
</div>
