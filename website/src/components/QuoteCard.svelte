<script lang="ts">
  interface Props {
    quote: string;
    name: string;
    role?: string;
    initials?: string;
  }

  let { quote, name, role = '', initials = '' }: Props = $props();

  const derivedInitials = initials || name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
</script>

<div class="quote-card">
  <span class="mark-q" aria-hidden="true">"</span>
  <blockquote>„{quote}"</blockquote>
  <div class="byline">
    <div class="avatar" aria-hidden="true">{derivedInitials}</div>
    <div>
      <p class="byline-name">{name}</p>
      {#if role}
        <p class="byline-role">{role}</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .quote-card {
    position: relative;
    padding: 44px 44px 40px;
    background:
      radial-gradient(circle at 0% 0%, oklch(0.80 0.09 75 / .12), transparent 50%),
      var(--ink-800);
    border: 1px solid var(--line-2);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .mark-q {
    font-family: var(--serif);
    font-size: 120px;
    line-height: 0.5;
    color: var(--brass);
    opacity: 0.4;
    position: absolute;
    top: 30px;
    left: 30px;
    font-style: italic;
    pointer-events: none;
    user-select: none;
  }

  blockquote {
    font-family: var(--serif);
    font-style: italic;
    font-size: 26px;
    line-height: 1.35;
    color: var(--fg);
    margin: 32px 0 28px;
    font-weight: 350;
    letter-spacing: -0.01em;
    position: relative;
    z-index: 1;
  }

  .byline {
    display: flex;
    align-items: center;
    gap: 14px;
    padding-top: 20px;
    border-top: 1px solid var(--line);
  }

  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 45%, #6e5420 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--serif);
    color: var(--ink-900);
    font-weight: 500;
    font-size: 16px;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.2);
    flex-shrink: 0;
    user-select: none;
  }

  .byline-name {
    font-weight: 600;
    color: var(--fg);
    font-size: 15px;
    margin: 0;
  }

  .byline-role {
    color: var(--mute);
    font-size: 13px;
    margin: 0;
  }
</style>
