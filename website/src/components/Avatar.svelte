<script lang="ts">
  export type AvatarVariant = 'brass' | 'hairline' | 'ring' | 'plate' | 'serif' | 'sage';

  let {
    givenName = '',
    familyName = '',
    name = '',
    size = 44,
    variant = 'brass' as AvatarVariant,
    className = '',
  }: {
    givenName?: string;
    familyName?: string;
    name?: string;
    size?: number;
    variant?: AvatarVariant;
    className?: string;
  } = $props();

  function initialsOf(given: string, family: string, full: string): string {
    if (given || family) {
      return ((given[0] ?? '') + (family[0] ?? '')).toUpperCase() || '?';
    }
    const parts = full.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?';
  }

  const initials = $derived(initialsOf(givenName, familyName, name));
  const letterSize = $derived(Math.round(size * 0.38));
  const isSquare = $derived(variant === 'plate');
</script>

<div
  class="avatar avatar--{variant} {className}"
  style="width:{size}px;height:{size}px;font-size:{letterSize}px;border-radius:{isSquare ? '6px' : '999px'};"
  aria-label="{initials}"
  role="img"
>
  <span>{initials}</span>
</div>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    user-select: none;
    line-height: 1;
  }
  .avatar span {
    transform: translateY(-0.5px);
  }

  /* Brass disc — default */
  .avatar--brass {
    background: linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.80 0.09 75) 55%, oklch(0.72 0.09 75) 100%);
    color: #0b111c;
    font-family: var(--font-sans, 'Geist', sans-serif);
    font-weight: 600;
    letter-spacing: -0.02em;
    box-shadow: inset 0 1px 0 0 rgba(255,255,255,.25), inset 0 -1px 0 0 rgba(0,0,0,.18);
  }

  /* Hairline disc — quiet */
  .avatar--hairline {
    background: var(--admin-bg, #0f1623);
    color: oklch(0.83 0.09 75);
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-weight: 500;
    letter-spacing: 0.04em;
    box-shadow: inset 0 0 0 1px rgba(232,200,112,.3);
  }

  /* Ring — editorial transparent */
  .avatar--ring {
    background: transparent;
    color: oklch(0.83 0.09 75);
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-weight: 500;
    letter-spacing: 0.04em;
    box-shadow: inset 0 0 0 1px oklch(0.83 0.09 75);
  }

  /* Plate — square mark */
  .avatar--plate {
    background: linear-gradient(155deg, oklch(0.32 0.04 75) 0%, oklch(0.22 0.03 75) 100%);
    color: oklch(0.83 0.09 75);
    font-family: var(--font-mono, 'Geist Mono', monospace);
    font-weight: 500;
    letter-spacing: 0.04em;
    box-shadow: inset 0 1px 0 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(0,0,0,.4);
  }

  /* Serif — reserved for Gerald */
  .avatar--serif {
    background: linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.78 0.09 75) 100%);
    color: #0b111c;
    font-family: var(--font-serif, 'Newsreader', serif);
    font-weight: 500;
    letter-spacing: -0.01em;
    font-style: italic;
    box-shadow: inset 0 1px 0 0 rgba(255,255,255,.22);
  }

  /* Sage — system / non-human */
  .avatar--sage {
    background: linear-gradient(155deg, oklch(0.84 0.06 160) 0%, oklch(0.74 0.06 160) 100%);
    color: #0b111c;
    font-family: var(--font-sans, 'Geist', sans-serif);
    font-weight: 600;
    letter-spacing: -0.02em;
  }
</style>
