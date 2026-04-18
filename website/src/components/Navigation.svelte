<script lang="ts">
  let { siteTitle = '' } = $props();

  const brandWord = siteTitle.replace(/\.de$/i, '').toLowerCase();

  let mobileOpen = $state(false);
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
</script>

<header class="topbar" aria-label="Hauptnavigation">
  <div class="wrap">
    <!-- Brand mark -->
    <a href="/" class="brand" aria-label="{brandWord} Startseite">
      <div class="mark" aria-hidden="true">
        <div class="mark-m"></div>
      </div>
      <span class="brand-name">{brandWord}<span class="brand-dot">.</span></span>
    </a>

    <!-- Desktop nav -->
    <nav class="nav-links" aria-label="Seitennavigation">
      <a href="/#angebote">Angebote</a>
      <a href="/ueber-mich">Über mich</a>
      <a href="/referenzen">Referenzen</a>
      <a href="/kontakt">Kontakt</a>

      {#if authChecked && user}
        <a href={user.isAdmin ? '/admin' : '/portal'} data-testid="nav-user-area">
          {user.isAdmin ? 'Admin' : 'Mein Portal'}
        </a>
      {/if}
    </nav>

    <div class="nav-right">
      <span class="nav-meta" aria-hidden="true">Lüneburg · DE</span>

      {#if authChecked}
        {#if user}
          <span class="nav-user-name">{user.name}</span>
          <a href="/api/auth/logout" class="nav-link-sm">Abmelden</a>
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
          <span class="mobile-user">Angemeldet als {user.name}</span>
          <a href={user.isAdmin ? '/admin' : '/portal'} onclick={() => (mobileOpen = false)}>{user.isAdmin ? 'Admin' : 'Mein Portal'}</a>
          <a href="/api/auth/logout" onclick={() => (mobileOpen = false)}>Abmelden</a>
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
  }

  .mark-m {
    position: absolute;
    inset: 7px;
    border-radius: 3px;
    background: var(--ink-900);
    clip-path: polygon(0 55%, 30% 55%, 30% 0, 70% 0, 70% 55%, 100% 55%, 100% 100%, 0 100%);
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
    gap: 20px;
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

  .nav-user-name {
    font-size: 13px;
    color: var(--mute);
  }

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

  .mobile-user {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--mute);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 6px 0;
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
    .nav-user-name {
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
