<script lang="ts">
  import { helpContent } from '../lib/helpContent';
  import type { HelpContext } from '../lib/helpContent';

  let {
    section,
    context,
  }: {
    section: string;
    context: HelpContext;
  } = $props();

  let open = $state(false);
  let btnHovered = $state(false);
  let closeBtnHovered = $state(false);

  const content = $derived(helpContent[context]?.[section] ?? null);

  function toggle() { open = !open; }
  function close() { open = false; }

  function onBackdropKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') close();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && open) close(); }} />

<!-- Floating Button -->
<button
  onclick={toggle}
  aria-label={open ? 'Hilfe schließen' : 'Hilfe öffnen'}
  style="
    position: fixed;
    bottom: 1.5rem;
    left: 1.5rem;
    z-index: 50;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: {btnHovered ? '#4338ca' : '#4f46e5'};
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(79,70,229,.45);
    font-size: 18px;
    font-weight: 700;
    font-family: var(--font-sans);
    transition: background 0.15s ease, transform 0.15s ease;
  "
  onmouseenter={() => { btnHovered = true; }}
  onmouseleave={() => { btnHovered = false; }}
>
  {open ? '✕' : '?'}
</button>

<!-- Mobile backdrop -->
{#if open}
  <div
    role="button"
    tabindex="0"
    aria-label="Hilfe schließen"
    onclick={close}
    onkeydown={onBackdropKeydown}
    style="
      position: fixed;
      inset: 0;
      z-index: 51;
      background: rgba(0,0,0,0.35);
      display: none;
    "
    class="help-backdrop"
  ></div>
{/if}

<!-- Slide-over Panel -->
<div
  class="help-panel"
  role="dialog"
  aria-modal="true"
  aria-labelledby="help-panel-title"
  aria-hidden={!open}
  inert={!open}
  style="
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 52;
    width: 320px;
    background: var(--ink-850);
    border-left: 1px solid var(--line);
    box-shadow: -4px 0 24px rgba(0,0,0,.35);
    display: flex;
    flex-direction: column;
    transform: translateX({open ? '0' : '100%'});
    transition: transform 0.2s ease-out;
    overflow: hidden;
  "
>
  <!-- Header -->
  <div style="
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 14px;
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  ">
    <span id="help-panel-title" style="font-size: 14px; font-weight: 600; color: var(--fg); font-family: var(--font-sans);">Hilfe</span>
    <button
      onclick={close}
      aria-label="Hilfe schließen"
      style="
        background: none;
        border: none;
        cursor: pointer;
        color: {closeBtnHovered ? 'var(--fg)' : 'var(--mute)'};
        font-size: 18px;
        line-height: 1;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 0.1s ease;
      "
      onmouseenter={() => { closeBtnHovered = true; }}
      onmouseleave={() => { closeBtnHovered = false; }}
    >✕</button>
  </div>

  <!-- Content -->
  <div style="flex: 1; overflow-y: auto; padding: 16px;">
    {#if content}
      <!-- Section title -->
      <h3 style="
        font-size: 13px;
        font-weight: 600;
        color: #818cf8;
        margin: 0 0 6px;
        font-family: var(--font-sans);
      ">{content.title}</h3>

      <!-- Description -->
      <p style="
        font-size: 12px;
        color: var(--fg-soft);
        margin: 0 0 16px;
        line-height: 1.55;
        font-family: var(--font-sans);
      ">{content.description}</p>

      <!-- Actions -->
      {#if content.actions.length > 0}
        <p style="
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--mute);
          margin: 0 0 8px;
          font-family: var(--font-sans);
        ">Was kann ich hier tun?</p>
        <ul style="margin: 0 0 16px; padding: 0; list-style: none;">
          {#each content.actions as action}
            <li style="
              font-size: 12px;
              color: var(--fg-soft);
              padding: 3px 0;
              font-family: var(--font-sans);
              display: flex;
              align-items: flex-start;
              gap: 6px;
            ">
              <span style="color: #818cf8; flex-shrink: 0;">✦</span>
              {action}
            </li>
          {/each}
        </ul>
      {/if}

      <!-- Guides -->
      {#if content.guides.length > 0}
        <p style="
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.07em;
          color: var(--mute);
          margin: 0 0 8px;
          font-family: var(--font-sans);
        ">Anleitungen</p>
        <div style="display: flex; flex-direction: column; gap: 6px;">
          {#each content.guides as guide}
            <details style="border-radius: 6px; overflow: hidden;">
              <summary style="
                font-size: 12px;
                color: #818cf8;
                background: rgba(79,70,229,.12);
                padding: 7px 10px;
                cursor: pointer;
                border-radius: 6px;
                list-style: none;
                font-family: var(--font-sans);
                display: flex;
                align-items: center;
                gap: 6px;
                user-select: none;
              ">
                <span class="summary-arrow" style="font-size: 10px;">▶</span>
                {guide.title}
              </summary>
              <ol style="
                margin: 4px 0 0;
                padding: 8px 10px 8px 28px;
                background: rgba(79,70,229,.06);
                border-radius: 0 0 6px 6px;
              ">
                {#each guide.steps as step}
                  <li style="
                    font-size: 12px;
                    color: var(--fg-soft);
                    padding: 2px 0;
                    line-height: 1.5;
                    font-family: var(--font-sans);
                  ">{step}</li>
                {/each}
              </ol>
            </details>
          {/each}
        </div>
      {/if}

    {:else}
      <!-- Fallback when no content for this section -->
      <p style="font-size: 12px; color: var(--mute); font-family: var(--font-sans);">
        Für diesen Bereich ist noch keine Hilfe verfügbar.
      </p>
    {/if}
  </div>
</div>

<style>
  @media (max-width: 639px) {
    .help-panel {
      width: 100vw !important;
    }
    .help-backdrop {
      display: block !important;
    }
  }

  .summary-arrow {
    transition: transform 0.15s ease;
    display: inline-block;
  }

  details[open] .summary-arrow {
    transform: rotate(90deg);
    display: inline-block;
  }
</style>
