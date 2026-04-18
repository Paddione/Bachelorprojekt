# Invoice Create UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Rechnung / Angebot erstellen"-Modal to the admin with two entry points: global on `/admin/rechnungen` and context-aware in the per-client invoices tab.

**Architecture:** One new Svelte 5 island (`CreateInvoiceModal.svelte`) renders both the trigger button and the overlay modal. A new API endpoint (`GET /api/admin/clients-list`) provides the client dropdown data. Both entry points pass serialised service options as props (avoids importing the Node.js Stripe SDK client-side). After a successful create the component dispatches a `invoice-created` DOM event; the host page reloads.

**Tech Stack:** Svelte 5 (runes), Astro 4, TypeScript, Tailwind CSS, existing Stripe billing API (`POST /api/billing/create-invoice`), Keycloak (`listUsers()`).

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `website/src/pages/api/admin/clients-list.ts` | Returns Keycloak users as `{id,name,email}[]` for the dropdown |
| Create | `website/src/components/admin/CreateInvoiceModal.svelte` | Button + modal, all form state, calls create-invoice API |
| Modify | `website/src/pages/admin/rechnungen.astro` | Add `<CreateInvoiceModal>` island + reload listener |
| Modify | `website/src/components/portal/InvoicesTab.astro` | Add `<CreateInvoiceModal prefillEmail>` island + reload listener |

---

## Task 1: GET /api/admin/clients-list

**Files:**
- Create: `website/src/pages/api/admin/clients-list.ts`

- [ ] **Step 1.1 — Create the endpoint**

```typescript
// website/src/pages/api/admin/clients-list.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { listUsers } from '../../../lib/keycloak';

export interface ClientOption {
  id: string;
  name: string;
  email: string;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const users = await listUsers();
    const clients: ClientOption[] = users
      .filter(u => !!u.email)
      .map(u => ({
        id: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username,
        email: u.email!,
      }));
    return new Response(JSON.stringify(clients), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Keycloak nicht erreichbar' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Step 1.2 — Smoke-test the endpoint**

With the dev server running (`task website:dev`), run:
```bash
curl -s http://localhost:4321/api/admin/clients-list | jq .
```
Expected without auth: `{"error":"Unauthorized"}` with status 403.

Log in via the browser and re-test — expected: `[{"id":"...","name":"Gerald Korczewski","email":"quamain@web.de"},...]`

- [ ] **Step 1.3 — Commit**

```bash
git add website/src/pages/api/admin/clients-list.ts
git commit -m "feat(admin): add clients-list API endpoint for invoice modal dropdown"
```

---

## Task 2: CreateInvoiceModal Svelte Component

**Files:**
- Create: `website/src/components/admin/CreateInvoiceModal.svelte`

- [ ] **Step 2.1 — Create the component**

```svelte
<!-- website/src/components/admin/CreateInvoiceModal.svelte -->
<script lang="ts">
  export interface ServiceOption {
    key: string;
    name: string;
    cents: number;
  }

  interface ClientOption {
    id: string;
    name: string;
    email: string;
  }

  let {
    serviceOptions,
    prefillEmail = '',
    prefillName = '',
    buttonLabel = '+ Neue Rechnung',
    buttonVariant = 'primary',
  }: {
    serviceOptions: ServiceOption[];
    prefillEmail?: string;
    prefillName?: string;
    buttonLabel?: string;
    buttonVariant?: 'primary' | 'ghost';
  } = $props();

  // ── Modal state ──────────────────────────────────────────────────────────
  let open = $state(false);

  // ── Form mode ────────────────────────────────────────────────────────────
  let asQuote = $state(false);

  // ── Customer ─────────────────────────────────────────────────────────────
  let clientsLoaded = $state(false);
  let clients = $state<ClientOption[]>([]);
  let clientSearch = $state('');
  let selectedClient = $state<ClientOption | null>(null);
  let externalMode = $state(false);
  let extName = $state('');
  let extEmail = $state('');
  let extCompany = $state('');
  let extVat = $state('');

  // ── Service / qty ─────────────────────────────────────────────────────────
  let selectedKey = $state(serviceOptions[0]?.key ?? '');
  let quantity = $state(1);

  // ── Misc ─────────────────────────────────────────────────────────────────
  let notes = $state('');
  let sendEmail = $state(true);
  let submitting = $state(false);
  let error = $state('');
  let success = $state('');

  // ── Derived ──────────────────────────────────────────────────────────────
  const selectedService = $derived(serviceOptions.find(s => s.key === selectedKey));
  const totalEur = $derived(((selectedService?.cents ?? 0) * quantity) / 100);
  const fmtTotal = $derived(
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalEur)
  );
  const filteredClients = $derived(
    clientSearch.length < 1
      ? clients
      : clients.filter(
          c =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            c.email.toLowerCase().includes(clientSearch.toLowerCase())
        )
  );
  const isPrefilled = $derived(!!prefillEmail);

  async function openModal() {
    open = true;
    error = '';
    success = '';
    if (isPrefilled) {
      externalMode = false;
      selectedClient = { id: '', name: prefillName || prefillEmail, email: prefillEmail };
    }
    if (!clientsLoaded && !isPrefilled) {
      await loadClients();
    }
  }

  function closeModal() {
    if (submitting) return;
    open = false;
    resetForm();
  }

  function resetForm() {
    asQuote = false;
    clientSearch = '';
    selectedClient = isPrefilled ? { id: '', name: prefillName || prefillEmail, email: prefillEmail } : null;
    externalMode = false;
    extName = '';
    extEmail = '';
    extCompany = '';
    extVat = '';
    selectedKey = serviceOptions[0]?.key ?? '';
    quantity = 1;
    notes = '';
    sendEmail = true;
    error = '';
    success = '';
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients-list');
      if (res.ok) {
        clients = await res.json();
        clientsLoaded = true;
      }
    } catch {
      // combobox will show empty list; freetext still works
    }
  }

  function selectClient(c: ClientOption) {
    selectedClient = c;
    clientSearch = '';
  }

  async function submit() {
    error = '';
    success = '';

    const customerName = externalMode ? extName.trim() : (selectedClient?.name ?? '');
    const customerEmail = externalMode ? extEmail.trim() : (selectedClient?.email ?? '');

    if (!customerName || !customerEmail) {
      error = 'Bitte einen Kunden auswählen oder Kundendaten eingeben.';
      return;
    }
    if (!selectedKey) {
      error = 'Bitte eine Leistung auswählen.';
      return;
    }

    submitting = true;
    try {
      const payload: Record<string, unknown> = {
        name: customerName,
        email: customerEmail,
        company: externalMode ? extCompany || undefined : undefined,
        vatNumber: externalMode ? extVat || undefined : undefined,
        serviceKey: selectedKey,
        quantity,
        notes: notes.trim() || undefined,
        asQuote,
        sendEmail,
      };

      const res = await fetch('/api/billing/create-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        error = data.error ?? 'Unbekannter Fehler.';
        return;
      }

      success = asQuote
        ? `Angebot erstellt.`
        : `Rechnung ${data.data?.number ?? ''} erstellt.`;

      document.dispatchEvent(new CustomEvent('invoice-created'));
      setTimeout(() => closeModal(), 1200);
    } catch {
      error = 'Netzwerkfehler. Bitte erneut versuchen.';
    } finally {
      submitting = false;
    }
  }
</script>

<!-- Trigger button -->
{#if buttonVariant === 'primary'}
  <button
    onclick={openModal}
    class="px-4 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 transition-colors"
  >
    {buttonLabel}
  </button>
{:else}
  <button
    onclick={openModal}
    class="px-3 py-1.5 text-xs font-medium text-gold border border-gold/40 rounded-lg hover:bg-gold/10 transition-colors"
  >
    {buttonLabel}
  </button>
{/if}

<!-- Modal overlay -->
{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    onclick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
  >
    <div class="w-full max-w-lg bg-dark rounded-2xl border border-dark-lighter shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-6 py-4 border-b border-dark-lighter">
        <h2 class="text-lg font-bold text-light font-serif">
          {asQuote ? 'Angebot erstellen' : 'Rechnung erstellen'}
        </h2>
        <button onclick={closeModal} class="text-muted hover:text-light transition-colors text-xl leading-none">✕</button>
      </div>

      <div class="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">

        <!-- Rechnung / Angebot tabs -->
        <div class="flex gap-1 p-1 bg-dark-light rounded-lg border border-dark-lighter">
          <button
            onclick={() => (asQuote = false)}
            class={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${!asQuote ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}
          >
            Rechnung
          </button>
          <button
            onclick={() => (asQuote = true)}
            class={`flex-1 py-1.5 text-sm font-medium rounded transition-colors ${asQuote ? 'bg-gold text-dark' : 'text-muted hover:text-light'}`}
          >
            Angebot
          </button>
        </div>

        <!-- Customer section -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Kunde</label>
          {#if isPrefilled}
            <div class="px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light">
              {selectedClient?.name} <span class="text-muted">· {selectedClient?.email}</span>
            </div>
          {:else if !externalMode}
            <!-- Combobox -->
            {#if selectedClient}
              <div class="flex items-center gap-2 px-3 py-2 bg-dark-light border border-gold/40 rounded-lg text-sm">
                <span class="flex-1 text-light">{selectedClient.name} <span class="text-muted">· {selectedClient.email}</span></span>
                <button onclick={() => { selectedClient = null; clientSearch = ''; }} class="text-muted hover:text-red-400 text-xs">✕</button>
              </div>
            {:else}
              <input
                type="text"
                bind:value={clientSearch}
                placeholder="Name oder E-Mail eingeben…"
                class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50"
              />
              {#if clientSearch.length > 0 && filteredClients.length > 0}
                <ul class="mt-1 bg-dark-light border border-dark-lighter rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {#each filteredClients as c (c.id)}
                    <li>
                      <button
                        onclick={() => selectClient(c)}
                        class="w-full text-left px-3 py-2 text-sm hover:bg-dark/50 transition-colors"
                      >
                        <span class="text-light">{c.name}</span>
                        <span class="text-muted ml-1">· {c.email}</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {:else if clientSearch.length > 0}
                <p class="mt-1 px-3 py-2 text-xs text-muted">Keine Clients gefunden.</p>
              {/if}
            {/if}
            <button onclick={() => (externalMode = true)} class="mt-1 text-xs text-gold hover:underline">
              + Externer Kunde (manuell eingeben)
            </button>
          {:else}
            <!-- External freetext -->
            <div class="space-y-2">
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-xs text-muted mb-1">Name *</label>
                  <input type="text" bind:value={extName} placeholder="Max Mustermann"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">E-Mail *</label>
                  <input type="email" bind:value={extEmail} placeholder="max@firma.de"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">Firma</label>
                  <input type="text" bind:value={extCompany} placeholder="Musterfirma GmbH"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
                <div>
                  <label class="block text-xs text-muted mb-1">USt-ID</label>
                  <input type="text" bind:value={extVat} placeholder="DE123456789"
                    class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted focus:outline-none focus:border-gold/50" />
                </div>
              </div>
              <button onclick={() => (externalMode = false)} class="text-xs text-muted hover:text-light">← Zurück zur Client-Auswahl</button>
            </div>
          {/if}
        </div>

        <!-- Service + quantity -->
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Leistung</label>
            <select
              bind:value={selectedKey}
              class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light focus:outline-none focus:border-gold/50"
            >
              {#each serviceOptions as s (s.key)}
                <option value={s.key}>{s.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Menge</label>
            <input
              type="number"
              min="1"
              bind:value={quantity}
              class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light text-center focus:outline-none focus:border-gold/50"
            />
          </div>
        </div>

        <!-- Amount preview -->
        <div class="flex items-center justify-between px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter">
          <span class="text-sm text-muted">Gesamtbetrag</span>
          <span class="text-xl font-bold text-gold">{fmtTotal}</span>
        </div>

        <!-- Notes -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Interne Notiz (optional)</label>
          <textarea
            bind:value={notes}
            rows={2}
            placeholder="z.B. Session vom 18.04.2026"
            class="w-full px-3 py-2 bg-dark-light border border-dark-lighter rounded-lg text-sm text-light placeholder:text-muted resize-none focus:outline-none focus:border-gold/50"
          ></textarea>
        </div>

        <!-- Send email toggle -->
        <div class="flex items-center justify-between px-4 py-3 bg-dark-light rounded-xl border border-dark-lighter">
          <span class="text-sm text-light">E-Mail an Kunden senden</span>
          <button
            role="switch"
            aria-checked={sendEmail}
            onclick={() => (sendEmail = !sendEmail)}
            class={`relative w-10 h-6 rounded-full transition-colors ${sendEmail ? 'bg-gold' : 'bg-dark-lighter'}`}
          >
            <span class={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${sendEmail ? 'left-5' : 'left-1'}`}></span>
          </button>
        </div>

        <!-- Error / success -->
        {#if error}
          <div class="px-4 py-3 bg-red-900/30 border border-red-800 rounded-xl text-red-300 text-sm">{error}</div>
        {/if}
        {#if success}
          <div class="px-4 py-3 bg-green-900/30 border border-green-800 rounded-xl text-green-300 text-sm">{success}</div>
        {/if}

      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-dark-lighter flex gap-3 justify-end">
        <button onclick={closeModal} class="px-4 py-2 text-sm text-muted hover:text-light transition-colors">
          Abbrechen
        </button>
        <button
          onclick={submit}
          disabled={submitting}
          class="px-5 py-2 bg-gold text-dark text-sm font-semibold rounded-lg hover:bg-gold/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if submitting}
            Wird erstellt…
          {:else}
            {asQuote ? 'Angebot erstellen →' : 'Rechnung erstellen →'}
          {/if}
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 2.2 — Commit**

```bash
git add website/src/components/admin/CreateInvoiceModal.svelte
git commit -m "feat(admin): add CreateInvoiceModal Svelte component"
```

---

## Task 3: Wire up /admin/rechnungen

**Files:**
- Modify: `website/src/pages/admin/rechnungen.astro`

- [ ] **Step 3.1 — Add import and service options in frontmatter**

In the `---` frontmatter block, add after the existing imports:

```typescript
import CreateInvoiceModal from '../../components/admin/CreateInvoiceModal.svelte';
import { SERVICES } from '../../lib/stripe-billing';

const serviceOptions = Object.entries(SERVICES).map(([key, val]) => ({
  key,
  name: val.name,
  cents: val.cents,
}));
```

- [ ] **Step 3.2 — Replace the page header div with a flex layout including the button**

Find:
```astro
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-light font-serif">Rechnungen</h1>
        <p class="text-muted mt-1">{invoices.length} Rechnungen über alle Clients</p>
      </div>
```

Replace with:
```astro
      <div class="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold text-light font-serif">Rechnungen</h1>
          <p class="text-muted mt-1">{invoices.length} Rechnungen über alle Clients</p>
        </div>
        <CreateInvoiceModal {serviceOptions} client:load />
      </div>
```

- [ ] **Step 3.3 — Add reload listener script**

Before the closing `</AdminLayout>` tag, add:

```astro
<script>
  document.addEventListener('invoice-created', () => window.location.reload());
</script>
```

- [ ] **Step 3.4 — Manual smoke test**

1. Navigate to `https://web.mentolder.de/admin/rechnungen`
2. Verify "+ Neue Rechnung" button is visible top-right
3. Click it → modal should open
4. Select a service, choose a client from the dropdown
5. Click "Rechnung erstellen →"
6. Verify modal shows success message, then closes
7. Verify the new invoice appears in the table

- [ ] **Step 3.5 — Commit**

```bash
git add website/src/pages/admin/rechnungen.astro
git commit -m "feat(admin): add invoice creation button to rechnungen page"
```

---

## Task 4: Wire up InvoicesTab (client detail page)

**Files:**
- Modify: `website/src/components/portal/InvoicesTab.astro`

- [ ] **Step 4.1 — Add import and service options in frontmatter**

In the `---` frontmatter block of `InvoicesTab.astro`, add after the existing imports:

```typescript
import CreateInvoiceModal from '../admin/CreateInvoiceModal.svelte';
import { SERVICES } from '../../lib/stripe-billing';

const serviceOptions = Object.entries(SERVICES).map(([key, val]) => ({
  key,
  name: val.name,
  cents: val.cents,
}));
```

- [ ] **Step 4.2 — Replace the heading with a flex row including the button**

Find:
```astro
<div data-testid="invoices-tab">
  <h3 class="text-lg font-semibold text-light mb-4">Ihre Rechnungen</h3>
```

Replace with:
```astro
<div data-testid="invoices-tab">
  <div class="flex items-center justify-between mb-4">
    <h3 class="text-lg font-semibold text-light">Ihre Rechnungen</h3>
    <CreateInvoiceModal
      {serviceOptions}
      prefillEmail={clientEmail}
      buttonLabel="+ Rechnung stellen"
      buttonVariant="ghost"
      client:load
    />
  </div>
```

- [ ] **Step 4.3 — Add reload listener script**

At the bottom of `InvoicesTab.astro`, after all HTML, add:

```astro
<script>
  document.addEventListener('invoice-created', () => window.location.reload());
</script>
```

- [ ] **Step 4.4 — Manual smoke test**

1. Navigate to `https://web.mentolder.de/admin/clients` → click a client → "Rechnungen" tab
2. Verify "+ Rechnung stellen" ghost button appears next to the heading
3. Click it → modal opens with the client's email pre-filled and locked (no dropdown shown)
4. Pick a service, click "Rechnung erstellen →"
5. Verify success, modal closes, new invoice appears in the list

- [ ] **Step 4.5 — Commit**

```bash
git add website/src/components/portal/InvoicesTab.astro
git commit -m "feat(admin): add invoice creation button to client invoices tab"
```

---

## Task 5: Deploy

- [ ] **Step 5.1 — Run CI validation**

```bash
task workspace:validate
```

Expected: no errors.

- [ ] **Step 5.2 — Deploy to production**

```bash
task website:deploy
```

- [ ] **Step 5.3 — Final end-to-end check on live**

1. Open `https://web.mentolder.de/admin/rechnungen` — verify button present
2. Create a test invoice for `testuser1@mentolder.de` via the global modal
3. Verify it appears in the table with correct amount
4. Open the client detail page for Test User → Rechnungen tab
5. Verify the same invoice appears there too with "Bezahlt" / "Offen" status
6. Create a second invoice using the client-tab modal — verify it appears

- [ ] **Step 5.4 — Final commit if any small fixes were needed**

```bash
git add -p
git commit -m "fix(admin): post-deploy invoice UI adjustments"
```
