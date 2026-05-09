<script lang="ts">
  import { onMount } from 'svelte';

  type CertResult = { notAfter: string | null; daysLeft: number | null; error?: string };
  type CertsData = { results: Record<string, CertResult>; checkedAt: string };

  let certsData: CertsData | null = null;
  let certsLoading = true;
  let certsError: string | null = null;

  let pinCluster = 'mentolder';
  let pinLoading = false;
  let pinResults: string[] = [];
  let pinError: string | null = null;

  const CLUSTER_LABELS: Record<string, string> = { mentolder: 'mentolder.de', korczewski: 'korczewski.de' };

  async function loadCerts() {
    certsLoading = true; certsError = null;
    try {
      const res = await fetch('/api/admin/ops/certs');
      if (res.ok) { certsData = await res.json(); }
      else { const j = await res.json().catch(() => ({})); certsError = j.error ?? `Fehler ${res.status}`; }
    } catch (e) { certsError = (e as Error).message; }
    finally { certsLoading = false; }
  }

  async function pinDns() {
    pinLoading = true; pinError = null; pinResults = [];
    try {
      const res = await fetch('/api/admin/ops/dns/pin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster: pinCluster }),
      });
      const j = await res.json();
      if (!res.ok) { pinError = j.error ?? 'Fehler'; return; }
      pinResults = j.results;
    } catch { pinError = 'Netzwerkfehler'; }
    finally { pinLoading = false; }
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

  <!-- DNS Pinning -->
  <div>
    <h3 class="text-sm font-semibold text-gray-200 mb-3">📌 LiveKit DNS-Pinning</h3>
    <p class="text-xs text-gray-400 mb-4">
      Setzt <code>livekit.*</code> und <code>stream.*</code> DNS-Einträge auf die Pin-Node-IP (mentolder: 46.225.125.59, korczewski: 37.27.251.38).
      Nötig nach Node-Wechsel oder IP-Änderung.
    </p>
    <div class="flex flex-wrap gap-3 items-end">
      <div>
        <label class="text-xs text-gray-400 block mb-1">Cluster</label>
        <select bind:value={pinCluster}
          class="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white">
          <option value="mentolder">mentolder.de</option>
          <option value="korczewski">korczewski.de</option>
        </select>
      </div>
      <button on:click={pinDns} disabled={pinLoading}
        class="px-3 py-1.5 text-sm bg-orange-700 hover:bg-orange-600 disabled:opacity-50 text-white rounded">
        {pinLoading ? '…' : '📌 DNS jetzt pinnen'}
      </button>
    </div>
    {#if pinError}<p class="text-red-400 text-sm mt-3">{pinError}</p>{/if}
    {#if pinResults.length > 0}
      <div class="mt-3 bg-gray-900 border border-gray-700 rounded p-3 font-mono text-xs space-y-1">
        {#each pinResults as line}<div class="text-green-300">{line}</div>{/each}
      </div>
    {/if}
  </div>

</div>
