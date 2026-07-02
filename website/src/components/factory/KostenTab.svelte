<script lang="ts">
  import FactoryObservability from './FactoryObservability.svelte';
  import FactoryBudgetPage from './FactoryBudgetPage.svelte';
</script>

<div class="kosten-tab">
  <FactoryObservability />
  <FactoryBudgetPage />
</div>

<style>
  .kosten-tab { display: flex; flex-direction: column; gap: var(--space-6); }
</style>
