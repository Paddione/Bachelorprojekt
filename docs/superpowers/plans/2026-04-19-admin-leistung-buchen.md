# Admin: Leistung für Nutzer buchen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin kann im Client-Detail-Tab und auf der Termine-Seite manuell eine Leistungsbuchung für einen Nutzer anlegen, die als inbox_items-Eintrag landet und eine Bestätigungs-E-Mail an den Client sendet.

**Architecture:** Shared Svelte 5 modal `AdminBookingModal.svelte` mit Props für vorausgefüllten Client oder Client-Dropdown. Neuer Admin-only API-Endpoint `/api/admin/bookings/create` spiegelt die Logik von `/api/booking.ts`, fügt `adminCreated: true` zum Payload hinzu und schützt mit isAdmin()-Guard. Zwei Einstiegspunkte: Tab in `/admin/[clientId]` und Button in `/admin/termine`.

**Tech Stack:** Astro 5, Svelte 5 (Runes: $state, $derived, $props), TypeScript, PostgreSQL (via website-db.ts), CalDAV (slot check), Mailpit (email)

---

## File Map

| Datei | Aktion | Zweck |
|-------|--------|-------|
| `website/src/pages/api/admin/bookings/create.ts` | **Neu** | Admin-only Booking-Endpoint |
| `website/src/components/admin/AdminBookingModal.svelte` | **Neu** | Shared Modal-Komponente |
| `website/src/pages/admin/[clientId].astro` | **Ändern** | Neuer Tab "Leistung buchen" |
| `website/src/pages/admin/termine.astro` | **Ändern** | Button "＋ Manuelle Buchung" |

---

## Task 1: API-Endpoint `/api/admin/bookings/create.ts`

**Files:**
- Create: `website/src/pages/api/admin/bookings/create.ts`

- [ ] **Step 1: Datei anlegen**

```typescript
// website/src/pages/api/admin/bookings/create.ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { isSlotWhitelisted } from '../../../../lib/website-db';
import { createInboxItem } from '../../../../lib/messaging-db';
import { sendEmail } from '../../../../lib/email';

const BRAND_NAME = process.env.BRAND_NAME || 'Workspace';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

const TYPE_LABELS: Record<string, string> = {
  erstgespraech: 'Kostenloses Erstgespräch',
  callback: 'Rückruf',
  meeting: 'Online-Meeting',
  termin: 'Termin vor Ort',
};

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  try {
    const {
      clientEmail, clientName,
      type, leistungKey, projectId,
      slotStart, slotEnd, slotDisplay, date,
      phone, message,
    } = await request.json();

    const isCallback = type === 'callback';

    if (!clientEmail?.trim() || !clientName?.trim()) {
      return new Response(JSON.stringify({ error: 'clientEmail und clientName sind Pflichtfelder.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!type || !leistungKey?.trim()) {
      return new Response(JSON.stringify({ error: 'Typ und Leistung sind Pflichtfelder.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!isCallback && (!slotStart || !slotEnd)) {
      return new Response(JSON.stringify({ error: 'Bitte einen Termin wählen.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (isCallback && !phone?.trim()) {
      return new Response(JSON.stringify({ error: 'Telefonnummer ist bei Rückruf Pflicht.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (!isCallback && slotStart) {
      const whitelisted = await isSlotWhitelisted(BRAND_NAME, new Date(slotStart));
      if (!whitelisted) {
        return new Response(JSON.stringify({ error: 'Dieser Slot ist nicht freigegeben.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
    }

    const typeLabel = TYPE_LABELS[type] || type;
    const dateFormatted = date
      ? new Date(date + 'T00:00:00').toLocaleDateString('de-DE', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        })
      : '';

    await createInboxItem({
      type: 'booking',
      payload: {
        name: clientName,
        email: clientEmail,
        phone: phone ?? null,
        type,
        typeLabel,
        slotStart: slotStart ?? null,
        slotEnd: slotEnd ?? null,
        slotDisplay: slotDisplay ?? null,
        date: date ?? null,
        serviceKey: leistungKey,
        leistungKey,
        message: message ?? null,
        projectId: projectId ?? null,
        adminCreated: true,
      },
    });

    await sendEmail({
      to: clientEmail,
      subject: isCallback
        ? `Rückruf-Anfrage bei ${BRAND_NAME}`
        : `Terminbuchung: ${typeLabel} am ${dateFormatted}`,
      text: isCallback
        ? `Hallo ${clientName},\n\nIhr Termin wurde vom Admin eingetragen.\n\nWir melden uns in Kürze unter ${phone} bei Ihnen.\n\nMit freundlichen Grüßen\n${BRAND_NAME}`
        : `Hallo ${clientName},\n\nIhr Termin wurde vom Admin eingetragen.\n\nTyp:     ${typeLabel}\nDatum:   ${dateFormatted}\nUhrzeit: ${slotDisplay}\n\nMit freundlichen Grüßen\n${BRAND_NAME}`,
    });

    if (CONTACT_EMAIL) {
      await sendEmail({
        to: CONTACT_EMAIL,
        subject: isCallback
          ? `[Admin-Buchung/Rückruf] ${clientName}`
          : `[Admin-Buchung: ${typeLabel}] ${clientName} am ${dateFormatted}`,
        replyTo: clientEmail,
        text: isCallback
          ? `Admin-Buchung für ${clientName} (${clientEmail}).\nTyp: Rückruf\nTelefon: ${phone}${message ? `\n\nNachricht:\n${message}` : ''}`
          : `Admin-Buchung für ${clientName} (${clientEmail}).\nTyp: ${typeLabel}\nDatum: ${dateFormatted}\nUhrzeit: ${slotDisplay}\nLeistung: ${leistungKey}${projectId ? `\nProjekt-ID: ${projectId}` : ''}${message ? `\n\nNachricht:\n${message}` : ''}`,
      });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[api/admin/bookings/create]', err);
    return new Response(JSON.stringify({ error: 'Interner Serverfehler.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
```

- [ ] **Step 2: TypeScript-Fehler prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "bookings/create"
```
Erwartet: keine Ausgabe (keine Fehler)

- [ ] **Step 3: Endpoint manuell testen (401 ohne Session)**

```bash
curl -s -X POST http://web.localhost/api/admin/bookings/create \
  -H "Content-Type: application/json" \
  -d '{"clientEmail":"test@example.com","clientName":"Test","type":"meeting","leistungKey":"coaching-session","slotStart":"2026-05-01T10:00:00Z","slotEnd":"2026-05-01T11:00:00Z"}' \
  | jq .
```
Erwartet: `{"error":"Unauthorized"}` mit HTTP 401

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/bookings/create.ts
git commit -m "feat: add /api/admin/bookings/create endpoint"
```

---

## Task 2: `AdminBookingModal.svelte` Komponente

**Files:**
- Create: `website/src/components/admin/AdminBookingModal.svelte`

Orientiert sich an `CreateInvoiceModal.svelte` (Svelte 5 Runes, dunkles Theme, Gold-Akzente).

- [ ] **Step 1: Interfaces und State definieren**

```svelte
<!-- website/src/components/admin/AdminBookingModal.svelte -->
<script lang="ts">
  interface Leistung {
    key: string;
    name: string;
    category: string;
  }

  interface TimeSlot {
    start: string;
    end: string;
    display: string;
  }

  interface DaySlots {
    date: string;
    weekday: string;
    slots: TimeSlot[];
  }

  interface Project {
    id: string;
    name: string;
  }

  interface ClientOption {
    id: string;
    name: string;
    email: string;
  }

  let {
    prefillEmail = '',
    prefillName = '',
    projects = [],
    buttonLabel = '＋ Leistung buchen',
    buttonVariant = 'primary',
  }: {
    prefillEmail?: string;
    prefillName?: string;
    projects?: Project[];
    buttonLabel?: string;
    buttonVariant?: 'primary' | 'ghost';
  } = $props();

  const isPrefilled = $derived(!!prefillEmail);

  // ── Modal ──────────────────────────────────────────────────────────────────
  let open = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let success = $state('');

  // ── Client (nur wenn kein prefill) ────────────────────────────────────────
  let clients = $state<ClientOption[]>([]);
  let clientsLoaded = $state(false);
  let clientSearch = $state('');
  let selectedClient = $state<ClientOption | null>(null);

  const filteredClients = $derived(
    clientSearch.length < 1
      ? clients
      : clients.filter(
          c =>
            c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
            c.email.toLowerCase().includes(clientSearch.toLowerCase())
        )
  );

  // ── Form fields ───────────────────────────────────────────────────────────
  let bookingType = $state<'erstgespraech' | 'callback' | 'meeting' | 'termin'>('erstgespraech');
  let leistungKey = $state('');
  let projectId = $state('');
  let phone = $state('');
  let message = $state('');

  // ── Leistungen ────────────────────────────────────────────────────────────
  let leistungen = $state<Leistung[]>([]);
  let leistungenLoaded = $state(false);

  // ── Slots ─────────────────────────────────────────────────────────────────
  let selectedDate = $state('');
  let daySlots = $state<DaySlots[]>([]);
  let slotsLoaded = $state(false);
  let slotsError = $state('');
  let selectedSlot = $state<TimeSlot | null>(null);

  const isCallback = $derived(bookingType === 'callback');

  const slotsForDate = $derived(
    daySlots.find(d => d.date === selectedDate)?.slots ?? []
  );

  const availableDates = $derived(
    daySlots.filter(d => d.slots.length > 0).map(d => d.date)
  );
</script>
```

- [ ] **Step 2: Hilfsfunktionen und openModal/close**

```svelte
<script lang="ts">
  // ... (vorheriger Code) ...

  async function openModal() {
    open = true;
    error = '';
    success = '';
    resetForm();
    if (!leistungenLoaded) loadLeistungen();
    if (!slotsLoaded) loadSlots();
    if (!isPrefilled && !clientsLoaded) loadClients();
  }

  function closeModal() {
    if (submitting) return;
    open = false;
  }

  function resetForm() {
    bookingType = 'erstgespraech';
    leistungKey = '';
    projectId = '';
    phone = '';
    message = '';
    selectedDate = '';
    selectedSlot = null;
    clientSearch = '';
    selectedClient = isPrefilled
      ? { id: '', name: prefillName || prefillEmail, email: prefillEmail }
      : null;
    error = '';
    success = '';
  }

  async function loadLeistungen() {
    try {
      const res = await fetch('/api/leistungen');
      if (res.ok) leistungen = await res.json();
    } catch {
      // Dropdown bleibt leer
    } finally {
      leistungenLoaded = true;
    }
  }

  async function loadSlots() {
    slotsError = '';
    try {
      const res = await fetch('/api/calendar/slots');
      if (res.ok) {
        daySlots = await res.json();
        if (daySlots.length > 0 && availableDates.length > 0) {
          selectedDate = availableDates[0];
        }
      }
    } catch {
      slotsError = 'Slots konnten nicht geladen werden.';
    } finally {
      slotsLoaded = true;
    }
  }

  async function loadClients() {
    try {
      const res = await fetch('/api/admin/clients-list');
      if (res.ok) clients = await res.json();
    } catch {
      // Combobox bleibt leer
    } finally {
      clientsLoaded = true;
    }
  }

  async function submit() {
    error = '';
    const clientEmail = isPrefilled ? prefillEmail : (selectedClient?.email ?? '');
    const clientName  = isPrefilled ? (prefillName || prefillEmail) : (selectedClient?.name ?? '');

    if (!clientEmail) { error = 'Bitte einen Client auswählen.'; return; }
    if (!leistungKey)  { error = 'Bitte eine Leistung auswählen.'; return; }
    if (!isCallback && !selectedSlot) { error = 'Bitte einen Termin wählen.'; return; }
    if (isCallback && !phone.trim())  { error = 'Telefonnummer erforderlich.'; return; }

    submitting = true;
    try {
      const body: Record<string, unknown> = {
        clientEmail,
        clientName,
        type: bookingType,
        leistungKey,
        projectId: projectId || null,
        slotStart: selectedSlot?.start ?? null,
        slotEnd: selectedSlot?.end ?? null,
        slotDisplay: selectedSlot?.display ?? null,
        date: selectedDate || null,
        phone: phone || null,
        message: message || null,
      };

      const res = await fetch('/api/admin/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        error = data.error ?? 'Unbekannter Fehler.';
        submitting = false;
        return;
      }

      success = 'Buchung erfolgreich angelegt.';
      document.dispatchEvent(new CustomEvent('admin-booking-created'));
      setTimeout(() => closeModal(), 1500);
    } catch {
      error = 'Netzwerkfehler. Bitte erneut versuchen.';
      submitting = false;
    }
  }
</script>
```

- [ ] **Step 3: Template — Trigger-Button**

```svelte
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
```

- [ ] **Step 4: Template — Modal Overlay**

```svelte
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
          Leistung buchen{isPrefilled ? ` für ${prefillName || prefillEmail}` : ''}
        </h2>
        <button onclick={closeModal} class="text-muted hover:text-light transition-colors text-xl leading-none">✕</button>
      </div>

      <div class="px-6 py-5 space-y-4 max-h-[80vh] overflow-y-auto">

        <!-- Error / Success -->
        {#if error}
          <div class="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        {/if}
        {#if success}
          <div class="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">{success}</div>
        {/if}

        <!-- Client (nur wenn kein prefill) -->
        {#if !isPrefilled}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Client</label>
            {#if selectedClient}
              <div class="flex items-center gap-2 px-3 py-2 bg-dark-light border border-gold/40 rounded-lg text-sm">
                <span class="text-light flex-1">{selectedClient.name} <span class="text-muted">· {selectedClient.email}</span></span>
                <button onclick={() => { selectedClient = null; clientSearch = ''; }} class="text-muted hover:text-light text-xs">✕</button>
              </div>
            {:else}
              <input
                type="text"
                placeholder="Name oder E-Mail suchen…"
                bind:value={clientSearch}
                class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
              />
              {#if clientSearch.length > 0 && filteredClients.length > 0}
                <div class="mt-1 bg-dark border border-dark-lighter rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                  {#each filteredClients as c}
                    <button
                      onclick={() => { selectedClient = c; clientSearch = ''; }}
                      class="w-full text-left px-3 py-2 text-sm text-light hover:bg-dark-light transition-colors"
                    >
                      {c.name} <span class="text-muted">· {c.email}</span>
                    </button>
                  {/each}
                </div>
              {/if}
            {/if}
          </div>
        {/if}

        <!-- Typ -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Typ</label>
          <select
            bind:value={bookingType}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          >
            <option value="erstgespraech">Kostenloses Erstgespräch</option>
            <option value="meeting">Online-Meeting</option>
            <option value="termin">Termin vor Ort</option>
            <option value="callback">Rückruf</option>
          </select>
        </div>

        <!-- Leistung -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Leistung</label>
          <select
            bind:value={leistungKey}
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
          >
            <option value="">— Bitte wählen —</option>
            {#each leistungen as l}
              <option value={l.key}>{l.category} · {l.name}</option>
            {/each}
          </select>
        </div>

        <!-- Projekt (optional) -->
        {#if projects.length > 0}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Projekt <span class="normal-case text-muted/60">(optional)</span></label>
            <select
              bind:value={projectId}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
            >
              <option value="">— Kein Projekt —</option>
              {#each projects as p}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <!-- Termin (nicht bei Rückruf) -->
        {#if !isCallback}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Datum</label>
            {#if !slotsLoaded}
              <p class="text-sm text-muted">Lade Slots…</p>
            {:else if slotsError}
              <p class="text-sm text-red-400">{slotsError}</p>
            {:else if availableDates.length === 0}
              <p class="text-sm text-muted">Keine freien Slots verfügbar.</p>
            {:else}
              <select
                bind:value={selectedDate}
                onchange={() => { selectedSlot = null; }}
                class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
              >
                {#each daySlots.filter(d => d.slots.length > 0) as d}
                  <option value={d.date}>{d.weekday}, {d.date}</option>
                {/each}
              </select>
            {/if}
          </div>

          {#if selectedDate && slotsForDate.length > 0}
            <div>
              <label class="block text-xs text-muted uppercase tracking-wide mb-1">Uhrzeit</label>
              <div class="flex flex-wrap gap-2">
                {#each slotsForDate as slot}
                  <button
                    onclick={() => { selectedSlot = slot; }}
                    class={`px-3 py-1.5 rounded-lg text-sm transition-colors ${selectedSlot?.start === slot.start ? 'bg-gold text-dark font-semibold' : 'bg-dark-light border border-dark-lighter text-light hover:border-gold/40'}`}
                  >
                    {slot.display}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        {/if}

        <!-- Telefon (nur Rückruf) -->
        {#if isCallback}
          <div>
            <label class="block text-xs text-muted uppercase tracking-wide mb-1">Telefon</label>
            <input
              type="tel"
              placeholder="+49 151 …"
              bind:value={phone}
              class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none"
            />
          </div>
        {/if}

        <!-- Nachricht -->
        <div>
          <label class="block text-xs text-muted uppercase tracking-wide mb-1">Nachricht <span class="normal-case text-muted/60">(optional)</span></label>
          <textarea
            bind:value={message}
            rows="3"
            placeholder="Interne Notiz oder Nachricht an den Client…"
            class="w-full bg-dark border border-dark-lighter rounded-lg px-3 py-2 text-light text-sm focus:border-gold outline-none resize-none"
          ></textarea>
        </div>

      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 px-6 py-4 border-t border-dark-lighter">
        <button
          onclick={closeModal}
          disabled={submitting}
          class="px-4 py-2 text-sm text-muted hover:text-light transition-colors disabled:opacity-50"
        >
          Abbrechen
        </button>
        <button
          onclick={submit}
          disabled={submitting}
          class="px-5 py-2 bg-gold text-dark rounded-lg text-sm font-semibold hover:bg-gold/80 transition-colors disabled:opacity-50"
        >
          {submitting ? '…' : 'Buchung anlegen'}
        </button>
      </div>

    </div>
  </div>
{/if}
```

- [ ] **Step 5: TypeScript-Fehler prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep "AdminBookingModal"
```
Erwartet: keine Ausgabe

- [ ] **Step 6: Commit**

```bash
git add website/src/components/admin/AdminBookingModal.svelte
git commit -m "feat: add AdminBookingModal svelte component"
```

---

## Task 3: Integration in `/admin/[clientId].astro`

**Files:**
- Modify: `website/src/pages/admin/[clientId].astro`

- [ ] **Step 1: Import hinzufügen**

In `website/src/pages/admin/[clientId].astro`, nach den bestehenden Imports (ca. Zeile 12), einfügen:

```astro
import AdminBookingModal from '../../components/admin/AdminBookingModal.svelte';
```

Und `listProjects` aus website-db importieren (falls noch nicht vorhanden):

```astro
import { listProjects } from '../../lib/website-db';
```

- [ ] **Step 2: Projekte laden**

Im Frontmatter nach dem `let userRoleIds`-Block (ca. Zeile 41), einfügen:

```typescript
const brand = process.env.BRAND_NAME || 'mentolder';
let clientProjects: { id: string; name: string }[] = [];
try {
  const allProjects = await listProjects({ brand });
  clientProjects = allProjects
    .filter(p => p.customerEmail === client.email)
    .map(p => ({ id: p.id, name: p.name }));
} catch {
  // Projekte-Dropdown bleibt leer
}
```

- [ ] **Step 3: Tab-Navigation erweitern**

In der Tab-Navigation (ca. Zeile 141), das Array um `{ id: 'book', label: 'Leistung buchen' }` ergänzen:

```astro
{[
  { id: 'bookings', label: 'Termine' },
  { id: 'invoices', label: 'Rechnungen' },
  { id: 'notes', label: 'Notizen' },
  { id: 'files', label: 'Dateien' },
  { id: 'signatures', label: 'Zur Unterschrift' },
  { id: 'meetings', label: 'Besprechungen' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'book', label: 'Leistung buchen' },
].map(t => (
```

- [ ] **Step 4: Tab-Content hinzufügen**

Im Tab-Content-Block (ca. Zeile 164), nach dem letzten `{tab === 'onboarding' && ...}`, einfügen:

```astro
{tab === 'book' && (
  <div>
    <p class="text-sm text-muted mb-4">
      Legt eine Buchung direkt für {client.firstName ?? client.username} an — landet in der Inbox und sendet eine Bestätigungs-E-Mail.
    </p>
    <AdminBookingModal
      client:load
      prefillEmail={client.email ?? ''}
      prefillName={`${client.firstName ?? ''} ${client.lastName ?? ''}`.trim()}
      projects={clientProjects}
      buttonLabel="Buchung anlegen"
    />
  </div>
)}
```

- [ ] **Step 5: Visuell prüfen**

Dev-Server starten und `/admin/<clientId>?tab=book` aufrufen:

```bash
cd website && npm run dev
```

Prüfen:
- Tab "Leistung buchen" erscheint in der Tab-Navigation
- Klick auf den Tab zeigt Erklärungstext + Button
- Klick auf Button öffnet Modal
- Modal zeigt Typ, Leistung-Dropdown (lädt via API), Projekt-Dropdown, Slot-Picker
- Kein JS-Fehler in der Browser-Konsole

- [ ] **Step 6: Commit**

```bash
git add website/src/pages/admin/[clientId].astro
git commit -m "feat: add 'Leistung buchen' tab to admin client detail"
```

---

## Task 4: Integration in `/admin/termine.astro`

**Files:**
- Modify: `website/src/pages/admin/termine.astro`

- [ ] **Step 1: Import hinzufügen**

In `website/src/pages/admin/termine.astro`, nach den bestehenden Imports in der Frontmatter (ca. Zeile 9), einfügen:

```astro
import AdminBookingModal from '../../components/admin/AdminBookingModal.svelte';
```

- [ ] **Step 2: Button in Header einfügen**

Im Header-Block (ca. Zeile 89 — das `<div class="flex gap-3">` mit dem "Nextcloud Kalender →"-Link), den Button vor dem Nextcloud-Link einfügen:

```astro
<div class="flex gap-3">
  <AdminBookingModal
    client:load
    projects={projects.map(p => ({ id: p.id, name: p.name }))}
    buttonLabel="＋ Manuelle Buchung"
  />
  <a
    href={calendarUrl}
    target="_blank"
    rel="noopener noreferrer"
    class="px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm font-medium hover:bg-gold/30 transition-colors"
  >
    Nextcloud Kalender →
  </a>
</div>
```

Im Modus ohne `prefillEmail` zeigt das Modal ein Client-Combobox-Dropdown (lädt via `/api/admin/clients-list` — bereits in `CreateInvoiceModal` genutzt, also vorhanden).

- [ ] **Step 3: Visuell prüfen**

```bash
# Dev-Server läuft bereits aus Task 3, sonst:
cd website && npm run dev
```

Auf `/admin/termine` prüfen:
- Button "＋ Manuelle Buchung" erscheint oben rechts neben "Nextcloud Kalender →"
- Modal öffnet sich mit Client-Suchfeld
- Eingabe in Suchfeld filtert Clients
- Client auswählen → Leistung, Typ, Slots wählbar
- Formular abschicken → Erfolgsmeldung → Modal schließt sich
- Inbox unter `/admin/inbox` zeigt neuen Eintrag mit Admin-Buchung

- [ ] **Step 4: E-Mail-Empfang prüfen**

Mailpit aufrufen (z.B. `http://mail.localhost`):
- Bestätigungs-E-Mail an clientEmail vorhanden
- Admin-Notification-E-Mail an CONTACT_EMAIL vorhanden

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/admin/termine.astro
git commit -m "feat: add manual booking button to admin/termine"
```

---

## Task 5: Deployment

- [ ] **Step 1: Website deployen**

```bash
task website:deploy
```

- [ ] **Step 2: Live-Smoke-Test**

- `/admin/<clientId>?tab=book` aufrufen: Tab sichtbar, Modal funktioniert
- `/admin/termine`: Button sichtbar, Modal mit Client-Dropdown funktioniert
- Buchung anlegen → Inbox-Eintrag vorhanden → E-Mail in Mailpit

- [ ] **Step 3: Final Commit (falls nötig)**

```bash
git status
# Falls noch unstaged:
git add -p
git commit -m "chore: final cleanup after admin booking feature"
```
