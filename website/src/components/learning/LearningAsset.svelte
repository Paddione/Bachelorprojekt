<script lang="ts">
  import { getAsset, type Register, type Tone } from '../../lib/learning-assets';

  let {
    id,
    guideItem,
    concept,
    register,
    tone = 'active',
    class: klass = '',
  }: {
    id?: string;
    guideItem?: string;
    concept?: string;
    register?: Register;
    tone?: Tone;
    class?: string;
  } = $props();

  // Resolution priority: explicit id > guideItem (with concept fallback) > concept query.
  const entry = $derived(
    id
      ? getAsset(id)
      : guideItem
        ? getAsset({ guideItem }) ?? (concept ? getAsset({ concept, register, tone }) : null)
        : concept
          ? getAsset({ concept, register, tone })
          : null,
  );
</script>

{#if entry && entry.formats.svgInline}
  <span
    class={`learning-asset la-${entry.tone} ${klass}`}
    role="img"
    aria-label={entry.a11y.alt ?? undefined}
    aria-hidden={entry.a11y.alt ? undefined : 'true'}
    data-asset-id={entry.id}
  >
    {@html entry.formats.svgInline}
  </span>
{/if}

<style>
  .learning-asset {
    display: inline-flex;
    /* brand-tokenized: Kore lime (--copper) / mentolder brass (--brass); falls back safely */
    color: var(--la-accent, var(--copper, var(--brass, #c8f76a)));
  }
  .learning-asset :global(svg) { width: 100%; height: auto; }
  .la-calm { opacity: 0.85; }
</style>
