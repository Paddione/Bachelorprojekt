# Design: Invoice Create UI

**Date:** 2026-04-18  
**Status:** Approved

## Overview

Add a "Rechnung erstellen" UI to the admin so invoices and quotes can be created directly from the browser — without calling the API manually. The backend API (`POST /api/billing/create-invoice`) already exists and is working. This spec covers only the frontend and one new helper API endpoint.

## Scope

Two entry points, one shared Svelte modal component:

1. **Global entry** — `+ Neue Rechnung` button on `/admin/rechnungen`, full form including customer selection
2. **Client-context entry** — `+ Rechnung stellen` button in `InvoicesTab` on the client detail page, customer pre-filled

## New Files

### `website/src/components/admin/CreateInvoiceModal.svelte`

A Svelte component (client-side island) that renders a full-screen overlay modal. It manages all form state and calls `POST /api/billing/create-invoice`.

**Props:**
- `prefillEmail?: string` — if provided, customer selection is locked to this email (client-context mode); the customer dropdown is hidden and replaced with the pre-filled name/email display
- `buttonLabel?: string` — label for the trigger button (default: `"+ Neue Rechnung"`)
- `buttonVariant?: 'primary' | 'ghost'` — `primary` = gold filled (for rechnungen page), `ghost` = gold outline (for client tab)

The component renders both the trigger button and the modal overlay. The `open` state is managed entirely inside the component — no prop needed. This is required because Astro cannot update Svelte island props after server render.

**Form fields:**

| Field | Type | Notes |
|---|---|---|
| Rechnung / Angebot | Toggle (tab-style) | Sets `asQuote` in API payload |
| Kunde | Combobox search | Queries `GET /api/admin/clients-list`, filters client-side by name/email |
| Externer Kunde | Toggle (expands fields) | Shows Name, E-Mail, Firma, Adresse, USt-ID fields |
| Leistung | `<select>` | All keys from `SERVICES` in `stripe-billing.ts` |
| Menge | Number input | Min 1, default 1 |
| Gesamtbetrag | Read-only preview | Computed: `service.cents × qty / 100` formatted as EUR |
| Interne Notiz | Textarea (optional) | Maps to `notes` in API |
| E-Mail senden | Toggle | Default on; maps to `sendEmail` in API |

**Behavior:**
- Submit calls `POST /api/billing/create-invoice`
- On success: emits a `created` custom event (parent reloads list or appends row), modal closes
- On error: shows inline error message inside modal, does not close
- Loading state: button shows spinner, inputs disabled

### `website/src/pages/api/admin/clients-list.ts`

`GET` endpoint — returns all Keycloak users as `{ id, name, email }[]`. Used by the Svelte combobox to populate and filter the client dropdown.

- Requires admin session (same auth check as other admin API routes)
- Calls existing `listUsers()` from `../../lib/keycloak`
- Returns 200 with JSON array, or 403 if not admin

## Changed Files

### `website/src/pages/admin/rechnungen.astro`

- Add `<CreateInvoiceModal client:load />` in the page header (right side, next to the "Rechnungen" title)
- The component renders the `+ Neue Rechnung` button itself (gold filled, `buttonVariant="primary"`)
- On `created` custom event dispatched by the component: `window.location.reload()`

### `website/src/components/portal/InvoicesTab.astro`

- Add `<CreateInvoiceModal client:load prefillEmail={clientEmail} buttonLabel="+ Rechnung stellen" buttonVariant="ghost" />` next to the "Ihre Rechnungen" heading
- On `created` custom event: `window.location.reload()`

## Data Flow

```
Admin clicks "+ Neue Rechnung"
  → modal opens
  → types in combobox → GET /api/admin/clients-list (once, cached in component state)
  → selects client (or toggles "Externer Kunde" → fills freetext)
  → selects service → Gesamtbetrag updates live
  → clicks "Rechnung erstellen"
  → POST /api/billing/create-invoice
    → getOrCreateCustomer() → Stripe
    → createBillingInvoice() or createBillingQuote() → Stripe
  → modal emits 'created' → page reloads → new row appears in table
```

## Error Handling

- `GET /api/admin/clients-list` failure: combobox shows "Clients konnten nicht geladen werden" with retry link; freetext mode still available
- `POST /api/billing/create-invoice` failure: red inline error inside modal; modal stays open; user can retry
- Stripe key not configured (dev env): API returns 502; modal shows "Stripe nicht konfiguriert"

## Design Details

- Modal follows existing admin dark-theme design system (bg-dark, gold accent, rounded-xl, border-dark-lighter)
- Rechnung/Angebot switcher is a pill-style tab at the top of the modal (same pattern as status filter tabs on rechnungen.astro)
- Gesamtbetrag preview uses `bg-dark-light` card with gold amount text
- E-Mail toggle uses the same toggle style as existing admin toggles
- Mobile: modal takes full width with `max-w-xl mx-auto`

## Out of Scope

- Multi-line invoices (multiple services per invoice) — single line item only
- PDF preview before sending
- Editing existing invoices (Stripe invoices are immutable after finalization)
- Void/refund actions (handled in Stripe dashboard via existing "Stripe ↗" link)
