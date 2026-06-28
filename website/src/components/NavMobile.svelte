<script lang="ts">
  import type { NavigationLink } from '../config/types';
  import { t, type Locale } from '../i18n/index';

  interface Props {
    open: boolean;
    links: NavigationLink[];
    locale: Locale;
    /** Optional auth state forwarded from the parent Navigation component. */
    user?: { name: string; email: string; isAdmin?: boolean } | null;
    authChecked?: boolean;
    streamLive?: boolean;
    pathname: string;
  }

  let {
    open = $bindable(),
    links,
    locale,
    user = null,
    authChecked = false,
    streamLive = false,
    pathname,
  }: Props = $props();

  function initial(name: string) {
    return name.charAt(0).toUpperCase();
  }
</script>

{#if open}
  <nav class="mobile-menu" aria-label={t(locale, 'nav.aria-mobile')}>
    {#each links as link}
      <a
        href={link.href}
        target={link.external ? '_blank' : undefined}
        rel={link.external ? 'noopener noreferrer' : undefined}
        onclick={() => (open = false)}
      >{link.label}</a>
    {/each}

    {#if authChecked}
      {#if user}
        <div class="mobile-divider"></div>
        <div class="mobile-user-row">
          <span class="mobile-user-avatar">{initial(user.name)}</span>
          <div class="mobile-user-info">
            <span class="mobile-user-name">{user.name}</span>
            <span class="mobile-user-email">{user.email}</span>
          </div>
        </div>
        <a href={user.isAdmin ? '/admin' : '/portal'} onclick={() => (open = false)} data-testid="nav-user-area">
          {user.isAdmin ? t(locale, 'nav.admin') : t(locale, 'nav.portal')}
        </a>
        {#if user.isAdmin}
          <a href="/portal" onclick={() => (open = false)}>{t(locale, 'nav.view-as-user')}</a>
        {/if}
        <a href="/portal/stream" onclick={() => (open = false)} class="mobile-stream-link">
          {t(locale, 'nav.livestream')}
          {#if streamLive}
            <span class="live-badge" aria-label="Live">{t(locale, 'nav.live')}</span>
          {/if}
        </a>
        <a href="/api/auth/logout" onclick={() => (open = false)} class="mobile-logout">
          {t(locale, 'nav.logout')}
        </a>
      {:else}
        <div class="mobile-divider"></div>
        <a href="/registrieren" onclick={() => (open = false)}>{t(locale, 'nav.register')}</a>
        <a href="/api/auth/login" onclick={() => (open = false)}>{t(locale, 'nav.login')}</a>
      {/if}
    {/if}

    <a href="/kontakt" class="mobile-cta" onclick={() => (open = false)}>
      {t(locale, 'hero.cta-primary')}
    </a>
  </nav>
{/if}

<style>
  .mobile-menu {
    border-top: 1px solid var(--line);
    background: var(--ink-850);
    padding: 20px 40px 24px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .mobile-menu a {
    color: var(--fg-soft);
    text-decoration: none;
    font-size: 15px;
    font-weight: 500;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
    transition: color 0.15s ease;
  }

  .mobile-menu a:hover {
    color: var(--fg);
  }

  .mobile-divider {
    height: 1px;
    background: var(--line);
    margin: 8px 0;
  }

  .mobile-user-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }

  .mobile-user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--brass-d);
    border: 1.5px solid var(--brass);
    color: var(--brass);
    font-size: 13px;
    font-weight: 700;
    font-family: var(--mono);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 1;
  }

  .mobile-user-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .mobile-user-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--fg);
  }

  .mobile-user-email {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--mute);
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mobile-logout {
    color: var(--mute) !important;
  }

  .mobile-stream-link {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .live-badge {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #dc2626;
    color: #fff;
    font-family: var(--mono);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 2px 6px;
    border-radius: 4px;
    line-height: 1.4;
    flex-shrink: 0;
  }

  .live-badge::before {
    content: '';
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #fff;
    animation: live-pulse 1.4s ease-in-out infinite;
    flex-shrink: 0;
  }

  @keyframes live-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .mobile-cta {
    margin-top: 16px;
    background: var(--brass) !important;
    color: var(--ink-900) !important;
    text-align: center;
    padding: 12px 20px !important;
    border-radius: 999px;
    font-weight: 600;
    border-bottom: none !important;
  }

  .mobile-cta:hover {
    background: var(--brass-2) !important;
  }

  @media (max-width: 860px) {
    .mobile-menu {
      padding: 20px 22px 24px;
    }
  }
</style>
