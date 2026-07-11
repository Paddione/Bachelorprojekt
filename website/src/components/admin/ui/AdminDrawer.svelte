<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    open = $bindable(false),
    title = "",
    body,
    footer = undefined,
    onclose = () => {}
  }: {
    open?: boolean;
    title?: string;
    body: Snippet;
    footer?: Snippet;
    onclose?: () => void;
  } = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();
  let headingId = Math.random().toString(36).substring(2, 9);

  $effect(() => {
    if (dialogEl) {
      if (open) {
        dialogEl.showModal();
      } else {
        dialogEl.close();
      }
    }
  });

  // Fires for Escape (native 'cancel' -> 'close'), backdrop-triggered close(), and
  // any other native dismissal path — keeps the bindable `open` in sync and always
  // notifies the parent, regardless of how the drawer was closed.
  function handleNativeClose() {
    open = false;
    onclose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) {
      dialogEl?.close();
    }
  }
</script>

<dialog
  bind:this={dialogEl}
  aria-labelledby={headingId}
  onclick={handleBackdropClick}
  onclose={handleNativeClose}
  data-testid="admin-drawer"
  class="admin-drawer"
>
  <header>
    <h2 id={headingId}>{title}</h2>
  </header>
  <div>
    {@render body()}
  </div>
  {#if footer}
    <footer>
      {@render footer()}
    </footer>
  {/if}
</dialog>

<style>
  .admin-drawer {
    position: fixed;
    inset: 0 0 0 auto;
    top: 0;
    right: 0;
    left: auto;
    height: 100%;
    max-height: 100%;
    width: min(420px, 100vw);
    max-width: 100vw;
    margin: 0;
    border: none;
    border-left: 1px solid var(--ink-750, #2a2a2a);
  }

  .admin-drawer::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }
</style>
