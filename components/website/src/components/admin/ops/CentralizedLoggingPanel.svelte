<script lang="ts">
  export let grafanaUrl: string;

  // Stable Grafana UIDs provisioned by the centralized-logging change (PR #1913).
  const dashboards = [
    {
      uid: 'log-explorer',
      title: 'Log Explorer',
      description: 'Live-Logs aller Pods — nach App, Namespace und Level filtern.',
    },
    {
      uid: 'api-errors',
      title: 'API Error Tracker',
      description: 'Top-10 fehlschlagende Endpunkte + Request-ID-Suche.',
    },
    {
      uid: 'traefik-access',
      title: 'Traefik Access Analytics',
      description: 'HTTP-Status-Verteilung, langsame Endpunkte, 4xx/5xx-Rate.',
    },
  ];
</script>

<section class="panel">
  <header class="panel-head">
    <h3 class="panel-title">Grafana Dashboards</h3>
    <p class="panel-subtitle">Zentrale Observability-Infrastruktur</p>
  </header>

  <div class="grid">
    {#each dashboards as d}
      <a
        class="card"
        href={`${grafanaUrl}/d/${d.uid}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <span class="card-title">{d.title}</span>
        <span class="card-desc">{d.description}</span>
        <span class="card-cta">Öffnen →</span>
      </a>
    {/each}
  </div>
</section>

<style>
  .panel-title {
    font-weight: 700;
    color: var(--admin-text);
    margin: 0;
  }
  .panel-subtitle {
    color: var(--admin-text-mute);
    font-size: 0.8rem;
    margin: 0.25rem 0 0;
  }
  .panel-head {
    margin-bottom: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    border-radius: 16px;
    background: var(--admin-surface);
    border: 1px solid var(--admin-border);
    text-decoration: none;
    transition: border-color 0.2s ease;
  }
  .card:hover {
    border-color: var(--admin-border-bright);
  }
  .card-title {
    font-weight: 700;
    color: var(--admin-text);
  }
  .card-desc {
    font-size: 0.8rem;
    color: var(--admin-text-mute);
  }
  .card-cta {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--admin-accent);
  }
</style>
