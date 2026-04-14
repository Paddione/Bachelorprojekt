<script lang="ts">
  let firstName = $state('');
  let lastName = $state('');
  let email = $state('');
  let phone = $state('');
  let company = $state('');
  let message = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    submitting = true;
    result = null;

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, phone, company, message }),
      });

      const data = await response.json();

      if (response.ok) {
        result = { success: true, message: 'Vielen Dank! Ihre Registrierung wurde eingereicht. Sie erhalten eine Bestätigung per E-Mail.' };
        firstName = '';
        lastName = '';
        email = '';
        phone = '';
        company = '';
        message = '';
      } else {
        result = { success: false, message: data.error || 'Es ist ein Fehler aufgetreten.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es spater erneut.' };
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-6">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <label for="firstName" class="block text-lg font-medium text-light mb-2">
        Vorname <span class="text-gold">*</span>
      </label>
      <input
        id="firstName"
        type="text"
        bind:value={firstName}
        required
        placeholder="Max"
        class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
      />
    </div>
    <div>
      <label for="lastName" class="block text-lg font-medium text-light mb-2">
        Nachname <span class="text-gold">*</span>
      </label>
      <input
        id="lastName"
        type="text"
        bind:value={lastName}
        required
        placeholder="Mustermann"
        class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
      />
    </div>
  </div>

  <div>
    <label for="reg-email" class="block text-lg font-medium text-light mb-2">
      E-Mail-Adresse <span class="text-gold">*</span>
    </label>
    <input
      id="reg-email"
      type="email"
      bind:value={email}
      required
      placeholder="max@beispiel.de"
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
    />
  </div>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <div>
      <label for="reg-phone" class="block text-lg font-medium text-light mb-2">
        Telefon <span class="text-muted-dark">(optional)</span>
      </label>
      <input
        id="reg-phone"
        type="tel"
        bind:value={phone}
        placeholder="+49 ..."
        class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
      />
    </div>
    <div>
      <label for="company" class="block text-lg font-medium text-light mb-2">
        Unternehmen <span class="text-muted-dark">(optional)</span>
      </label>
      <input
        id="company"
        type="text"
        bind:value={company}
        placeholder="Firma GmbH"
        class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
      />
    </div>
  </div>

  <div>
    <label for="reg-message" class="block text-lg font-medium text-light mb-2">
      Warum möchten Sie sich registrieren? <span class="text-muted-dark">(optional)</span>
    </label>
    <textarea
      id="reg-message"
      bind:value={message}
      rows="3"
      placeholder="Kurze Beschreibung Ihres Interesses..."
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors resize-y"
    ></textarea>
  </div>

  <button
    type="submit"
    disabled={submitting}
    class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-8 py-4 rounded-full font-bold text-lg transition-colors cursor-pointer disabled:cursor-not-allowed uppercase tracking-wide"
  >
    {#if submitting}
      Wird gesendet...
    {:else}
      Registrierung einreichen
    {/if}
  </button>

  {#if result}
    <div
      class="p-4 rounded-lg text-lg {result.success
        ? 'bg-green-900/30 text-green-300 border border-green-800'
        : 'bg-red-900/30 text-red-300 border border-red-800'}"
    >
      {result.message}
    </div>
  {/if}

  <p class="text-sm text-muted-dark text-center">
    Mit der Registrierung stimmen Sie unserer
    <a href="/datenschutz" class="text-gold hover:underline">Datenschutzerklärung</a>
    und unseren <a href="/agb" class="text-gold hover:underline">AGB</a> zu.
  </p>
</form>
