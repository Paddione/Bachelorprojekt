# Admin Settings Submenu

**Date:** 2026-04-20  
**Branch:** fix/seal-guard (to be implemented on a new feature branch)

## Overview

Extend the admin sidebar with a new collapsible **Einstellungen** group containing four sub-pages. Settings are stored in the existing `site_settings` table (brand + key → value) — no new tables or migrations required.

---

## Navigation

The sidebar gains a fifth group **Einstellungen** below **Website**, using the same collapsible group pattern as **Betrieb**. Four sub-pages:

| Sub-page | Path |
|---|---|
| Benachrichtigungen | `/admin/einstellungen/benachrichtigungen` |
| E-Mail | `/admin/einstellungen/email` |
| Rechnungen & Zahlungen | `/admin/einstellungen/rechnungen` |
| Branding & Kontakt | `/admin/einstellungen/branding` |

`AdminLayout.astro` gets the new nav group. Each sub-page is a standard Astro page under `src/pages/admin/einstellungen/`.

---

## Data Storage

All settings use the existing `site_settings` table via `getSiteSetting(brand, key)` / `setSiteSetting(brand, key, value)`. Default brand: `mentolder` → `info@mentolder.de` as notification address.

### Keys per category

**Benachrichtigungen**
| Key | Default (mentolder) | Type |
|---|---|---|
| `notification_email` | `info@mentolder.de` | string |
| `notify_registration` | `true` | boolean string |
| `notify_booking` | `true` | boolean string |
| `notify_contact` | `true` | boolean string |
| `notify_bug` | `true` | boolean string |
| `notify_message` | `true` | boolean string |
| `notify_followup` | `false` | boolean string |

**E-Mail**
| Key | Default | Type |
|---|---|---|
| `email_from_name` | `mentolder Coaching` | string |
| `email_from_address` | `noreply@mentolder.de` | string |

> SMTP host/port/credentials remain as env vars (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).

**Rechnungen & Zahlungen**
| Key | Default | Type |
|---|---|---|
| `invoice_prefix` | `RE-` | string |
| `invoice_payment_days` | `14` | number string |
| `invoice_tax_rate` | `19` | number string |
| `invoice_sender_name` | `` | string |
| `invoice_sender_street` | `` | string |
| `invoice_sender_city` | `` | string |
| `invoice_bank_iban` | `` | string |
| `invoice_bank_bic` | `` | string |
| `invoice_bank_name` | `` | string |

**Branding & Kontakt**
| Key | Default | Type |
|---|---|---|
| `brand_name` | `mentolder` | string |
| `brand_contact_email` | `info@mentolder.de` | string |
| `brand_phone` | `` | string |
| `brand_logo_url` | `` | string |
| `brand_social_linkedin` | `` | string |
| `brand_social_instagram` | `` | string |

---

## Pages

Each settings page is a standard Astro page:
- Loads current values via `getSiteSetting()` on the server at request time
- Renders a form with labeled inputs
- Submits via `POST` to a corresponding API route

### Benachrichtigungen (`/admin/einstellungen/benachrichtigungen`)

- Single `<input>` for `notification_email`
- Toggle (checkbox rendered as pill) per event type: Registrierung, Buchung, Kontaktformular, Bug, Nachricht, Follow-up
- `POST /api/admin/einstellungen/benachrichtigungen`

### E-Mail (`/admin/einstellungen/email`)

- `email_from_name` text input
- `email_from_address` email input
- `POST /api/admin/einstellungen/email`

### Rechnungen & Zahlungen (`/admin/einstellungen/rechnungen`)

- Prefix, Zahlungsziel, Steuersatz in a two-column grid
- Rechnungsabsender: Name, Straße, PLZ+Ort
- Bankverbindung: IBAN, BIC, Bank
- `POST /api/admin/einstellungen/rechnungen`

### Branding & Kontakt (`/admin/einstellungen/branding`)

- Markenname, Kontakt-E-Mail, Telefon in three-column grid
- Logo-URL single input
- Social Media: LinkedIn + Instagram
- `POST /api/admin/einstellungen/branding`

---

## API Routes

Four POST endpoints under `src/pages/api/admin/einstellungen/`:

```
benachrichtigungen.ts   → saves notification_email + notify_* keys
email.ts                → saves email_from_name, email_from_address
rechnungen.ts           → saves invoice_* keys
branding.ts             → saves brand_* keys
```

Each route:
1. Reads form body
2. Validates (non-empty required fields, valid email format where applicable)
3. Calls `setSiteSetting(brand, key, value)` for each field
4. Returns `{ success: true }` or `{ error: string }`

---

## Integration with Existing Email Logic

`src/lib/email.ts` currently reads `FROM_EMAIL` / `FROM_NAME` from env. After this feature:

- `sendEmail()` reads `email_from_name` and `email_from_address` from `site_settings`, falling back to env vars if not set.
- Notification-sending code (registrations, contact, bugs, bookings, messages, follow-ups) reads `notification_email` and the relevant `notify_*` toggle before sending admin notifications. If toggle is `false`, skip sending.

---

## Files to Create / Modify

**New files:**
- `src/pages/admin/einstellungen/benachrichtigungen.astro`
- `src/pages/admin/einstellungen/email.astro`
- `src/pages/admin/einstellungen/rechnungen.astro`
- `src/pages/admin/einstellungen/branding.astro`
- `src/pages/api/admin/einstellungen/benachrichtigungen.ts`
- `src/pages/api/admin/einstellungen/email.ts`
- `src/pages/api/admin/einstellungen/rechnungen.ts`
- `src/pages/api/admin/einstellungen/branding.ts`

**Modified files:**
- `src/layouts/AdminLayout.astro` — add Einstellungen nav group
- `src/lib/email.ts` — read from_name/from_address from DB with env fallback
- `src/lib/notifications.ts` *(new helper)* — centralised `sendAdminNotification()` that checks `notification_email` + toggle before sending; existing notification calls migrate to use this

---

## Out of Scope

- SMTP host/port/credentials in the UI (security risk, stays as env vars)
- Buchungen & Termine settings (not requested)
- Wartungsmodus (not requested)
- Multi-recipient notification lists
