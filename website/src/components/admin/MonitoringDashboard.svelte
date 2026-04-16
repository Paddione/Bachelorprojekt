<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Pod = {
    name: string;
    phase: string;
    ready: boolean;
    restarts: number;
    cpu?: string;
    memory?: string;
  };

  type Event = {
    type: string;
    reason: string;
    object: string;
    message: string;
    age: string;
  };

  type MonitoringData = {
    pods: Pod[];
    events: Event[];
    node?: { cpu: string; memory: string };
    metricsAvailable: boolean;
    fetchedAt: string;
  };

  let data: MonitoringData | null = null;
  let loading = true;
  let error: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  const fetchData = async () => {
    try {
      loading = true;
      error = null;
      const response = await fetch('/api/admin/monitoring');
      if (!response.ok) {
        throw new Error(`Failed to fetch monitoring data: ${response.status} ${response.statusText}`);
      }
      data = await response.json();
    } catch (err: any) {
      error = err.message;
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    fetchData();
    refreshInterval = setInterval(fetchData, 15000); // refresh every 15s
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });

  $: runningCount = data?.pods.filter(p => p.phase === 'Running' || p.ready).length || 0;
  $: failedCount = data?.pods.filter(p => p.phase === 'Failed' || p.phase === 'Unknown' || p.phase === 'CrashLoopBackOff').length || 0;
  $: restartingCount = data?.pods.filter(p => !p.ready && p.phase !== 'Failed' && p.phase !== 'Succeeded').length || 0;

  function getStatusColor(pod: Pod) {
    if (pod.phase === 'Failed' || pod.phase === 'CrashLoopBackOff' || pod.phase === 'Unknown') return 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400';
    if (!pod.ready || pod.phase === 'Pending' || pod.phase === 'ContainerCreating') return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400';
    return 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400';
  }
</script>

<div class="space-y-6">
  <!-- Top Bar -->
  <div class="flex justify-between items-center">
    <div class="text-sm text-gray-500 dark:text-gray-400">
      {#if data?.fetchedAt}
        Last updated: {new Date(data.fetchedAt).toLocaleTimeString()}
      {/if}
    </div>
    <div class="flex items-center space-x-4">
      {#if error}
        <span class="text-sm text-red-500">{error}</span>
      {/if}
      <button
        on:click={fetchData}
        disabled={loading}
        class="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        {#if loading}
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Refreshing...
        {:else}
          Refresh
        {/if}
      </button>
    </div>
  </div>

  {#if data}
    <!-- Summary Stats -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Running / Ready</h3>
        <p class="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{runningCount}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-yellow-500">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Pending / Restarting</h3>
        <p class="mt-1 text-2xl font-semibold text-yellow-600 dark:text-yellow-400">{restartingCount}</p>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-red-500">
        <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Failed / Unknown</h3>
        <p class="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">{failedCount}</p>
      </div>
      {#if data.metricsAvailable && data.node}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-blue-500">
          <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">Node Resources</h3>
          <p class="mt-1 text-sm text-gray-900 dark:text-white">CPU: {data.node.cpu}</p>
          <p class="text-sm text-gray-900 dark:text-white">Mem: {data.node.memory}</p>
        </div>
      {/if}
    </div>

    <!-- Pods List -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div class="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">Workloads</h3>
      </div>
      <ul class="divide-y divide-gray-200 dark:divide-gray-700 max-h-[500px] overflow-y-auto">
        {#each data.pods as pod}
          <li class="px-4 py-4 sm:px-6 border-l-4 {getStatusColor(pod)} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
            <div class="flex items-center justify-between">
              <div class="flex flex-col">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{pod.name}</p>
                <div class="mt-1 flex items-center space-x-2 text-xs">
                  <span>{pod.phase}</span>
                  {#if pod.restarts > 0}
                    <span class="text-yellow-600 dark:text-yellow-500">({pod.restarts} restarts)</span>
                  {/if}
                </div>
              </div>
              <div class="flex flex-col items-end text-sm text-gray-500 dark:text-gray-400">
                <p>CPU: {pod.cpu || '—'}</p>
                <p>Mem: {pod.memory || '—'}</p>
              </div>
            </div>
          </li>
        {/each}
        {#if data.pods.length === 0}
           <li class="px-4 py-4 text-sm text-gray-500 text-center">No pods found in workspace.</li>
        {/if}
      </ul>
    </div>

    <!-- Events List -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div class="px-4 py-5 sm:px-6 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-lg leading-6 font-medium text-gray-900 dark:text-white">Recent Events</h3>
      </div>
      <ul class="divide-y divide-gray-200 dark:divide-gray-700 max-h-[400px] overflow-y-auto">
        {#each data.events as event}
          <li class="px-4 py-4 sm:px-6">
            <div class="flex items-start space-x-3">
              <div class="flex-shrink-0 mt-0.5">
                {#if event.type === 'Warning'}
                  <svg class="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                  </svg>
                {:else}
                  <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                  </svg>
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white">
                  {event.reason} <span class="text-gray-500 font-normal">on {event.object}</span>
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                  {event.message}
                </p>
              </div>
              <div class="flex-shrink-0 text-xs text-gray-500">
                {event.age}
              </div>
            </div>
          </li>
        {/each}
        {#if data.events.length === 0}
          <li class="px-4 py-4 text-sm text-gray-500 text-center">No recent events.</li>
        {/if}
      </ul>
    </div>
  {:else if !loading && !error}
    <div class="text-center py-12 text-gray-500">
      No data available.
    </div>
  {/if}
</div>
