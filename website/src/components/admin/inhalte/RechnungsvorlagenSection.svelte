<script lang="ts">
  type InitialData = {
    invoice_intro_text: string;
    invoice_kleinunternehmer_notice: string;
    invoice_outro_text: string;
    invoice_email_subject: string;
    invoice_email_body: string;
  };

  let { initialData }: { initialData: InitialData } = $props();

  let intro   = $state(initialData.invoice_intro_text);
  let notice  = $state(initialData.invoice_kleinunternehmer_notice);
  let outro   = $state(initialData.invoice_outro_text);
  let subject = $state(initialData.invoice_email_subject);
  let body    = $state(initialData.invoice_email_body);

  let saving = $state(false);
  let msg    = $state('');

  async function save() {
    saving = true; msg = '';
    try {
      const res = await fetch('/api/admin/inhalte/rechnungsvorlagen/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_intro_text: intro,
          invoice_kleinunternehmer_notice: notice,
          invoice_outro_text: outro,
          invoice_email_subject: subject,
          invoice_email_body: body,
        }),
      });
      msg = res.ok ? 'Gespeichert.' : 'Fehler beim Speichern.';
    } catch { msg = 'Verbindungsfehler.'; }
    finally { saving = false; }
  }

  const inputCls = 'w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm font-mono focus:outline-none focus:border-gold/50';
  const labelCls = 'block text-xs text-muted mb-1 font-mono uppercase tracking-widest';
</script>

<div class="pt-8 pb-20 space-y-6 max-w-2xl">
  <div>
    <h2 class="text-lg font-bold text-light font-serif mb-1">Rechnungsvorlagen</h2>
    <p class="text-sm text-muted">Texte, die in PDF-Rechnungen und E-Mails verwendet werden.</p>
  </div>

  <div class="space-y-4">
    <div>
      <label class={labelCls}>Anschreiben-Text (vor den Positionen)</label>
      <input type="text" bind:value={intro} class={inputCls} placeholder="für folgende Leistungen stelle ich Ihnen in Rechnung:" />
    </div>

    <div>
      <label class={labelCls}>§ 19 UStG Pflichthinweis (Kleinunternehmer)</label>
      <textarea bind:value={notice} rows={3} class={inputCls}></textarea>
      <p class="text-xs text-muted mt-1">Erscheint auf Rechnungen wenn Steuer-Modus = Kleinunternehmer.</p>
    </div>

    <div>
      <label class={labelCls}>Schlusstext (unter den Summen)</label>
      <input type="text" bind:value={outro} class={inputCls} placeholder="Vielen Dank für Ihr Vertrauen!" />
    </div>
  </div>

  <div class="border-t border-dark-lighter pt-6 space-y-4">
    <h3 class="text-sm font-semibold text-light">E-Mail-Vorlage</h3>
    <p class="text-xs text-muted">Platzhalter: <code class="font-mono text-gold/80">&#123;&#123;number&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;gross_amount&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;due_date&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;payment_reference&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;customer_name&#125;&#125;</code> <code class="font-mono text-gold/80">&#123;&#123;seller_name&#125;&#125;</code></p>
    <div>
      <label class={labelCls}>E-Mail-Betreff</label>
      <input type="text" bind:value={subject} class={inputCls} placeholder="Rechnung {{number}}" />
    </div>
    <div>
      <label class={labelCls}>E-Mail-Text</label>
      <textarea bind:value={body} rows={8} class={inputCls}></textarea>
    </div>
  </div>

  {#if msg}
    <p class="text-sm" class:text-green-400={msg === 'Gespeichert.'} class:text-red-400={msg !== 'Gespeichert.'}>{msg}</p>
  {/if}

  <button onclick={save} disabled={saving} class="px-5 py-2.5 bg-gold text-dark font-semibold rounded-lg text-sm hover:bg-gold/80 disabled:opacity-50">
    {saving ? 'Speichern…' : 'Speichern'}
  </button>
</div>
