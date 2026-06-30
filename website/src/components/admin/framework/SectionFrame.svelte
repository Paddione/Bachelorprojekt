<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { createBehaviorStore } from '$lib/admin/behaviorStore';
  import { publicRouteFor } from '$lib/content-registry';
  import VersionDrawer from './VersionDrawer.svelte';
  import PreviewPane from './PreviewPane.svelte';

  interface Props {
    contentKey: string;
    store: ReturnType<typeof createBehaviorStore>;
    children?: import('svelte').Snippet;
  }

  let { contentKey, store, children }: Props = $props();

  type Snapshot = ReturnType<typeof store.get>;

  let snap = $state<Snapshot>(store.get());
  let showVersionDrawer = $state(false);
  let showPreview = $state(false);
  let savedFadeTimer: ReturnType<typeof setTimeout> | null = null;
  let savedVisible = $state(false);

  const unsub = store.subscribe((s) => {
    snap = s;
    if (s.state === 'saved') {
      savedVisible = true;
      if (savedFadeTimer) clearTimeout(savedFadeTimer);
      savedFadeTimer = setTimeout(() => { savedVisible = false; }, 3000);
    }
  });

  onDestroy(() => {
    unsub();
    if (savedFadeTimer) clearTimeout(savedFadeTimer);
  });

  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (snap.state === 'dirty' || snap.state === 'saving') {
      e.preventDefault();
    }
  }

  onMount(() => {
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  const previewRoute = $derived(publicRouteFor(contentKey) ?? '/');
</script>

<div class="space-y-4">
  <!-- Header bar: badges + action buttons -->
  <div class="flex items-center gap-3 flex-wrap">

    <!-- Save-state badge -->
    {#if snap.state === 'dirty'}
      <span class="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400">
        Ungespeichert
      </span>
    {:else if snap.state === 'saving'}
      <span class="px-2 py-0.5 text-xs rounded-full bg-dark border border-dark-lighter text-muted flex items-center gap-1">
        <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="31.4" stroke-dashoffset="10" />
        </svg>
        Speichert…
      </span>
    {:else if snap.state === 'saved' && savedVisible}
      <span class="px-2 py-0.5 text-xs rounded-full bg-green-500/20 border border-green-500/40 text-green-400 transition-opacity">
        Gespeichert ✓
      </span>
    {:else if snap.state === 'error'}
      <span class="px-2 py-0.5 text-xs rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center gap-2">
        Fehler
        <button
          onclick={() => store.saveNow()}
          class="underline hover:no-underline"
        >Wiederholen</button>
      </span>
    {/if}

    <div class="ml-auto flex items-center gap-2">
      <button
        onclick={() => { showVersionDrawer = !showVersionDrawer; }}
        class="px-3 py-1 text-xs bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/50 rounded-lg transition-colors"
      >
        Verlauf
      </button>
      <button
        onclick={() => { showPreview = !showPreview; }}
        class="px-3 py-1 text-xs bg-dark border border-dark-lighter text-muted hover:text-light hover:border-gold/50 rounded-lg transition-colors"
      >
        Vorschau
      </button>
    </div>
  </div>

  <!-- Conflict banner -->
  {#if snap.state === 'conflict'}
    <div class="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl space-y-3">
      <p class="text-sm text-yellow-300 font-medium">
        Konflikt — jemand hat diese Sektion zwischenzeitlich gespeichert.
      </p>
      <div class="flex gap-3">
        <button
          onclick={() => store.resolveConflictTakeMine()}
          class="px-4 py-2 text-xs bg-gold text-dark font-semibold rounded-lg hover:bg-gold/90"
        >
          Meine Version behalten
        </button>
        <button
          onclick={() => store.resolveConflictTakeTheirs()}
          class="px-4 py-2 text-xs bg-dark border border-dark-lighter text-muted hover:text-light rounded-lg transition-colors"
        >
          Ihre Version übernehmen
        </button>
      </div>
    </div>
  {/if}

  <!-- Main editor slot -->
  {#if children}
    {@render children()}
  {/if}

  <!-- Version drawer -->
  {#if showVersionDrawer}
    <VersionDrawer {contentKey} />
  {/if}

  <!-- Preview pane -->
  {#if showPreview}
    <PreviewPane route={previewRoute} />
  {/if}
</div>
