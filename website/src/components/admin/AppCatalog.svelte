<script lang="ts">
  interface AppManifest {
    name: string;
    title: string;
    description: string;
    kustomize: string;
    domains: { key: string; host: string }[];
    oidc: { client_id: string; redirect_uris: string[] } | null;
    secrets: string[];
    requires: string[];
    resources: { cpu: string; memory: string } | null;
  }

  export let apps: AppManifest[] = [];
  export let installedApps: string[] = [];
  export let env: string;
  export let brandId: string;

  let selectedApp: AppManifest | null = null;
  let showModal = false;

  function openDetails(app: AppManifest) {
    selectedApp = app;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    selectedApp = null;
  }

  function getInstallCommand(appName: string): string {
    if (env === 'dev') {
      return `task app:install -- ${appName}`;
    }
    return `task app:install -- ${appName} ENV=${env}`;
  }

  function handleCopyCommand(appName: string) {
    const cmd = getInstallCommand(appName);
    navigator.clipboard.writeText(cmd);
    alert('Befehl in Zwischenablage kopiert!');
  }
</script>

<div class="p-6 max-w-7xl mx-auto text-light">
  <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
    <div>
      <h1 class="text-3xl font-bold tracking-tight text-gold">App-Katalog</h1>
      <p class="text-muted text-sm mt-1">Kuratierte Plattform-Dienste verwalten und deployen (Umgebung: <span class="font-mono text-light">{env}</span>)</p>
    </div>
  </div>

  {#if apps.length === 0}
    <div class="bg-dark-light border border-dark-lighter rounded-2xl p-12 text-center text-muted">
      Keine Apps im Katalog gefunden.
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each apps as app}
        {@const isInstalled = installedApps.includes(app.name)}
        <div class="bg-dark-light border border-dark-lighter rounded-2xl p-6 hover:border-gold/30 transition-all duration-300 flex flex-col justify-between h-full group relative overflow-hidden">
          <div>
            <div class="flex items-start justify-between gap-3 mb-4">
              <h3 class="text-xl font-bold text-light group-hover:text-gold transition-colors">{app.title}</h3>
              <span class="px-2.5 py-1 text-xs font-semibold rounded-full border {isInstalled ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' : 'bg-zinc-800/40 border-zinc-700 text-zinc-400'}">
                {isInstalled ? 'Installiert' : 'Verfügbar'}
              </span>
            </div>

            <p class="text-muted text-sm mb-6 line-clamp-3 leading-relaxed">{app.description}</p>

            <div class="space-y-3 mb-6">
              {#if app.resources}
                <div class="flex items-center text-xs text-muted gap-2">
                  <span class="font-semibold text-zinc-500">Ressourcen:</span>
                  <span class="font-mono bg-zinc-800/40 px-1.5 py-0.5 rounded text-zinc-300">CPU: {app.resources.cpu}</span>
                  <span class="font-mono bg-zinc-800/40 px-1.5 py-0.5 rounded text-zinc-300">RAM: {app.resources.memory}</span>
                </div>
              {/if}

              {#if app.domains.length > 0}
                <div class="flex flex-col text-xs text-muted gap-1">
                  <span class="font-semibold text-zinc-500">Domains:</span>
                  {#each app.domains as domain}
                    <code class="font-mono text-zinc-300 bg-zinc-800/30 px-2 py-0.5 rounded break-all truncate max-w-full" title={domain.host}>
                      {domain.host}
                    </code>
                  {/each}
                </div>
              {/if}
            </div>
          </div>

          <div class="mt-auto pt-4 border-t border-dark-lighter flex items-center justify-between gap-3">
            <button 
              on:click={() => openDetails(app)}
              class="flex-1 text-center py-2 px-4 rounded-xl border border-zinc-700 hover:border-gold/50 text-sm font-semibold transition-colors bg-zinc-800/20"
            >
              Details anzeigen
            </button>
            <button 
              on:click={() => handleCopyCommand(app.name)}
              class="py-2 px-3 rounded-xl border border-gold/40 hover:bg-gold hover:text-dark text-gold text-sm transition-colors"
              title="Kopiere Installationsbefehl"
            >
              📋 Install-Befehl
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if showModal && selectedApp}
  <div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="bg-dark-light border border-dark-lighter rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
      <div class="px-6 py-4 border-b border-dark-lighter flex items-center justify-between">
        <h2 class="text-xl font-bold text-gold">{selectedApp.title} — Installationsanleitung</h2>
        <button on:click={closeModal} class="text-muted hover:text-light text-2xl font-bold outline-none">&times;</button>
      </div>

      <div class="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
        <div>
          <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Beschreibung</h4>
          <p class="text-sm text-zinc-300 leading-relaxed">{selectedApp.description}</p>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Dienst-Referenz</h4>
            <span class="font-mono text-xs bg-zinc-950 px-2 py-1 rounded text-zinc-300 break-all">{selectedApp.kustomize}</span>
          </div>
          {#if selectedApp.requires.length > 0}
            <div>
              <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Abhängigkeiten</h4>
              <div class="flex flex-wrap gap-1">
                {#each selectedApp.requires as req}
                  <span class="font-mono text-xs bg-zinc-950 px-2 py-1 rounded text-zinc-300">{req}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        {#if selectedApp.domains.length > 0}
          <div>
            <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Domains</h4>
            <div class="space-y-1">
              {#each selectedApp.domains as d}
                <div class="flex items-center justify-between text-xs bg-zinc-950 px-3 py-2 rounded">
                  <span class="font-mono text-zinc-400">{d.key}</span>
                  <span class="font-mono text-gold">{d.host}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if selectedApp.oidc}
          <div>
            <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">OIDC SSO Konfiguration</h4>
            <div class="space-y-2 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80 text-xs">
              <div class="flex justify-between">
                <span class="text-zinc-500">Client-ID:</span>
                <span class="font-mono text-zinc-300">{selectedApp.oidc.client_id}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-zinc-500">Client-Secret Key:</span>
                <span class="font-mono text-zinc-300">{selectedApp.oidc.client_id.toUpperCase().replace(/-/g, '_')}_OIDC_SECRET</span>
              </div>
              <div>
                <span class="text-zinc-500 block mb-1">Redirect URIs:</span>
                {#each selectedApp.oidc.redirect_uris as uri}
                  <code class="block font-mono text-zinc-400 bg-zinc-950 px-2 py-1 rounded mt-1 break-all">{uri}</code>
                {/each}
              </div>
            </div>
          </div>
        {/if}

        {#if selectedApp.secrets.length > 0}
          <div>
            <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold mb-2">Erforderliche Secrets</h4>
            <div class="flex flex-wrap gap-2">
              {#each selectedApp.secrets as secret}
                <span class="font-mono text-xs bg-zinc-950 px-2.5 py-1 rounded text-zinc-300 border border-zinc-800">{secret}</span>
              {/each}
            </div>
          </div>
        {/if}

        <div class="bg-zinc-950 p-4 rounded-xl border border-zinc-800">
          <div class="flex items-center justify-between mb-2">
            <h4 class="text-xs uppercase tracking-wider text-zinc-500 font-bold">Installations-Befehl</h4>
            <button 
              on:click={() => handleCopyCommand(selectedApp.name)} 
              class="text-xs text-gold hover:underline font-semibold"
            >
              Kopieren
            </button>
          </div>
          <pre class="text-xs font-mono text-zinc-300 overflow-x-auto p-1 selection:bg-gold/30">{getInstallCommand(selectedApp.name)}</pre>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-dark-lighter flex justify-end gap-3 bg-zinc-950/10">
        <button 
          on:click={closeModal} 
          class="px-5 py-2.5 rounded-xl border border-zinc-700 hover:border-zinc-500 text-sm font-semibold transition-colors"
        >
          Schließen
        </button>
        <button 
          on:click={() => { handleCopyCommand(selectedApp.name); closeModal(); }}
          class="px-5 py-2.5 rounded-xl bg-gold hover:bg-gold-light text-dark text-sm font-semibold transition-colors shadow-lg"
        >
          Befehl kopieren & Schließen
        </button>
      </div>
    </div>
  </div>
{/if}
