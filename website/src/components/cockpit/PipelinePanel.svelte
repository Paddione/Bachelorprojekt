<!--
  PipelinePanel.svelte — Schlanker Rahmen um DevStatusTabs im SDLC Cockpit (T002531).
  WICHTIG (E22): Dieser Rahmen trägt BEWUSST KEIN `data-panel-type`-Attribut.
  .lavish/kit/panel.js adoptiert beim DOMContentLoaded alle [data-panel-type]-Elemente und
  räumt bei refresh() den Body leer. Eine Svelte-Insel darin würde ausgeräumt werden.
  Dieses Panel nutzt ausschließlich die geteilte CSS-Schicht (panel.css), nicht die JS-Laufzeit.
  Layout-Engine aus K3 (T002462): ist auf main gelandet (2026-08-02).
-->
<script lang="ts">
  import DevStatusTabs from '../DevStatusTabs.svelte';

  export let initial: any = null;
  export let initialTab: string = 'factory';
  export let brand: string = 'mentolder';
</script>

<section class="panel panel--card" id="panel-pipeline" data-cockpit-panel="pipeline">
  <div class="panel__head">
    <span class="panel__title">Pipeline</span>
  </div>
  <div class="panel__body">
    <DevStatusTabs {initial} {initialTab} {brand} />
  </div>
</section>
