<script lang="ts">
  type Subscriber = {
    id: string;
    email: string;
    status: 'pending' | 'confirmed' | 'unsubscribed';
    source: 'website' | 'admin';
    confirmed_at: string | null;
    created_at: string;
  };

  type Campaign = {
    id: string;
    subject: string;
    html_body: string;
    status: 'draft' | 'sent';
    sent_at: string | null;
    recipient_count: number | null;
    created_at: string;
  };

  let activeTab: 'subscribers' | 'campaigns' | 'compose' = $state('subscribers');

  // ── Subscribers ──────────────────────────────────────────────────────────────
  let subscribers: Subscriber[] = $state([]);
  let subFilter: string = $state('all');
  let subLoading = $state(true);
  let subError = $state('');
  let addEmail = $state('');
  let addError = $state('');
  let addSuccess = $state('');
  let showAddForm = $state(false);
  let deleteConfirm: string | null = $state(null);

  async function loadSubscribers() {
    subLoading = true;
    subError = '';
    try {
      const url = subFilter === 'all'
        ? '/api/admin/newsletter/subscribers'
        : `/api/admin/newsletter/subscribers?status=${subFilter}`;
      const res = await fetch(url);
      subscribers = res.ok ? await res.json() : [];
      if (!res.ok) subError = 'Fehler beim Laden.';
    } catch {
      subError = 'Verbindungsfehler.';
    } finally {
      subLoading = false;
    }
  }

  async function addSubscriber(e: Event) {
    e.preventDefault();
    addError = ''; addSuccess = '';
    const res = await fetch('/api/admin/newsletter/subscribers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: addEmail }),
    });
    const data = await res.json();
    if (res.ok) {
      addSuccess = 'Abonnent hinzugefügt.';
      addEmail = '';
      showAddForm = false;
      await loadSubscribers();
    } else {
      addError = data.error ?? 'Fehler.';
    }
  }

  async function deleteSubscriber(id: string) {
    const res = await fetch(`/api/admin/newsletter/subscribers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      deleteConfirm = null;
      await loadSubscribers();
    }
  }

  $effect(() => {
    // Read subFilter synchronously so Svelte 5 registers it as a dependency.
    // loadSubscribers() is async; Svelte 5 only tracks synchronous reads.
    void subFilter;
    if (activeTab === 'subscribers') loadSubscribers();
  });

  // ── Campaigns ─────────────────────────────────────────────────────────────────
  let campaigns: Campaign[] = $state([]);
  let campLoading = $state(true);
  let campError = $state('');

  async function loadCampaigns() {
    campLoading = true; campError = '';
    try {
      const res = await fetch('/api/admin/newsletter/campaigns');
      campaigns = res.ok ? await res.json() : [];
      if (!res.ok) campError = 'Fehler beim Laden.';
    } catch {
      campError = 'Verbindungsfehler.';
    } finally {
      campLoading = false;
    }
  }

  $effect(() => {
    if (activeTab === 'campaigns') loadCampaigns();
  });

  function useAsTemplate(c: Campaign) {
    composeSubject = c.subject;
    composeHtml = c.html_body;
    composeDraftId = null;
    activeTab = 'compose';
  }

  // ── Compose ───────────────────────────────────────────────────────────────────
  let composeSubject = $state('');
  let composeHtml = $state('');
  let composeDraftId: string | null = $state(null);
  let composeMsg = $state('');
  let composeSaving = $state(false);
  let showSendConfirm = $state(false);
  let confirmedCount = $state(0);
  let sending = $state(false);

  async function saveDraft() {
    if (!composeSubject.trim() || !composeHtml.trim()) {
      composeMsg = 'Betreff und Inhalt sind erforderlich.'; return;
    }
    composeSaving = true; composeMsg = '';
    try {
      let res: Response;
      if (composeDraftId) {
        res = await fetch(`/api/admin/newsletter/campaigns/${composeDraftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: composeSubject, html_body: composeHtml }),
        });
      } else {
        res = await fetch('/api/admin/newsletter/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: composeSubject, html_body: composeHtml }),
        });
      }
      const data = await res.json();
      if (res.ok) {
        composeDraftId = data.id;
        composeMsg = 'Draft gespeichert.';
      } else {
        composeMsg = data.error ?? 'Fehler beim Speichern.';
      }
    } finally {
      composeSaving = false;
    }
  }

  async function openSendConfirm() {
    if (!composeSubject.trim() || !composeHtml.trim()) {
      composeMsg = 'Betreff und Inhalt sind erforderlich.'; return;
    }
    await saveDraft();
    if (!composeDraftId) return;
    // get confirmed count
    const res = await fetch('/api/admin/newsletter/subscribers?status=confirmed');
    const subs = res.ok ? await res.json() : [];
    confirmedCount = subs.length;
    showSendConfirm = true;
  }

  async function sendCampaign() {
    if (!composeDraftId) return;
    sending = true; showSendConfirm = false;
    const res = await fetch(`/api/admin/newsletter/campaigns/${composeDraftId}/send`, { method: 'POST' });
    const data = await res.json();
    sending = false;
    if (res.ok) {
      composeMsg = `Versendet an ${data.sent} von ${data.total} Abonnenten.`;
      composeSubject = ''; composeHtml = ''; composeDraftId = null;
      activeTab = 'campaigns';
      await loadCampaigns();
    } else {
      composeMsg = data.error ?? 'Fehler beim Versenden.';
    }
  }

  // helpers
  function statusBadge(s: string): string {
    if (s === 'confirmed') return 'bg-green-500/10 text-green-400 border-green-500/20';
    if (s === 'pending')   return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
    if (s === 'sent')      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    return 'bg-dark-lighter text-muted border-dark-lighter';
  }

  function fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  }
</script>

<!-- Tab bar -->
<div class="flex gap-1 mb-6 border-b border-dark-lighter">
  {#each [['subscribers','Abonnenten'],['campaigns','Kampagnen'],['compose','Neue Kampagne']] as [tab, label]}
    <button
      onclick={() => activeTab = tab as typeof activeTab}
      class={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab ? 'text-gold border-b-2 border-gold -mb-px bg-dark-light' : 'text-muted hover:text-light'}`}
    >{label}</button>
  {/each}
</div>

<!-- ── Subscribers tab ── -->
{#if activeTab === 'subscribers'}
  <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
    <div class="flex gap-1">
      {#each [['all','Alle'],['confirmed','Bestätigt'],['pending','Ausstehend'],['unsubscribed','Abgemeldet']] as [val, lbl]}
        <button
          onclick={() => { subFilter = val; }}
          class={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${subFilter === val ? 'bg-gold/20 text-gold' : 'bg-dark-lighter text-muted hover:text-light'}`}
        >{lbl}</button>
      {/each}
    </div>
    <button onclick={() => showAddForm = !showAddForm} class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
      + Hinzufügen
    </button>
  </div>

  {#if showAddForm}
    <form onsubmit={addSubscriber} class="mb-4 flex gap-2 p-4 bg-dark-light rounded-xl border border-gold/20">
      <input
        type="email" bind:value={addEmail} required placeholder="email@beispiel.de"
        class="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
      />
      <button type="submit" class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80">Hinzufügen</button>
    </form>
    {#if addError}<p class="text-red-400 text-sm mb-2">{addError}</p>{/if}
    {#if addSuccess}<p class="text-green-400 text-sm mb-2">{addSuccess}</p>{/if}
  {/if}

  {#if subLoading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if subError}
    <p class="text-red-400 text-sm">{subError}</p>
  {:else if subscribers.length === 0}
    <p class="text-muted text-sm">Keine Abonnenten gefunden.</p>
  {:else}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-left text-muted text-xs border-b border-dark-lighter">
            <th class="pb-2 font-medium">E-Mail</th>
            <th class="pb-2 font-medium">Status</th>
            <th class="pb-2 font-medium">Quelle</th>
            <th class="pb-2 font-medium">Datum</th>
            <th class="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {#each subscribers as sub}
            <tr class="border-b border-dark-lighter/50 hover:bg-dark-light/30">
              <td class="py-2.5 text-light">{sub.email}</td>
              <td class="py-2.5">
                <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(sub.status)}`}>{sub.status}</span>
              </td>
              <td class="py-2.5 text-muted">{sub.source}</td>
              <td class="py-2.5 text-muted">{fmtDate(sub.created_at)}</td>
              <td class="py-2.5 text-right">
                {#if deleteConfirm === sub.id}
                  <span class="text-xs text-muted mr-2">Sicher?</span>
                  <button onclick={() => deleteSubscriber(sub.id)} class="text-xs text-red-400 hover:text-red-300 mr-1">Ja</button>
                  <button onclick={() => deleteConfirm = null} class="text-xs text-muted hover:text-light">Nein</button>
                {:else}
                  <button onclick={() => deleteConfirm = sub.id} class="text-xs text-muted hover:text-red-400 transition-colors">Löschen</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

<!-- ── Campaigns tab ── -->
{:else if activeTab === 'campaigns'}
  <div class="flex justify-between items-center mb-4">
    <p class="text-muted text-sm">{campaigns.length} Kampagne{campaigns.length !== 1 ? 'n' : ''}</p>
    <button onclick={() => { composeSubject=''; composeHtml=''; composeDraftId=null; activeTab='compose'; }}
      class="px-3 py-1.5 bg-gold text-dark rounded-lg text-xs font-semibold hover:bg-gold/80">
      + Neue Kampagne
    </button>
  </div>

  {#if campLoading}
    <p class="text-muted text-sm">Lade…</p>
  {:else if campError}
    <p class="text-red-400 text-sm">{campError}</p>
  {:else if campaigns.length === 0}
    <p class="text-muted text-sm">Noch keine Kampagnen.</p>
  {:else}
    <div class="flex flex-col gap-2">
      {#each campaigns as c}
        <div class="p-4 bg-dark-light rounded-xl border border-dark-lighter flex items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <p class="text-light font-medium truncate">{c.subject}</p>
            <p class="text-muted text-xs mt-0.5">{fmtDate(c.sent_at ?? c.created_at)} · {c.recipient_count != null ? `${c.recipient_count} Empfänger` : 'Draft'}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0">
            <span class={`px-2 py-0.5 rounded border text-xs ${statusBadge(c.status)}`}>{c.status}</span>
            <button onclick={() => useAsTemplate(c)} class="text-xs text-muted hover:text-gold transition-colors">Als Vorlage</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

<!-- ── Compose tab ── -->
{:else if activeTab === 'compose'}
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    <div class="flex flex-col gap-4">
      <div>
        <label class="block text-sm text-muted mb-1">Betreff *</label>
        <input
          type="text" bind:value={composeSubject} placeholder="Betreff der E-Mail"
          class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none"
        />
      </div>
      <div class="flex flex-col flex-1">
        <label class="block text-sm text-muted mb-1">HTML-Inhalt *</label>
        <textarea
          bind:value={composeHtml}
          placeholder="<h1>Hallo!</h1><p>Dein Newsletter-Inhalt hier.</p>"
          rows="20"
          class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm font-mono focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none resize-y"
        ></textarea>
      </div>
      {#if composeMsg}
        <p class={`text-sm ${composeMsg.includes('Fehler') || composeMsg.includes('erforderlich') ? 'text-red-400' : 'text-green-400'}`}>{composeMsg}</p>
      {/if}
      <div class="flex gap-3">
        <button onclick={saveDraft} disabled={composeSaving} class="px-4 py-2 bg-dark-lighter text-light rounded-lg text-sm font-medium hover:bg-dark-light transition-colors disabled:opacity-50">
          {composeSaving ? 'Speichere…' : 'Als Draft speichern'}
        </button>
        <button onclick={openSendConfirm} disabled={sending} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50">
          {sending ? 'Sende…' : 'Senden'}
        </button>
      </div>
    </div>
    <div>
      <p class="text-sm text-muted mb-1">Vorschau</p>
      <iframe
        srcdoc={composeHtml || '<p style="color:#666;font-family:sans-serif;padding:20px;">Vorschau erscheint hier…</p>'}
        title="E-Mail Vorschau"
        class="w-full h-[500px] rounded-xl border border-dark-lighter bg-white"
      ></iframe>
    </div>
  </div>
{/if}

<!-- Send confirm dialog -->
{#if showSendConfirm}
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
    <div class="bg-dark-light rounded-2xl border border-dark-lighter p-6 max-w-sm w-full">
      <h3 class="text-lg font-semibold text-light mb-2">Kampagne versenden?</h3>
      <p class="text-muted text-sm mb-6">
        Diese Kampagne wird an <strong class="text-light">{confirmedCount} bestätigte{confirmedCount !== 1 ? 'n' : ''} Abonnent{confirmedCount !== 1 ? 'en' : ''}</strong> versendet. Diese Aktion kann nicht rückgängig gemacht werden.
      </p>
      <div class="flex gap-3 justify-end">
        <button onclick={() => showSendConfirm = false} class="px-4 py-2 bg-dark-lighter text-light rounded-lg text-sm hover:bg-dark-light/80">Abbrechen</button>
        <button onclick={sendCampaign} class="px-4 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80">Jetzt senden</button>
      </div>
    </div>
  </div>
{/if}
