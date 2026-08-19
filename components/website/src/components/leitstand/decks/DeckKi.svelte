<script lang="ts">
  import LlmProxyPanel from '../../sdlc/factory/LlmProxyPanel.svelte';
  import KiRoutingPanel from '../../sdlc/factory/KiRoutingPanel.svelte';
  import FactoryModelSlots from '../../sdlc/factory/FactoryModelSlots.svelte';
  import DispatchLogPanel from '../../cockpit/DispatchLogPanel.svelte';
  import InsightsTab from '../../sdlc/factory/InsightsTab.svelte';
  // E5 (T008017): Absorptionsmodul der aufgeloesten /sdlc/ki-konfiguration-
  // Seite. KiKonfiguration laedt sich vollstaendig selbst (E2-Muster,
  // /sdlc/api/ki/*-Endpunkte) — mountbar ohne Props.
  import KiKonfiguration from '../../admin/KiKonfiguration.svelte';
</script>

<!-- KI-Deck (T007957/E3, p2 Task 3): alle fuenf Karten laden sich selbst
     (Befund 1/2). DispatchLogPanel kommt OHNE initial-Prop -- sein eigener
     Default `[]` gilt, die Liste waechst per Adapter-Stream nach. E5:
     KiKonfiguration als sechstes, selbstladendes Modul. -->
<section class="deck-ki" data-testid="deck-panel-ki" data-purpose-id="deck-ki">
  <h3 class="deck-ki__sub">LLM-Proxy</h3>
  <LlmProxyPanel />
  <h3 class="deck-ki__sub">KI-Routing</h3>
  <KiRoutingPanel />
  <h3 class="deck-ki__sub">Modell-Slots</h3>
  <FactoryModelSlots />
  <h3 class="deck-ki__sub">Dispatch-Mitschnitt</h3>
  <DispatchLogPanel />
  <h3 class="deck-ki__sub">Insights</h3>
  <InsightsTab />
  <h3 class="deck-ki__sub">KI-Konfiguration</h3>
  <KiKonfiguration />
</section>

<style>
  .deck-ki {
    padding: var(--ls-space-6, 1.5rem);
    display: flex;
    flex-direction: column;
    gap: var(--ls-space-5, 12px);
  }

  .deck-ki__sub {
    margin: var(--ls-space-4, 8px) 0 0;
    font-family: var(--ls-font-mono, monospace);
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ls-text-muted, #707b8a);
  }
</style>
