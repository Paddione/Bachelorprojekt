<script lang="ts">
  import TestRunner from './TestRunner.svelte';
  import PlaywrightPanel from './PlaywrightPanel.svelte';
  import TrendChart from './TrendChart.svelte';
  import FlakeMatrix from './FlakeMatrix.svelte';
  import TraceabilityMatrix from './TraceabilityMatrix.svelte';
</script>

<div class="space-y-5">
  <TrendChart />
  <FlakeMatrix />
  <TraceabilityMatrix />
  <TestRunner />
  <PlaywrightPanel />
</div>
