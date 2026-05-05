<script lang="ts">
  import TestRunner from './TestRunner.svelte';
  import PlaywrightPanel from './PlaywrightPanel.svelte';
</script>

<div class="space-y-6">
  <div>
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Unit &amp; Integration Tests</p>
    <TestRunner />
  </div>
  <div>
    <p class="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">E2E Tests (Playwright)</p>
    <PlaywrightPanel />
  </div>
</div>
