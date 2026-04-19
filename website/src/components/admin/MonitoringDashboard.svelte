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

  type KubeEvent = {
    type: string;
    reason: string;
    object: string;
    message: string;
    age: string;
  };

  type MonitoringData = {
    pods: Pod[];
    events: KubeEvent[];
    node?: { cpu: string; memory: string };
    metricsAvailable: boolean;
    fetchedAt: string;
  };

  type Deployment = {
    name: string;
    desired: number;
    ready: number;
    available: number;
    status: 'healthy' | 'degraded' | 'stopped';
  };

  type DeploymentAction =
    | { type: 'restart'; deployment: Deployment }
    | { type: 'scale'; deployment: Deployment };

  let data: MonitoringData | null = null;
  let loading = true;
  let error: string | null = null;
  let refreshInterval: ReturnType<typeof setInterval>;

  let selectedEvent: KubeEvent | null = null;
  let modalDescription = '';
  let modalCategory = 'fehler';
  let modalLoading = false;
  let modalError: string | null = null;
  let modalSuccessId: string | null = null;
  let modalCloseTimer: ReturnType<typeof setTimeout> | null = null;

  let deployments: Deployment[] = [];
  let deploymentsLoading = true;
  let deploymentsError: string | null = null;
  let pendingAction: DeploymentAction | null = null;
  let scaleTarget = 1;
  let actionLoading = false;
  let actionError: string | null = null;

  function openModal(event: KubeEvent) {
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
    selectedEvent = event;
    modalDescription = `${event.reason} on ${event.object}: ${event.message}`;
    modalCategory = 'fehler';
    modalLoading = false;
    modalError = null;
    modalSuccessId = null;
  }

  function closeModal() {
    if (modalCloseTimer) { clearTimeout(modalCloseTimer); modalCloseTimer = null; }
    selectedEvent = null;
    modalSuccessId = null;
    modalError = null;
  }

  async function submitTicket() {
    if (!selectedEvent) return;
    modalLoading = true;
    modalError = null;
    try {
      const res = await fetch('/api/admin/bugs/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: modalDescription, category: modalCategory }),
      });
      const responseData = await res.json();
      if (!res.ok) {
        modalError = responseData.error ?? 'Unbekannter Fehler';
        return;
      }
      modalSuccessId = responseData.ticketId;
      modalCloseTimer = setTimeout(closeModal, 3000);
    } catch {
      modalError = 'Netzwerkfehler';
    } finally {
      modalLoading = false;
    }
  }

  const fetchData = async () => {
    try {
      loading = true;
      error = null;
      const [monRes, depRes] = await Promise.allSettled([
        fetch('/api/admin/monitoring'),
        fetch('/api/admin/deployments'),
      ]);

      if (monRes.status === 'fulfilled' && monRes.value.ok) {
        data = await monRes.value.json();
      } else if (monRes.status === 'rejected') {
        error = (monRes.reason as Error).message;
      } else {
        error = `Failed to fetch monitoring data: ${monRes.value.status} ${monRes.value.statusText}`;
      }

      if (depRes.status === 'fulfilled' && depRes.value.ok) {
        const json = await depRes.value.json();
        deployments = json.deployments ?? [];
        deploymentsError = null;
      } else {
        deploymentsError = 'Deployments konnten nicht geladen werden.';
      }
    } finally {
      loading = false;
      deploymentsLoading = false;
    }
  };

  function openAction(action: DeploymentAction) {
    pendingAction = action;
    scaleTarget = action.type === 'scale' ? action.deployment.desired : 1;
    actionLoading = false;
    actionError = null;
  }

  function closeAction() {
    pendingAction = null;
    actionError = null;
  }

  async function confirmAction() {
    if (!pendingAction) return;
    actionLoading = true;
    actionError = null;
    try {
      const { type, deployment } = pendingAction;
      const body = type === 'scale' ? JSON.stringify({ replicas: scaleTarget }) : '{}';
      const res = await fetch(`/api/admin/deployments/${deployment.name}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const json = await res.json();
      if (!res.ok) {
        actionError = json.error ?? 'Unbekannter Fehler';
        return;
      }
      closeAction();
      setTimeout(fetchData, 1000);
    } catch {
      actionError = 'Netzwerkfehler';
    } finally {
      actionLoading = false;
    }
  }

  function deploymentStatusClass(status: Deployment['status']): string {
    if (status === 'healthy') return 'bg-green-900/40 text-green-400';
    if (status === 'degraded') return 'bg-orange-900/40 text-orange-400';
    return 'bg-yellow-900/40 text-yellow-400';
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (pendingAction) closeAction();
      else if (selectedEvent) closeModal();
    }
  }

  onMount(() => {
    fetchData();
    refreshInterval = setInterval(fetchData, 15000);
    window.addEventListener('keydown', handleKeydown);
    return () => {
      window.removeEventListener('keydown', handleKeydown);
    };
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
    if (modalCloseTimer) clearTimeout(modalCloseTimer);
  });

  $: runningCount = data?.pods.filter(p => p.phase === 'Running' || p.ready).length || 0;
  $: failedCount = data?.pods.filter(p => p.phase === 'Failed' || p.phase === 'Unknown' || p.phase === 'CrashLoopBackOff').length || 0;
  $: restartingCount = data?.pods.filter(p => !p.ready && p.phase !== 'Failed' && p.phase !== 'Succeeded').length || 0;

  function focusTrap(node: HTMLElement) {
    const prev = document.activeElement as HTMLElement | null;
    node.focus();
    return { destroy() { prev?.focus(); } };
  }

  function getStatusColor(pod: Pod) {
    if (pod.phase === 'Failed' || pod.phase === 'CrashLoopBackOff' || pod.phase === 'Unknown') return 'border-red-500 bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400';
    if (!pod.ready || pod.phase === 'Pending' || pod.phase === 'ContainerCreating') return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/10 text-yellow-700 dark:text-yellow-400';
    return 'border-green-500 bg-green-50 dark:bg-green-900/10 text-green-700 dark:text-green-400';
  }

  function parsePercent(val: string): number {
    return Math.min(parseInt(val, 10) || 0, 100);
  }
</script>

<div class="space-y-6">
  <!-- Top Bar -->
  <div class="flex justify-between items-center">
    <div class="text-sm text-muted">
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
      <div class="bg-dark-light border border-dark-lighter rounded-lg shadow p-4 border-l-4 border-green-500">
        <h3 class="text-sm font-medium text-muted">Running / Ready</h3>
        <p class="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{runningCount}</p>
      </div>
      <div class="bg-dark-light border border-dark-lighter rounded-lg shadow p-4 border-l-4 border-yellow-500">
        <h3 class="text-sm font-medium text-muted">Pending / Restarting</h3>
        <p class="mt-1 text-2xl font-semibold text-yellow-600 dark:text-yellow-400">{restartingCount}</p>
      </div>
      <div class="bg-dark-light border border-dark-lighter rounded-lg shadow p-4 border-l-4 border-red-500">
        <h3 class="text-sm font-medium text-muted">Failed / Unknown</h3>
        <p class="mt-1 text-2xl font-semibold text-red-600 dark:text-red-400">{failedCount}</p>
      </div>
      {#if data.metricsAvailable && data.node}
        <div class="bg-dark-light border border-dark-lighter rounded-lg shadow p-4 border-l-4 border-blue-500">
          <h3 class="text-sm font-medium text-muted">Node Resources</h3>
          <div class="mt-2 space-y-2">
            <div>
              <div class="flex justify-between text-xs text-muted mb-1">
                <span>CPU</span><span>{data.node.cpu}</span>
              </div>
              <div class="w-full bg-dark-lighter rounded-full h-1.5">
                <div class="bg-blue-500 h-1.5 rounded-full" style="width: {parsePercent(data.node.cpu)}%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs text-muted mb-1">
                <span>Mem</span><span>{data.node.memory}</span>
              </div>
              <div class="w-full bg-dark-lighter rounded-full h-1.5">
                <div class="bg-purple-500 h-1.5 rounded-full" style="width: {parsePercent(data.node.memory)}%"></div>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Pods List -->
    <div class="bg-dark-light border border-dark-lighter rounded-lg shadow overflow-hidden">
      <div class="px-4 py-5 sm:px-6 border-b border-dark-lighter">
        <h3 class="text-lg leading-6 font-medium text-light">Workloads</h3>
      </div>
      <ul class="divide-y divide-dark-lighter max-h-[500px] overflow-y-auto">
        {#each data.pods as pod}
          <li class="px-4 py-4 sm:px-6 border-l-4 {getStatusColor(pod)} hover:bg-dark transition-colors">
            <div class="flex items-center justify-between">
              <div class="flex flex-col">
                <p class="text-sm font-medium text-light truncate">{pod.name}</p>
                <div class="mt-1 flex items-center space-x-2 text-xs">
                  <span>{pod.phase}</span>
                  {#if pod.restarts > 0}
                    <span class="text-yellow-600 dark:text-yellow-500">({pod.restarts} restarts)</span>
                  {/if}
                </div>
              </div>
              <div class="flex flex-col items-end text-sm text-muted">
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
    <div class="bg-dark-light border border-dark-lighter rounded-lg shadow overflow-hidden">
      <div class="px-4 py-5 sm:px-6 border-b border-dark-lighter">
        <h3 class="text-lg leading-6 font-medium text-light">Recent Events</h3>
      </div>
      <ul class="divide-y divide-dark-lighter max-h-[400px] overflow-y-auto">
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
                <p class="text-sm font-medium text-light">
                  {event.reason} <span class="text-gray-500 font-normal">on {event.object}</span>
                </p>
                <p class="text-sm text-muted truncate mt-1">
                  {event.message}
                </p>
              </div>
              <div class="flex-shrink-0 flex items-center gap-2 text-xs text-gray-500">
                <span>{event.age}</span>
                <button
                  on:click={() => openModal(event)}
                  title="Bug Ticket erstellen"
                  class="text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Bug Ticket erstellen"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                </button>
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

  <!-- Deployments Section -->
  <div class="bg-dark-light border border-dark-lighter rounded-lg shadow overflow-hidden">
    <div class="px-4 py-5 sm:px-6 border-b border-dark-lighter">
      <h3 class="text-lg leading-6 font-medium text-light">Deployments</h3>
    </div>
    {#if deploymentsLoading}
      <p class="px-4 py-4 text-sm text-gray-500 text-center">Loading…</p>
    {:else if deploymentsError}
      <p class="px-4 py-4 text-sm text-red-500">{deploymentsError}</p>
    {:else if deployments.length === 0}
      <p class="px-4 py-4 text-sm text-gray-500 text-center">No deployments found in workspace.</p>
    {:else}
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-dark-lighter text-xs text-muted text-left">
            <th class="px-4 py-3 font-medium">Name</th>
            <th class="px-3 py-3 font-medium">Ready</th>
            <th class="px-3 py-3 font-medium">Replicas</th>
            <th class="px-3 py-3 font-medium">Status</th>
            <th class="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-dark-lighter">
          {#each deployments as dep}
            <tr class="hover:bg-dark transition-colors">
              <td class="px-4 py-3 font-medium text-light">{dep.name}</td>
              <td class="px-3 py-3 {dep.desired === 0 ? 'text-gray-400' : dep.ready === dep.desired ? 'text-green-400' : 'text-orange-400'}">{dep.ready} / {dep.desired}</td>
              <td class="px-3 py-3 text-muted">{dep.desired}</td>
              <td class="px-3 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {deploymentStatusClass(dep.status)}">
                  {dep.status}
                </span>
              </td>
              <td class="px-4 py-3 text-right space-x-2">
                <button
                  on:click={() => openAction({ type: 'restart', deployment: dep })}
                  class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded border border-blue-700 text-blue-400 hover:bg-blue-900/30 transition-colors"
                >
                  ⟳ Restart
                </button>
                <button
                  on:click={() => openAction({ type: 'scale', deployment: dep })}
                  class="inline-flex items-center px-2.5 py-1 text-xs font-medium rounded border border-purple-700 text-purple-400 hover:bg-purple-900/30 transition-colors"
                >
                  ⇅ Scale
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

{#if selectedEvent}
  <!-- Modal backdrop -->
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    on:click|self={closeModal}
  >
    <div
      class="bg-dark-light border border-dark-lighter rounded-lg shadow-xl w-full max-w-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      use:focusTrap
      tabindex="-1"
    >
      <!-- Header -->
      <div class="px-6 py-4 border-b border-dark-lighter flex items-center justify-between">
        <h2 id="modal-title" class="text-lg font-semibold text-light">Bug Ticket erstellen</h2>
        <button on:click={closeModal} class="text-gray-400 hover:text-light transition-colors" aria-label="Schließen">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="px-6 py-4 space-y-4">
        <!-- Event summary -->
        <p class="text-xs text-muted font-mono bg-dark rounded px-3 py-2">
          {selectedEvent.type} · {selectedEvent.reason} · {selectedEvent.object}
        </p>

        {#if modalSuccessId}
          <div class="text-sm text-green-500 space-y-1">
            <p>Ticket erstellt: <strong>{modalSuccessId}</strong></p>
            <a href="/admin/bugs" class="underline hover:text-green-400">Zur Ticket-Übersicht →</a>
            <p class="text-xs text-muted">Schließt in 3 Sekunden…</p>
          </div>
        {:else}
          <!-- Description -->
          <div>
            <label for="modal-desc" class="block text-sm font-medium text-light mb-1">Beschreibung</label>
            <textarea
              id="modal-desc"
              bind:value={modalDescription}
              rows={4}
              maxlength={2000}
              class="w-full rounded-md border border-dark-lighter bg-dark text-light text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            ></textarea>
          </div>

          <!-- Category -->
          <div>
            <label for="modal-cat" class="block text-sm font-medium text-light mb-1">Kategorie</label>
            <select
              id="modal-cat"
              bind:value={modalCategory}
              class="w-full rounded-md border border-dark-lighter bg-dark text-light text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="fehler">Fehler</option>
              <option value="verbesserung">Verbesserung</option>
              <option value="erweiterungswunsch">Erweiterungswunsch</option>
            </select>
          </div>

          {#if modalError}
            <p class="text-sm text-red-500">{modalError}</p>
          {/if}
        {/if}
      </div>

      <!-- Footer -->
      {#if !modalSuccessId}
        <div class="px-6 py-4 border-t border-dark-lighter flex justify-end gap-3">
          <button
            on:click={closeModal}
            class="px-4 py-2 text-sm rounded-md border border-dark-lighter text-light hover:bg-dark transition-colors"
          >
            Abbrechen
          </button>
          <button
            on:click={submitTicket}
            disabled={modalLoading || !modalDescription.trim()}
            class="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors"
          >
            {modalLoading ? 'Erstelle…' : 'Erstellen'}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if pendingAction}
  <div
    class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
    on:click|self={closeAction}
    aria-hidden="true"
  >
    <div
      class="bg-dark-light border border-dark-lighter rounded-lg shadow-xl w-full max-w-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="action-modal-title"
      use:focusTrap
      tabindex="-1"
    >
      <div class="px-6 py-4 border-b border-dark-lighter flex items-center justify-between">
        <h2 id="action-modal-title" class="text-lg font-semibold text-light">
          {pendingAction.type === 'restart' ? 'Restart' : 'Scale'} Deployment
        </h2>
        <button on:click={closeAction} class="text-gray-400 hover:text-light transition-colors" aria-label="Schließen">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
          </svg>
        </button>
      </div>

      <div class="px-6 py-4 space-y-4">
        {#if pendingAction.type === 'restart'}
          <p class="text-sm text-light">
            Restart deployment <strong>{pendingAction.deployment.name}</strong>?
          </p>
          <p class="text-sm text-muted">
            This triggers a rolling restart. Pods are recreated one by one — existing connections may drop briefly.
          </p>
        {:else}
          <p class="text-sm text-light">
            Set replicas for <strong>{pendingAction.deployment.name}</strong>
            <span class="text-muted text-xs ml-1">(current: {pendingAction.deployment.desired})</span>
          </p>
          <div class="flex items-center gap-4">
            <button
              on:click={() => { if (scaleTarget > 0) scaleTarget -= 1; }}
              disabled={scaleTarget <= 0}
              class="w-8 h-8 rounded border border-dark-lighter text-light hover:bg-dark transition-colors text-lg flex items-center justify-center disabled:opacity-40"
            >−</button>
            <span class="text-light text-xl font-semibold w-8 text-center">{scaleTarget}</span>
            <button
              on:click={() => { if (scaleTarget < 10) scaleTarget += 1; }}
              disabled={scaleTarget >= 10}
              class="w-8 h-8 rounded border border-dark-lighter text-light hover:bg-dark transition-colors text-lg flex items-center justify-center disabled:opacity-40"
            >+</button>
          </div>
          {#if scaleTarget === 0}
            <p class="text-xs text-orange-400">
              This will stop all pods for {pendingAction.deployment.name}.
            </p>
          {/if}
        {/if}
        {#if actionError}
          <p class="text-sm text-red-500">{actionError}</p>
        {/if}
      </div>

      <div class="px-6 py-4 border-t border-dark-lighter flex justify-end gap-3">
        <button
          on:click={closeAction}
          class="px-4 py-2 text-sm rounded-md border border-dark-lighter text-light hover:bg-dark transition-colors"
        >
          Abbrechen
        </button>
        <button
          on:click={confirmAction}
          disabled={actionLoading}
          class="px-4 py-2 text-sm rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors"
        >
          {actionLoading ? 'Bitte warten…' : (pendingAction.type === 'restart' ? 'Restart' : 'Apply')}
        </button>
      </div>
    </div>
  </div>
{/if}
