<script lang="ts">
  export let grafanaUrl: string;

  // Stable Grafana UIDs provisioned by the centralized-logging change (PR #1913).
  const dashboards = [
    {
      uid: 'log-explorer',
      title: 'Log Explorer',
      code: 'CHAN-01 // VECTOR-LOKI',
      description: 'Live-Logs aller Pods — nach App, Namespace und Log-Level filtern.',
    },
    {
      uid: 'api-errors',
      title: 'API Error Tracker',
      code: 'CHAN-02 // INGRESS-5XX',
      description: 'Top-10 fehlschlagende Endpunkte + Request-ID-Suche.',
    },
    {
      uid: 'traefik-access',
      title: 'Traefik Access Analytics',
      code: 'CHAN-03 // TRAEFIK-BUS',
      description: 'HTTP-Status-Verteilung, langsame Endpunkte, 4xx/5xx-Rate.',
    },
  ];
</script>

<div class="observability-chassis">
  <div class="chassis-header">
    <div class="header-title-block">
      <div class="header-tag-row">
        <span class="header-tag">PANEL 05 // OBSERVABILITY & TELEMETRY</span>
        <h3 class="chassis-title">Grafana Observability Kanäle</h3>
      </div>
      <span class="header-sub">ZENTRALE METRIK- UND LOG-AGGREGATION · OTEL / LOKI / PROMETHEUS GAUGE</span>
    </div>

    <div class="stream-beacon">
      <span class="beacon-light"></span>
      <span class="beacon-label">GRAFANA BUS: {grafanaUrl.replace(/^https?:\/\//, '')}</span>
    </div>
  </div>

  <div class="scope-grid">
    {#each dashboards as d}
      <a
        class="scope-cassette"
        href={`${grafanaUrl}/d/${d.uid}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <div class="cassette-top">
          <div class="cassette-beam">
            <span class="beam-glow"></span>
            <span class="beam-code">{d.code}</span>
          </div>
          <span class="cassette-cta">LAUNCH ↗</span>
        </div>

        <div class="cassette-body">
          <span class="cassette-title">{d.title}</span>
          <p class="cassette-desc">{d.description}</p>
        </div>

        <!-- Scope Signal Oscilloscope Line -->
        <div class="scope-footer">
          <div class="scope-track">
            <span class="scope-wave"></span>
          </div>
          <span class="scope-status">ACTIVE TELEMETRY</span>
        </div>
      </a>
    {/each}
  </div>
</div>

<style>
  .observability-chassis {
    background: #0E131B;
    border: 1px solid #1E2634;
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 20px;
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    color: #E6EDF3;
  }

  .chassis-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #1E2634;
    padding-bottom: 16px;
    gap: 16px;
    flex-wrap: wrap;
  }

  .header-title-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .header-tag-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-tag {
    font-size: 10px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.1em;
  }

  .chassis-title {
    font-size: 16px;
    font-weight: 700;
    color: #F0F6FC;
    margin: 0;
  }

  .header-sub {
    font-size: 10px;
    color: #8B949E;
    letter-spacing: 0.05em;
  }

  .stream-beacon {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #111722;
    border: 1px solid #232D3F;
    border-radius: 6px;
    padding: 6px 10px;
  }

  .beacon-light {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #3FB950;
    box-shadow: 0 0 6px #3FB950;
  }

  .beacon-label {
    font-size: 9.5px;
    font-weight: 600;
    color: #8B949E;
  }

  .scope-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }

  @media (max-width: 900px) {
    .scope-grid {
      grid-template-columns: 1fr;
    }
  }

  .scope-cassette {
    background: #111722;
    border: 1px solid #1F293D;
    border-radius: 8px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-decoration: none;
    transition: all 0.15s ease;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .scope-cassette:hover {
    border-color: #58A6FF;
    background: #151D2A;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  }

  .cassette-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cassette-beam {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .beam-glow {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #58A6FF;
    box-shadow: 0 0 6px #58A6FF;
  }

  .beam-code {
    font-size: 9px;
    font-weight: 700;
    color: #58A6FF;
    letter-spacing: 0.08em;
  }

  .cassette-cta {
    font-size: 9.5px;
    font-weight: 700;
    color: #58A6FF;
    border: 1px solid rgba(88, 166, 255, 0.3);
    padding: 2px 6px;
    border-radius: 4px;
    transition: all 0.15s ease;
  }

  .scope-cassette:hover .cassette-cta {
    background: rgba(88, 166, 255, 0.15);
    border-color: #58A6FF;
  }

  .cassette-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .cassette-title {
    font-size: 13px;
    font-weight: 700;
    color: #F0F6FC;
  }

  .cassette-desc {
    font-size: 11px;
    color: #8B949E;
    line-height: 1.4;
    margin: 0;
  }

  .scope-footer {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: 8px;
  }

  .scope-track {
    height: 2px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 1px;
    position: relative;
    overflow: hidden;
  }

  .scope-wave {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 30%;
    background: #58A6FF;
    box-shadow: 0 0 6px #58A6FF;
    animation: sweep 2s infinite ease-in-out;
  }

  .scope-status {
    font-size: 8.5px;
    font-weight: 600;
    color: #3FB950;
    letter-spacing: 0.06em;
  }

  @keyframes sweep {
    0% { left: -30%; }
    50% { left: 100%; }
    100% { left: -30%; }
  }
</style>

