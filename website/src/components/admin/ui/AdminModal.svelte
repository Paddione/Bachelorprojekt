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
  // notifies the parent, regardless of how the dialog was closed.
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
  data-testid="admin-modal"
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
