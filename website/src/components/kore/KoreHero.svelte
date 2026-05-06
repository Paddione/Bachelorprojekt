<script lang="ts">
  import { onMount } from 'svelte';

  type Stats = { nodes: number; pods: number; brands: number };
  let stats: Stats | null = null;
  let pollInterval: number | undefined;
  let loggedIn = $state(false);

  async function fetchStats() {
    try {
      const r = await fetch('/api/cluster/status', { signal: AbortSignal.timeout(3000) });
      if (r.ok) stats = await r.json();
    } catch {
      // silent fallback
    }
  }

  onMount(() => {
    fetchStats();
    pollInterval = window.setInterval(fetchStats, 30_000);
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => { if (d.authenticated) loggedIn = true; })
      .catch(() => {});
    return () => clearInterval(pollInterval);
  });
</script>

<section class="w-hero">
  <span class="w-ticker" role="status" aria-live="polite">
    <span class="dot"></span>
    {#if stats}
      <b>{stats.nodes}</b>&nbsp;Nodes online ·
      <span style="color:var(--mute)">{stats.brands} Brands · {stats.pods} Pods</span>
    {:else}
      <b>verfügbar</b>&nbsp;<span style="color:var(--mute)">Q3 2026</span>
    {/if}
  </span>

  <span class="eyebrow no-rule">[ JETZT IN BETRIEB ]</span>
  <h1>Self-hosted, <em class="em">vor Ihren Augen.</em></h1>
  <p class="lede">
    Diese Seite läuft auf einem 12-Node-Kubernetes-Cluster, den ich selbst gebaut, deploye und betreibe.
    Alles, was Sie hier sehen — Auth, Dateien, Office, KI, Whiteboard, Stream, Buchung, Abrechnung — ist
    Open-Source, DSGVO-konform und auf einem einzigen Cluster zu Hause. <em class="em">Das hier ist die Demo.</em>
  </p>

  <div class="cta-row">
    {#if loggedIn}
      <a class="btn primary" href="/portal">Portal →</a>
    {:else}
      <a class="btn primary" href="/api/auth/login?returnTo=/portal">Anmelden →</a>
    {/if}
    <a class="btn ghost" href="#timeline">Notizen lesen</a>
  </div>

  <div class="meta-row">
    <div>
      <div class="lab">Studium</div>
      <div class="v">B.Sc.<span class="u">IT-Sec</span></div>
      <div class="s">Penetration · Krypto · Architektur</div>
    </div>
    <div>
      <div class="lab">Im Feld</div>
      <div class="v">10<span class="u">+ Jahre</span></div>
      <div class="s">IT-Management · Server · Netze</div>
    </div>
    <div>
      <div class="lab">KI in Produktion</div>
      <div class="v"><em class="em">seit Tag 1</em></div>
      <div class="s">Claude · Cursor · lokale Modelle</div>
    </div>
    <div>
      <div class="lab">Cluster</div>
      <div class="v">12<span class="u">Nodes</span></div>
      <div class="s">k3s · ArgoCD · Multi-Tenant</div>
    </div>
  </div>
</section>
