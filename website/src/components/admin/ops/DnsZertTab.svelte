<script lang="ts">
  import { onMount } from 'svelte';

  type CertResult = { notAfter: string | null; daysLeft: number | null; error?: string };
  type CertsData = { results: Record<string, CertResult>; checkedAt: string };

  let certsData: CertsData | null = null;
  let certsLoading = true;
  let certsError: string | null = null;

  const CLUSTER_LABELS: Record<string, string> = { mentolder: 'mentolder.de', korczewski: 'korczewski.de' };

  async function loadCerts() {
    certsLoading = true; certsError = null;
    try {
      const res = await fetch('/sdlc/api/ops/certs');
      if (res.ok) { certsData = await res.json(); }
      else { const j = await res.json().catch(() => ({})); certsError = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { certsError = (e as Error).message; }
    finally { certsLoading = false; }
  }

  function certStatusCls(days: number | null) {
    if (days === null) return 'bg-gray-700 text-gray-400';
    if (days < 10) return 'bg-red-900/40 text-red-300';
    if (days < 30) return 'bg-yellow-900/40 text-yellow-300';
    return 'bg-green-900/40 text-green-300';
  }

  onMount(loadCerts);
</script>

<div class="space-y-8">

  <!-- Zertifikate -->
  <div>
    <div class="flex justify-between items-center mb-3">
      <h3 class="text-sm font-semibold text-gray-200">🔐 Wildcard-Zertifikate</h3>
      <button on:click={loadCerts} disabled={certsLoading}
        class="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded">
        {certsLoading ? 'Prüfe…' : '↻ Prüfen'}
      </button>
    </div>
    {#if certsError}<p class="text-red-400 text-sm">{certsError}</p>{/if}
    {#if certsData}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {#each Object.entries(certsData.results) as [cluster, cert]}
          <div class="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <div class="text-sm font-medium text-gray-200 mb-2">{CLUSTER_LABELS[cluster] ?? cluster}</div>
            {#if cert.error}
              <p class="text-red-400 text-xs">{cert.error}</p>
            {:else}
              <div class="px-3 py-2 rounded {certStatusCls(cert.daysLeft)}">
                {#if cert.daysLeft !== null}
                  <span class="text-sm font-semibold">Noch {cert.daysLeft} Tage gültig</span>
                {/if}
                <div class="text-xs mt-1 opacity-80">
                  Läuft ab: {cert.notAfter ? new Date(cert.notAfter).toLocaleDateString('de-DE') : '–'}
                </div>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
