<script lang="ts">
  interface Props {
    pathname?: string;
  }

  let { pathname = '/' }: Props = $props();

  const isEn = pathname.startsWith('/en');

  function switchLocale() {
    const cookieVal = isEn ? 'de' : 'en';
    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `locale=${cookieVal};path=/;max-age=${maxAge};SameSite=Lax`;

    let target: string;
    if (isEn) {
      target = pathname.replace(/^\/en/, '') || '/';
    } else {
      target = pathname === '/' ? '/en/' : `/en${pathname}`;
    }
    window.location.href = target;
  }
</script>

<div class="lang-switcher" role="group" aria-label="Language">
  <button
    type="button"
    class="lang-btn"
    class:active={!isEn}
    onclick={switchLocale}
    aria-current={!isEn ? 'true' : undefined}
  >DE</button>
  <span class="lang-sep" aria-hidden="true">/</span>
  <button
    type="button"
    class="lang-btn"
    class:active={isEn}
    onclick={switchLocale}
    aria-current={isEn ? 'true' : undefined}
  >EN</button>
</div>

<style>
  .lang-switcher {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .lang-btn {
    background: none;
    border: none;
    padding: 4px 6px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    color: var(--mute);
    cursor: pointer;
    transition: color 0.15s ease;
    line-height: 1;
  }

  .lang-btn:hover {
    color: var(--fg);
  }

  .lang-btn.active {
    color: var(--brass);
  }

  .lang-sep {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    line-height: 1;
  }
</style>
