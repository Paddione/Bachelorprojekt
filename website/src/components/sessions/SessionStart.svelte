<script lang="ts">
  import TemplatePicker from './TemplatePicker.svelte';

  interface SessionTemplate {
    id: string; slug: string; title: string; body_markdown: string;
    is_default: boolean; owner_id: string | null; created_from_template_id: string | null;
  }

  let { open = $bindable(false) } = $props<{ open?: boolean }>();

  function onSelect(e: CustomEvent<{ template: SessionTemplate }>) {
    window.dispatchEvent(new CustomEvent('session:start', {
      detail: { template: e.detail.template },
    }));
    open = false;
  }

  function close() { open = false; }
</script>

{#if open}
  <div class="overlay" onclick={close} role="presentation">
    <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="Neue Session starten">
      <header>
        <span>Neue Brainstorm-Session</span>
        <button type="button" onclick={close} aria-label="Schliessen">×</button>
      </header>
      <TemplatePicker ontemplate:select={onSelect} />
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex;
    align-items: center; justify-content: center; z-index: 1000; }
  .modal { background: #0b111c; border: 1px solid #243349; border-radius: 12px;
    max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; }
  header { display: flex; justify-content: space-between; align-items: center;
    padding: 0.75rem 1rem; border-bottom: 1px solid #1e2a3e; font-weight: 600; }
  header button { background: none; border: none; color: inherit; font-size: 1.4rem;
    cursor: pointer; }
</style>
