<script lang="ts">
  let mobileOpen = $state(false);
  let scrolled = $state(false);
  let user = $state<{ name: string; email: string } | null>(null);
  let authChecked = $state(false);

  if (typeof window !== 'undefined') {
    window.addEventListener('scroll', () => {
      scrolled = window.scrollY > 20;
    });

    // Check auth state
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) user = data.user;
        authChecked = true;
      })
      .catch(() => { authChecked = true; });
  }
</script>

<nav
  class="fixed top-0 left-0 right-0 z-50 transition-all duration-300 {scrolled
    ? 'bg-dark/95 backdrop-blur-sm shadow-lg shadow-black/20'
    : 'bg-dark'}"
>
  <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
    <a href="/" class="text-xl font-bold text-light hover:text-gold transition-colors font-serif">
      ${PROD_DOMAIN}
    </a>

    <!-- Desktop nav -->
    <div class="hidden md:flex items-center gap-8">
      <a href="/leistungen" class="text-muted hover:text-gold font-medium transition-colors">Leistungen</a>
      <a href="/termin" class="text-muted hover:text-gold font-medium transition-colors">Termin</a>
      <a href="/ueber-mich" class="text-muted hover:text-gold font-medium transition-colors">Über mich</a>

      {#if authChecked}
        {#if user}
          <span class="text-muted text-sm">{user.name}</span>
          <a
            href="/api/auth/logout"
            class="text-muted hover:text-gold font-medium transition-colors text-sm"
          >
            Abmelden
          </a>
        {:else}
          <a href="/registrieren" class="text-muted hover:text-gold font-medium transition-colors">Registrieren</a>
          <a
            href="/api/auth/login"
            class="border border-gold/40 hover:border-gold text-gold px-4 py-2 rounded-full font-bold transition-colors text-sm uppercase tracking-wide"
          >
            Anmelden
          </a>
        {/if}
      {/if}

      <a
        href="/kontakt"
        class="bg-gold hover:bg-gold-light text-dark px-5 py-2.5 rounded-full font-bold transition-colors text-base uppercase tracking-wide text-sm"
      >
        Kontakt
      </a>
    </div>

    <!-- Mobile toggle -->
    <button
      class="md:hidden p-2 text-muted"
      onclick={() => (mobileOpen = !mobileOpen)}
      aria-label="Menü öffnen"
    >
      <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {#if mobileOpen}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        {/if}
      </svg>
    </button>
  </div>

  <!-- Mobile menu -->
  {#if mobileOpen}
    <div class="md:hidden bg-dark-light border-t border-dark-lighter px-6 py-4 space-y-4">
      <a href="/leistungen" class="block text-muted hover:text-gold font-medium py-2" onclick={() => (mobileOpen = false)}>Leistungen</a>
      <a href="/termin" class="block text-muted hover:text-gold font-medium py-2" onclick={() => (mobileOpen = false)}>Termin</a>
      <a href="/ueber-mich" class="block text-muted hover:text-gold font-medium py-2" onclick={() => (mobileOpen = false)}>Über mich</a>

      {#if authChecked}
        {#if user}
          <div class="py-2 text-muted text-sm border-t border-dark-lighter pt-4">Angemeldet als {user.name}</div>
          <a href="/api/auth/logout" class="block text-muted hover:text-gold font-medium py-2" onclick={() => (mobileOpen = false)}>Abmelden</a>
        {:else}
          <a href="/registrieren" class="block text-muted hover:text-gold font-medium py-2" onclick={() => (mobileOpen = false)}>Registrieren</a>
          <a href="/api/auth/login" class="block text-gold hover:text-gold-light font-medium py-2" onclick={() => (mobileOpen = false)}>Anmelden</a>
        {/if}
      {/if}

      <a
        href="/kontakt"
        class="block bg-gold hover:bg-gold-light text-dark px-5 py-3 rounded-full font-bold text-center transition-colors uppercase tracking-wide text-sm"
        onclick={() => (mobileOpen = false)}
      >
        Kontakt
      </a>
    </div>
  {/if}
</nav>
