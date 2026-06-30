<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  export let result: {
    changed: number;
    skipped: number;
    failed: number;
    status: string;
    undoToken?: string;
  } | null = null;

  export let onUndo: (token: string) => void;
  export let onDismiss: () => void;

  let timerId: ReturnType<typeof setTimeout> | undefined;

  function startTimer() {
    if (result && result.failed === 0) {
      timerId = setTimeout(() => {
        onDismiss();
      }, 5000);
    }
  }

  function clearTimer() {
    if (timerId) {
      clearTimeout(timerId);
    }
  }

  onMount(() => {
    startTimer();
  });

  onDestroy(() => {
    clearTimer();
  });

  // Re-start timer if result changes
  $: {
    if (result) {
      clearTimer();
      startTimer();
    }
  }
</script>

{#if result}
  <div class="toast-container" class:error={result.failed > 0}>
    {#if result.failed > 0}
      <div class="error-banner">
        <span class="icon">⚠️</span>
        <span class="text">Undo fehlgeschlagen — manuell prüfen</span>
        <button class="dismiss-btn" on:click={onDismiss}>Dismiss</button>
      </div>
    {:else}
      <div class="toast-content">
        <span class="text">
          {result.changed} {result.changed === 1 ? 'Ticket' : 'Tickets'} auf {result.status} gesetzt
          {#if result.skipped > 0}
             ({result.skipped} übersprungen)
          {/if}
        </span>
        {#if result.undoToken}
          <button data-testid="bulk-undo" class="undo-btn" on:click={() => onUndo(result.undoToken)}>
            Rückgängig
          </button>
        {/if}
        <button class="dismiss-btn" on:click={onDismiss}>×</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    z-index: 1000;
    min-width: 300px;
    background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
    border: 1px solid #334155;
    border-radius: 8px;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.5);
    color: #f8fafc;
    font-family: 'Inter', sans-serif;
    font-size: 0.875rem;
    overflow: hidden;
    animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  .toast-container.error {
    background: linear-gradient(135deg, #7f1d1d 0%, #450a0a 100%);
    border-color: #991b1b;
  }

  .toast-content, .error-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
  }

  .text {
    flex: 1;
    font-weight: 500;
  }

  .undo-btn {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.2s;
  }

  .undo-btn:hover {
    background: #2563eb;
  }

  .dismiss-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 1.125rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
  }

  .dismiss-btn:hover {
    color: #f8fafc;
  }

  .error-banner .icon {
    font-size: 1.25rem;
  }

  .error-banner .dismiss-btn {
    font-size: 0.75rem;
    background: rgba(255, 255, 255, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    color: #fca5a5;
  }

  .error-banner .dismiss-btn:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  @keyframes slideIn {
    from {
      transform: translateY(100%) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }
</style>
