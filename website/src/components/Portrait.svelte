<script lang="ts">
  interface Props {
    avatarType: 'image' | 'initials';
    avatarSrc?: string;
    avatarInitials?: string;
    name: string;
    role: string;
    location?: string;
    tagText?: string;
  }

  let {
    avatarType,
    avatarSrc,
    avatarInitials = '',
    name,
    role,
    location = 'Lüneburg · DE',
    tagText = 'Anno 2026 · Lüneburg',
  }: Props = $props();
</script>

<div class="portrait-wrap" role="img" aria-label={`Portrait von ${name}, ${role}`}>
  <!-- Warm halo behind frame -->
  <div class="halo" aria-hidden="true"></div>
  <div class="halo-2" aria-hidden="true"></div>

  <!-- Frame -->
  <div class="portrait">
    {#if avatarType === 'image' && avatarSrc}
      <img src={avatarSrc} alt={`${name}, ${role}`} loading="lazy" />
      <!-- Duotone wash -->
      <div class="duotone" aria-hidden="true"></div>
      <!-- Brass hairline top -->
      <div class="brass-top" aria-hidden="true"></div>
    {:else}
      <!-- Initials placeholder -->
      <div class="initials-frame" aria-hidden="true">
        <div class="initials-circle">
          <span class="initials-text">{avatarInitials}</span>
        </div>
      </div>
      <div class="brass-top" aria-hidden="true"></div>
    {/if}

    <!-- Tag plate -->
    <div class="tag" aria-label={tagText}>
      <span class="tag-dot" aria-hidden="true"></span>
      {tagText}
    </div>
  </div>

  <!-- Caption plate -->
  <div class="caption">
    <span class="caption-num">GK · 01</span>
    <div class="caption-identity">
      <span class="caption-name">{name}</span>
      <span class="caption-role">{role}</span>
    </div>
    <span class="caption-loc">{location}</span>
  </div>
</div>

<style>
  .portrait-wrap {
    position: relative;
    width: 100%;
    max-width: 460px;
    margin-left: auto;
    isolation: isolate;
    padding: 0 18px 0 0;
  }

  /* Vertical hairline behind frame */
  .portrait-wrap::before {
    content: "";
    position: absolute;
    right: 2px;
    top: -16px;
    bottom: -40px;
    width: 1px;
    background: linear-gradient(to bottom, transparent, var(--line-2) 20%, var(--line-2) 80%, transparent);
    pointer-events: none;
  }

  .halo {
    position: absolute;
    right: -8%;
    top: 6%;
    width: 90%;
    height: 90%;
    border-radius: 50%;
    background: radial-gradient(closest-side, oklch(0.80 0.09 75 / .45), transparent 70%);
    filter: blur(8px);
    z-index: -1;
    pointer-events: none;
  }

  .halo-2 {
    position: absolute;
    left: -6%;
    bottom: 12%;
    width: 55%;
    height: 55%;
    border-radius: 50%;
    background: radial-gradient(closest-side, oklch(0.60 0.05 250 / .45), transparent 70%);
    filter: blur(18px);
    z-index: -1;
    pointer-events: none;
  }

  .portrait {
    position: relative;
    width: 100%;
    aspect-ratio: 4/5;
    border-radius: 4px;
    overflow: hidden;
    background: var(--ink-800);
    box-shadow:
      0 40px 80px -30px rgba(0,0,0,.75),
      0 2px 0 0 rgba(255,255,255,.04),
      inset 0 0 0 1px var(--line-2);
  }

  .portrait img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center 18%;
    filter: contrast(1.04) brightness(1.02) sepia(.18) saturate(1.05);
    transition: filter .5s ease, transform .8s ease;
  }

  .portrait-wrap:hover .portrait img {
    filter: contrast(1.06) brightness(1.04) sepia(.22) saturate(1.08);
    transform: scale(1.015);
  }

  .duotone {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      oklch(0.80 0.09 75 / .10) 0%,
      transparent 40%,
      oklch(0.18 0.02 250 / .35) 100%
    );
    mix-blend-mode: soft-light;
  }

  .brass-top {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    height: 1px;
    background: linear-gradient(to right, transparent, oklch(0.80 0.09 75 / .7) 30%, oklch(0.80 0.09 75 / .7) 70%, transparent);
    z-index: 2;
    pointer-events: none;
  }

  .initials-frame {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--ink-800);
  }

  .initials-circle {
    width: 220px;
    height: 220px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.2), 0 20px 60px rgba(0,0,0,.4);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .initials-text {
    font-family: var(--serif);
    font-size: 64px;
    font-weight: 400;
    color: var(--ink-900);
    letter-spacing: -0.02em;
    user-select: none;
  }

  .tag {
    position: absolute;
    left: 14px;
    top: 14px;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--fg);
    background: rgba(11,17,28,.55);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border: 1px solid rgba(255,255,255,.12);
    padding: 6px 10px;
    border-radius: 999px;
  }

  .tag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--sage);
    box-shadow: 0 0 0 3px oklch(0.80 0.06 160 / .18);
    flex-shrink: 0;
  }

  .caption {
    position: relative;
    margin-top: 18px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 16px;
    align-items: center;
    padding: 14px 4px 0;
    border-top: 1px solid var(--line);
  }

  .caption-num {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.18em;
    color: var(--brass);
    text-transform: uppercase;
  }

  .caption-identity {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .caption-name {
    font-family: var(--serif);
    font-size: 16px;
    color: var(--fg);
    letter-spacing: -0.01em;
  }

  .caption-role {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--mute);
    text-transform: uppercase;
  }

  .caption-loc {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--mute);
    text-transform: uppercase;
    text-align: right;
  }
</style>
