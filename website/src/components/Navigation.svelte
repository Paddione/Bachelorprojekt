<script lang="ts">
  import { onMount } from 'svelte';

  let { siteTitle = '' } = $props();
  const brandWord = siteTitle.replace(/\.de$/i, '').toLowerCase();

  let mobileOpen = $state(false);
  let menuOpen = $state(false);
  let menuEl = $state<HTMLElement | null>(null);
  let user = $state<{ name: string; email: string; isAdmin?: boolean } | null>(null);
  let authChecked = $state(false);

  if (typeof window !== 'undefined') {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) user = data.user;
        authChecked = true;
      })
      .catch(() => { authChecked = true; });
  }

  onMount(() => {
    function handleOutside(e: MouseEvent) {
      if (menuEl && !menuEl.contains(e.target as Node)) menuOpen = false;
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  });

  function initial(name: string) {
    return name.charAt(0).toUpperCase();
  }
</script>

<header class="topbar" aria-label="Hauptnavigation">
  <div class="wrap">
    <!-- Brand mark -->
    <a href="/" class="brand" aria-label="{brandWord} Startseite">
      <div class="mark" aria-hidden="true">
        <svg class="mark-m" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <text x="16" y="22" text-anchor="middle" fill="currentColor" font-family="Georgia, serif" font-weight="bold" font-size="18">m</text>
        </svg>
      </div>
      <span class="brand-name">{brandWord}<span class="brand-dot">.</span></span>
    </a>

    <!-- Desktop nav -->
    <nav class="nav-links" aria-label="Seitennavigation">
      <a href="/#angebote">Angebote</a>
      <a href="/ueber-mich">Über mich</a>
      <a href="/referenzen">Referenzen</a>
      <a href="/kontakt">Kontakt</a>
    </nav>

    <div class="nav-right">
      <span class="nav-meta" aria-hidden="true">Lüneburg · DE</span>

      {#if authChecked}
        {#if user}
          <!-- User pill + dropdown -->
          <div class="user-pill-wrap" bind:this={menuEl}>
            <button
              class="user-pill"
              onclick={() => (menuOpen = !menuOpen)}
              aria-expanded={menuOpen}
              aria-haspopup="true"
              aria-label="Benutzermenu öffnen"
            >
              <span class="user-avatar">{initial(user.name)}</span>
              <span class="user-pill-name">{user.name.split(' ')[0]}</span>
              <svg
                class="user-chevron"
                class:rotated={menuOpen}
                viewBox="0 0 10 6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M1 1l4 4 4-4"/>
              </svg>
            </button>

            {#if menuOpen}
              <div class="user-dropdown" role="menu">
                <div class="user-dropdown-info">
                  <span class="user-dropdown-name">{user.name}</span>
                  <span class="user-dropdown-email">{user.email}</span>
                </div>

                <a
                  href={user.isAdmin ? '/admin' : '/portal'}
                  class="user-dropdown-item"
                  onclick={() => (menuOpen = false)}
                  role="menuitem"
                  data-testid="nav-user-area"
                >
                  {#if user.isAdmin}
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="5" height="5" rx="0.5"/>
                      <rect x="9" y="2" width="5" height="5" rx="0.5"/>
                      <rect x="2" y="9" width="5" height="5" rx="0.5"/>
                      <rect x="9" y="9" width="5" height="5" rx="0.5"/>
                    </svg>
                    Admin
                  {:else}
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="8" cy="5" r="3"/>
                      <path d="M2 15a6 6 0 0 1 12 0"/>
                    </svg>
                    Mein Portal
                  {/if}
                </a>

                {#if user.isAdmin}
                  <a
                    href="/portal"
                    class="user-dropdown-item"
                    onclick={() => (menuOpen = false)}
                    role="menuitem"
                  >
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="8" cy="5" r="3"/>
                      <path d="M2 15a6 6 0 0 1 12 0"/>
                    </svg>
                    Als Nutzer ansehen
                  </a>
                {/if}

                <div class="user-dropdown-divider"></div>

                <a href="/api/auth/logout" class="user-dropdown-item logout" role="menuitem">
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M6 12H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>
                    <path d="M10.5 11l3-3-3-3M13.5 8H6"/>
                  </svg>
                  Abmelden
                </a>
              </div>
            {/if}
          </div>
        {:else}
          <a href="/registrieren" class="nav-link-sm">Registrieren</a>
          <a href="/api/auth/login" class="nav-link-sm">Anmelden</a>
        {/if}
      {/if}

      <a href="/kontakt" class="nav-cta" aria-label="Kostenloses Erstgespräch vereinbaren">
        Erstgespräch
        <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 7h10M8 3l4 4-4 4"/>
        </svg>
      </a>

      <!-- Mobile toggle -->
      <button
        class="mobile-toggle"
        onclick={() => (mobileOpen = !mobileOpen)}
        aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
        aria-expanded={mobileOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          {#if mobileOpen}
            <path d="M6 18L18 6M6 6l12 12"/>
          {:else}
            <path d="M4 6h16M4 12h16M4 18h16"/>
          {/if}
        </svg>
      </button>
    </div>
  </div>

  <!-- Mobile menu -->
  {#if mobileOpen}
    <nav class="mobile-menu" aria-label="Mobilnavigation">
      <a href="/#angebote" onclick={() => (mobileOpen = false)}>Angebote</a>
      <a href="/ueber-mich" onclick={() => (mobileOpen = false)}>Über mich</a>
      <a href="/referenzen" onclick={() => (mobileOpen = false)}>Referenzen</a>
      <a href="/kontakt" onclick={() => (mobileOpen = false)}>Kontakt</a>

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
          <a href={user.isAdmin ? '/admin' : '/portal'} onclick={() => (mobileOpen = false)} data-testid="nav-user-area">{user.isAdmin ? 'Admin' : 'Mein Portal'}</a>
          {#if user.isAdmin}
            <a href="/portal" onclick={() => (mobileOpen = false)}>Als Nutzer ansehen</a>
          {/if}
          <a href="/api/auth/logout" onclick={() => (mobileOpen = false)} class="mobile-logout">Abmelden</a>
        {:else}
          <div class="mobile-divider"></div>
          <a href="/registrieren" onclick={() => (mobileOpen = false)}>Registrieren</a>
          <a href="/api/auth/login" onclick={() => (mobileOpen = false)}>Anmelden</a>
        {/if}
      {/if}

      <a href="/kontakt" class="mobile-cta" onclick={() => (mobileOpen = false)}>
        Kostenloses Erstgespräch
      </a>
    </nav>
  {/if}
</header>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 30;
    background: linear-gradient(to bottom, rgba(11,17,28,0.92), rgba(11,17,28,0.72));
    backdrop-filter: blur(14px) saturate(1.1);
    -webkit-backdrop-filter: blur(14px) saturate(1.1);
    border-bottom: 1px solid var(--line);
  }

  .wrap {
    max-width: var(--maxw);
    margin: 0 auto;
    padding: 0 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    text-decoration: none;
    color: var(--fg);
    flex-shrink: 0;
  }

  .mark {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%);
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.2), 0 0 0 1px rgba(0,0,0,.3);
    position: relative;
    flex-shrink: 0;
    overflow: hidden;
  }

  .mark-m {
    position: absolute;
    inset: 1px;
    color: var(--ink-900);
    display: block;
  }

  .brand-name {
    font-family: var(--serif);
    font-size: 20px;
    letter-spacing: -0.01em;
  }

  .brand-dot {
    color: var(--brass);
  }

  .nav-links {
    display: flex;
    align-items: center;
    gap: 34px;
  }

  .nav-links a {
    color: var(--fg-soft);
    text-decoration: none;
    font-size: 14px;
    font-weight: 500;
    transition: color 0.15s ease;
  }

  .nav-links a:hover {
    color: var(--fg);
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .nav-meta {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    letter-spacing: 0.06em;
  }

  .nav-link-sm {
    color: var(--fg-soft);
    font-size: 13px;
    text-decoration: none;
    transition: color 0.15s ease;
  }

  .nav-link-sm:hover {
    color: var(--fg);
  }

  /* ── User pill ── */
  .user-pill-wrap {
    position: relative;
  }

  .user-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--line-2);
    border-radius: 999px;
    padding: 5px 10px 5px 5px;
    cursor: pointer;
    color: var(--fg-soft);
    font-size: 13px;
    font-weight: 500;
    font-family: var(--sans);
    transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
  }

  .user-pill:hover {
    border-color: rgba(255,255,255,0.2);
    color: var(--fg);
    background: rgba(255,255,255,0.07);
  }

  .user-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--brass-d);
    border: 1.5px solid var(--brass);
    color: var(--brass);
    font-size: 10px;
    font-weight: 700;
    font-family: var(--mono);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    line-height: 1;
  }

  .user-chevron {
    width: 10px;
    height: 6px;
    color: var(--mute);
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .user-chevron.rotated {
    transform: rotate(180deg);
  }

  /* ── Dropdown ── */
  .user-dropdown {
    position: absolute;
    top: calc(100% + 10px);
    right: 0;
    width: 224px;
    background: var(--ink-800);
    border: 1px solid var(--line-2);
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 20px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03);
    animation: dropdown-in 0.14s ease;
  }

  @keyframes dropdown-in {
    from { opacity: 0; transform: translateY(-5px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }

  .user-dropdown-info {
    padding: 14px 16px 12px;
    border-bottom: 1px solid var(--line);
  }

  .user-dropdown-name {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--fg);
    margin-bottom: 3px;
  }

  .user-dropdown-email {
    display: block;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--mute);
    letter-spacing: 0.02em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-dropdown-divider {
    height: 1px;
    background: var(--line);
    margin: 3px 0;
  }

  .user-dropdown-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 500;
    color: var(--fg-soft);
    text-decoration: none;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .user-dropdown-item svg {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    color: var(--mute);
    transition: color 0.1s ease;
  }

  .user-dropdown-item:hover {
    background: var(--ink-750);
    color: var(--fg);
  }

  .user-dropdown-item:hover svg {
    color: var(--brass);
  }

  .user-dropdown-item.logout:hover {
    color: #f87171;
  }

  .user-dropdown-item.logout:hover svg {
    color: #f87171;
  }

  /* ── CTA ── */
  .nav-cta {
    font-family: var(--sans);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-900);
    background: var(--brass);
    padding: 10px 16px;
    border-radius: 999px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: background 0.2s ease;
    white-space: nowrap;
  }

  .nav-cta svg {
    width: 14px;
    height: 14px;
  }

  .nav-cta:hover {
    background: var(--brass-2);
  }

  /* ── Mobile toggle ── */
  .mobile-toggle {
    display: none;
    background: none;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: var(--fg-soft);
  }

  .mobile-toggle svg {
    width: 24px;
    height: 24px;
  }

  /* ── Mobile menu ── */
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
    .nav-links {
      display: none;
    }
    .nav-meta {
      display: none;
    }
    .nav-link-sm {
      display: none;
    }
    .user-pill-wrap {
      display: none;
    }
    .mobile-toggle {
      display: block;
    }
    .wrap {
      padding: 0 22px;
    }
    .mobile-menu {
      padding: 20px 22px 24px;
    }
  }
</style>
