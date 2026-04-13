<script lang="ts">
  let name = $state('');
  let email = $state('');
  let phone = $state('');
  let type = $state('allgemein');
  let message = $state('');
  let submitting = $state(false);
  let result = $state<{ success: boolean; message: string } | null>(null);

  const types = [
    { value: 'allgemein', label: 'Allgemeine Anfrage' },
    { value: 'erstgespraech', label: 'Kostenloses Erstgespräch' },
    { value: 'digital-cafe', label: 'Digital Café 50+' },
    { value: 'coaching', label: 'Führungskräfte-Coaching' },
    { value: 'beratung', label: 'Unternehmensberatung' },
    { value: 'support', label: 'Support' },
    { value: 'feedback', label: 'Feedback' },
  ];

  async function handleSubmit(e: Event) {
    e.preventDefault();
    submitting = true;
    result = null;

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, type, message }),
      });

      const data = await response.json();

      if (response.ok) {
        result = { success: true, message: 'Vielen Dank! Ihre Nachricht wurde gesendet. Wir melden uns in Kürze bei Ihnen.' };
        name = '';
        email = '';
        phone = '';
        type = 'allgemein';
        message = '';
      } else {
        result = { success: false, message: data.error || 'Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.' };
      }
    } catch {
      result = { success: false, message: 'Verbindungsfehler. Bitte versuchen Sie es spater erneut.' };
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="space-y-6">
  <!-- Type -->
  <div>
    <label for="type" class="block text-lg font-medium text-light mb-2">
      Wie können wir Ihnen helfen?
    </label>
    <select
      id="type"
      bind:value={type}
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
    >
      {#each types as t}
        <option value={t.value}>{t.label}</option>
      {/each}
    </select>
  </div>

  <!-- Name -->
  <div>
    <label for="name" class="block text-lg font-medium text-light mb-2">
      Ihr Name <span class="text-gold">*</span>
    </label>
    <input
      id="name"
      type="text"
      bind:value={name}
      required
      placeholder="Max Mustermann"
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
    />
  </div>

  <!-- Email -->
  <div>
    <label for="email" class="block text-lg font-medium text-light mb-2">
      E-Mail-Adresse <span class="text-gold">*</span>
    </label>
    <input
      id="email"
      type="email"
      bind:value={email}
      required
      placeholder="max@beispiel.de"
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
    />
  </div>

  <!-- Phone -->
  <div>
    <label for="phone" class="block text-lg font-medium text-light mb-2">
      Telefon <span class="text-muted-dark">(optional)</span>
    </label>
    <input
      id="phone"
      type="tel"
      bind:value={phone}
      placeholder="+49 ..."
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors"
    />
  </div>

  <!-- Message -->
  <div>
    <label for="message" class="block text-lg font-medium text-light mb-2">
      Ihre Nachricht <span class="text-gold">*</span>
    </label>
    <textarea
      id="message"
      bind:value={message}
      required
      rows="5"
      placeholder="Beschreiben Sie kurz Ihr Anliegen..."
      class="w-full px-4 py-3.5 rounded-lg border border-dark-lighter text-lg bg-dark text-light placeholder-muted-dark focus:border-gold focus:ring-2 focus:ring-gold-dim transition-colors resize-y"
    ></textarea>
  </div>

  <!-- Submit -->
  <button
    type="submit"
    disabled={submitting}
    class="w-full bg-gold hover:bg-gold-light disabled:bg-dark-lighter disabled:text-muted-dark text-dark px-8 py-4 rounded-full font-bold text-lg transition-colors cursor-pointer disabled:cursor-not-allowed uppercase tracking-wide"
  >
    {#if submitting}
      Wird gesendet...
    {:else}
      Nachricht senden
    {/if}
  </button>

  <!-- Result message -->
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
    Mit dem Absenden stimmen Sie unserer
    <a href="/datenschutz" class="text-gold hover:underline">Datenschutzerklärung</a>
    und unseren <a href="/agb" class="text-gold hover:underline">AGB</a> zu.
  </p>
</form>
