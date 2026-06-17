<script lang="ts">
  interface Props {
    open: boolean;
    title: string;
    size?: 'sm' | 'md' | 'lg';
  }

  let {
    open = false,
    title,
    size = 'md',
    children,
    footer,
    onclose,
  }: Props & { children?: any; footer?: any; onclose?: () => void } = $props();

  let modalRef = $state<HTMLDialogElement | null>(null);
  let previousFocus = $state<HTMLElement | null>(null);

  function openModal() {
    previousFocus = document.activeElement as HTMLElement;
    if (modalRef) modalRef.showModal();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (modalRef) modalRef.close();
    document.body.style.overflow = '';
    previousFocus?.focus();
    onclose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === modalRef) closeModal();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeModal();
    }
    // basic focus trap
    if (e.key === 'Tab' && modalRef) {
      const focusable = modalRef.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }

  $effect(() => {
    if (open) {
      openModal();
    } else {
      closeModal();
    }
  });
</script>

<dialog
  bind:this={modalRef}
  class="modal modal--{size}"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  aria-labelledby="modal-title"
>
  <div class="modal__content">
    <div class="modal__header">
      <h2 id="modal-title" class="modal__title">{title}</h2>
      <button
        class="modal__close"
        onclick={closeModal}
        aria-label="Schließen"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="16" height="16">
          <path d="M4 4l8 8M12 4l-8 8"/>
        </svg>
      </button>
    </div>
    <div class="modal__body">
      {@render children?.()}
    </div>
    {#if footer}
      <div class="modal__footer">
        {@render footer()}
      </div>
    {/if}
  </div>
</dialog>

<style>
  .modal {
    border: 1px solid var(--admin-border-bright);
    border-radius: 16px;
    background: var(--admin-sidebar-bg);
    color: var(--admin-text);
    padding: 0;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: modal-in 0.2s ease;
  }

  .modal::backdrop {
    background: var(--admin-modal-backdrop);
    backdrop-filter: blur(4px);
    animation: fade-in 0.15s ease;
  }

  .modal--sm { width: 360px; }
  .modal--md { width: 480px; }
  .modal--lg { width: 640px; }

  @keyframes modal-in {
    from { opacity: 0; transform: scale(0.95) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }

  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .modal__content {
    display: flex;
    flex-direction: column;
    max-height: 90vh;
  }

  .modal__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-5) var(--space-6) var(--space-4);
    border-bottom: 1px solid var(--admin-border);
  }

  .modal__title {
    font-family: var(--font-serif);
    font-size: var(--admin-text-lg);
    font-weight: 700;
    color: var(--admin-text);
    letter-spacing: -0.01em;
    margin: 0;
  }

  .modal__close {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--admin-text-mute);
    cursor: pointer;
    border-radius: 8px;
    transition: background var(--admin-transition-fast), color var(--admin-transition-fast);
    flex-shrink: 0;
  }

  .modal__close:hover {
    background: var(--admin-surface-hover);
    color: var(--admin-text);
  }

  .modal__body {
    padding: var(--space-6);
    overflow-y: auto;
    flex: 1;
  }

  .modal__footer {
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--admin-border);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
