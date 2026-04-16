# Slot-Whitelist für Terminbuchung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin muss Terminslots explizit freigeben, bevor Kunden sie buchen können (Whitelist-Modell). Nicht freigegebene Slots erscheinen im Admin-Panel ausgegraut mit "Freigeben"-Button; freigegebene gold mit "×"-Button.

**Architecture:** Neue `slot_whitelist` PostgreSQL-Tabelle speichert freigegebene Slots per `brand`. `getAvailableSlots()` in `caldav.ts` filtert zusätzlich auf Whitelist-Einträge wenn ein `brand`-Parameter übergeben wird. Zwei Admin-API-Endpoints (POST/DELETE) verwalten die Whitelist. Die Booking-API validiert Whitelist-Zugehörigkeit vor dem Akzeptieren.

**Tech Stack:** TypeScript, Astro, PostgreSQL (`pg`), inline fetch + DOM-Update für Admin-Toggle (kein Svelte nötig).

---

## File Map

| Datei | Aktion | Verantwortung |
|-------|--------|---------------|
| `website/src/lib/website-db.ts` | Modify (Ende anfügen) | `slot_whitelist`-Tabelle + CRUD-Funktionen |
| `website/src/lib/caldav.ts` | Modify | `getAvailableSlots()` mit optionalem `brand`-Parameter |
| `website/src/pages/api/calendar/slots.ts` | Modify | `brand` an `getAvailableSlots()` übergeben |
| `website/src/pages/api/admin/slots/add.ts` | Create | POST-Endpoint: Slot zur Whitelist hinzufügen |
| `website/src/pages/api/admin/slots/remove.ts` | Create | DELETE-Endpoint: Slot aus Whitelist entfernen |
| `website/src/pages/api/booking.ts` | Modify | Whitelist-Validierung vor Buchungsannahme |
| `website/src/pages/admin/termine.astro` | Modify | Toggle-UI mit freigegebenen/gesperrten Slots |
| `website/tests/api.test.mjs` | Modify | Tests für neue Endpoints + aktualisierter Booking-Test |
| `tests/e2e/specs/fa-16-booking.spec.ts` | Modify | T6 auf neue Whitelist-Semantik anpassen |

---

## Task 1: DB-Schicht — `slot_whitelist`-Tabelle und CRUD

**Files:**
- Modify: `website/src/lib/website-db.ts` (am Ende anfügen, nach Zeile 1636)

- [ ] **Schritt 1: Neuen Code an `website-db.ts` anfügen**

Am Ende der Datei (nach der letzten exportierten Funktion) einfügen:

```typescript
// ── Slot Whitelist ────────────────────────────────────────────────────────────

export interface WhitelistedSlot {
  slotStart: Date;
  slotEnd: Date;
}

async function initSlotWhitelistTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_whitelist (
      brand      TEXT        NOT NULL,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end   TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, slot_start)
    )
  `);
}

export async function getWhitelistedSlots(brand: string): Promise<WhitelistedSlot[]> {
  await initSlotWhitelistTable();
  const result = await pool.query(
    `SELECT slot_start AS "slotStart", slot_end AS "slotEnd"
     FROM slot_whitelist
     WHERE brand = $1 AND slot_start > now()
     ORDER BY slot_start ASC`,
    [brand]
  );
  return result.rows;
}

export async function addSlotToWhitelist(brand: string, start: Date, end: Date): Promise<void> {
  await initSlotWhitelistTable();
  await pool.query(
    `INSERT INTO slot_whitelist (brand, slot_start, slot_end)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, slot_start) DO UPDATE SET slot_end = $3`,
    [brand, start, end]
  );
}

export async function removeSlotFromWhitelist(brand: string, start: Date): Promise<void> {
  await initSlotWhitelistTable();
  await pool.query(
    'DELETE FROM slot_whitelist WHERE brand = $1 AND slot_start = $2',
    [brand, start]
  );
}

export async function isSlotWhitelisted(brand: string, start: Date): Promise<boolean> {
  await initSlotWhitelistTable();
  const result = await pool.query(
    'SELECT 1 FROM slot_whitelist WHERE brand = $1 AND slot_start = $2',
    [brand, start]
  );
  return (result.rowCount ?? 0) > 0;
}
```

- [ ] **Schritt 2: TypeScript-Kompilierung prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "error|website-db"
```

Erwartet: keine Fehler.

- [ ] **Schritt 3: Commit**

```bash
git add website/src/lib/website-db.ts
git commit -m "feat(db): add slot_whitelist table and CRUD functions"
```

---

## Task 2: CalDAV — `getAvailableSlots()` mit Whitelist-Filter

**Files:**
- Modify: `website/src/lib/caldav.ts`

- [ ] **Schritt 1: Import hinzufügen**

Am Anfang von `caldav.ts`, nach den bestehenden `const`-Deklarationen (nach Zeile 21), folgenden Import einfügen:

```typescript
import { getWhitelistedSlots } from './website-db';
```

- [ ] **Schritt 2: Signatur von `getAvailableSlots` anpassen**

Zeile 192 in `caldav.ts` — Signatur ändern von:
```typescript
export async function getAvailableSlots(fromDate?: Date): Promise<DaySlots[]> {
```
zu:
```typescript
export async function getAvailableSlots(fromDate?: Date, brand?: string): Promise<DaySlots[]> {
```

- [ ] **Schritt 3: Whitelist-Logik in `getAvailableSlots` einfügen**

Direkt nach `const events = await fetchEvents(start, end);` (Zeile 198) einfügen:

```typescript
  // Load whitelist once if brand is provided (whitelist mode)
  let whitelistedKeys: Set<string> | null = null;
  if (brand) {
    const whitelisted = await getWhitelistedSlots(brand);
    whitelistedKeys = new Set(whitelisted.map(w => w.slotStart.toISOString()));
  }
```

- [ ] **Schritt 4: Whitelist-Filter in der Slot-Prüfung anwenden**

In der inneren Schleife, nach `if (hasConflict) continue;` (bzw. nach dem `if (!hasConflict)` Block), den bestehenden Block so anpassen dass Slots die nicht in der Whitelist stehen übersprungen werden. Der Block ab `if (!hasConflict) {` wird zu:

```typescript
        if (!hasConflict) {
          // Whitelist filter: skip if brand given and slot not whitelisted
          if (whitelistedKeys !== null && !whitelistedKeys.has(slotStart.toISOString())) {
            continue;
          }

          const startHH = slotStart.getHours().toString().padStart(2, '0');
          const startMM = slotStart.getMinutes().toString().padStart(2, '0');
          const endHH = slotEnd.getHours().toString().padStart(2, '0');
          const endMM = slotEnd.getMinutes().toString().padStart(2, '0');

          slots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            display: `${startHH}:${startMM} - ${endHH}:${endMM}`,
          });
        }
```

- [ ] **Schritt 5: TypeScript-Kompilierung prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "error|caldav"
```

Erwartet: keine Fehler.

- [ ] **Schritt 6: `/api/calendar/slots` auf Whitelist-Modus umstellen**

`website/src/pages/api/calendar/slots.ts` — `getAvailableSlots`-Aufruf anpassen:

Aktuell (Zeile 11):
```typescript
    const slots = await getAvailableSlots(fromDate);
```

Ersetzen durch:
```typescript
    const brand = process.env.BRAND_NAME || 'mentolder';
    const slots = await getAvailableSlots(fromDate, brand);
```

- [ ] **Schritt 7: Commit**

```bash
git add website/src/lib/caldav.ts website/src/pages/api/calendar/slots.ts
git commit -m "feat(caldav): filter available slots by whitelist when brand provided"
```

---

## Task 3: API-Endpoints für Whitelist-Verwaltung

**Files:**
- Create: `website/src/pages/api/admin/slots/add.ts`
- Create: `website/src/pages/api/admin/slots/remove.ts`

- [ ] **Schritt 1: POST-Endpoint `add.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { addSlotToWhitelist } from '../../../../lib/website-db';

const BRAND = process.env.BRAND_NAME || 'mentolder';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let slotStart: string, slotEnd: string;
  try {
    ({ slotStart, slotEnd } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!slotStart || !slotEnd) {
    return new Response(JSON.stringify({ error: 'slotStart und slotEnd erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return new Response(JSON.stringify({ error: 'Ungültiges Datumsformat' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await addSlotToWhitelist(BRAND, start, end);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/slots/add]', err);
    return new Response(JSON.stringify({ error: 'Datenbankfehler' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Schritt 2: DELETE-Endpoint `remove.ts` erstellen**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { removeSlotFromWhitelist } from '../../../../lib/website-db';

const BRAND = process.env.BRAND_NAME || 'mentolder';

export const DELETE: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let slotStart: string;
  try {
    ({ slotStart } = await request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'Ungültige Anfrage' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!slotStart) {
    return new Response(JSON.stringify({ error: 'slotStart erforderlich' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const start = new Date(slotStart);
  if (isNaN(start.getTime())) {
    return new Response(JSON.stringify({ error: 'Ungültiges Datumsformat' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    await removeSlotFromWhitelist(BRAND, start);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/admin/slots/remove]', err);
    return new Response(JSON.stringify({ error: 'Datenbankfehler' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

- [ ] **Schritt 3: TypeScript-Kompilierung prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "error|slots"
```

Erwartet: keine Fehler.

- [ ] **Schritt 4: Commit**

```bash
git add website/src/pages/api/admin/slots/
git commit -m "feat(api): add POST/DELETE /api/admin/slots endpoints for whitelist management"
```

---

## Task 4: Booking-API — Whitelist-Validierung

**Files:**
- Modify: `website/src/pages/api/booking.ts`

- [ ] **Schritt 1: Import hinzufügen**

Am Anfang von `booking.ts`, nach den bestehenden Imports (nach Zeile 3), einfügen:

```typescript
import { isSlotWhitelisted } from '../../lib/website-db';
```

- [ ] **Schritt 2: Brand-Konstante hinzufügen**

Nach `const CONTACT_EMAIL = ...` (Zeile 6) einfügen:

```typescript
const BRAND = process.env.BRAND_NAME || 'mentolder';
```

- [ ] **Schritt 3: Whitelist-Check vor der Buchungsannahme einfügen**

Direkt nach der bestehenden Validierung `if (!isCallback && (!slotStart || !slotEnd)) { ... }` (nach Zeile 31), aber vor dem `const typeLabel = ...`, folgenden Block einfügen:

```typescript
    // Whitelist check: slot must be explicitly released by admin
    if (!isCallback && slotStart) {
      const whitelisted = await isSlotWhitelisted(BRAND, new Date(slotStart));
      if (!whitelisted) {
        return new Response(
          JSON.stringify({ error: 'Dieser Termin ist leider nicht mehr verfügbar.' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
```

- [ ] **Schritt 4: TypeScript-Kompilierung prüfen**

```bash
cd website && npx tsc --noEmit 2>&1 | grep -E "error|booking"
```

Erwartet: keine Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add website/src/pages/api/booking.ts
git commit -m "feat(booking): reject bookings for non-whitelisted slots"
```

---

## Task 5: Admin-UI — Toggle in `admin/termine.astro`

**Files:**
- Modify: `website/src/pages/admin/termine.astro`

- [ ] **Schritt 1: Whitelist-Daten server-seitig laden**

Im Frontmatter-Block (zwischen `---` und `---`), nach den Imports, `getWhitelistedSlots` importieren und Daten laden. Den bestehenden Frontmatter-Block ersetzen durch:

```typescript
---
import Layout from '../../layouts/Layout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import { getAvailableSlots } from '../../lib/caldav';
import { getWhitelistedSlots } from '../../lib/website-db';
import type { DaySlots } from '../../lib/caldav';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl());
if (!isAdmin(session)) return Astro.redirect('/admin');

const BRAND = process.env.BRAND_NAME || 'mentolder';
const NC_DOMAIN = process.env.NC_DOMAIN || 'files.mentolder.de';
const calendarUrl = `https://${NC_DOMAIN}/apps/calendar`;

const now = new Date();
const horizon = new Date(now);
horizon.setDate(horizon.getDate() + 14);

let days: DaySlots[] = [];
let calError = '';
try {
  // Without brand: all generated slots (no whitelist filter) for admin overview
  const all = await getAvailableSlots(now);
  days = all.filter(d => new Date(d.date) <= horizon);
} catch (err) {
  console.error('[admin/termine] getAvailableSlots failed:', err);
  calError = 'Kalender konnte nicht geladen werden.';
}

// Load whitelist and build a Set of whitelisted ISO start strings
const whitelistedSlots = await getWhitelistedSlots(BRAND).catch(() => []);
const whitelistedSet = new Set(whitelistedSlots.map(w => w.slotStart.toISOString()));

const totalSlots = days.reduce((sum, d) => sum + d.slots.length, 0);
const releasedCount = days.reduce(
  (sum, d) => sum + d.slots.filter(s => whitelistedSet.has(s.start)).length,
  0
);
---
```

- [ ] **Schritt 2: Header-Statistik anpassen**

Den bestehenden Absatz:
```html
          <p class="text-muted mt-1">Freie Slots der nächsten 14 Tage · {totalSlots} verfügbar</p>
```
ersetzen durch:
```html
          <p class="text-muted mt-1">Nächste 14 Tage · {totalSlots} generiert · <span class="text-gold"><span id="released-counter">{releasedCount}</span> freigegeben</span></p>
```

- [ ] **Schritt 3: Slot-Anzeige mit Toggle-Buttons**

Den bestehenden Slot-Render-Block:
```html
            <div class="flex flex-wrap gap-2">
              {day.slots.map(slot => (
                <span class="px-3 py-1.5 bg-gold/10 text-gold rounded-lg text-sm font-mono border border-gold/20">
                  {slot.display}
                </span>
              ))}
            </div>
```
ersetzen durch:
```html
            <div class="flex flex-wrap gap-2">
              {day.slots.map(slot => {
                const released = whitelistedSet.has(slot.start);
                return (
                  <button
                    class={`slot-toggle px-3 py-1.5 rounded-lg text-sm font-mono border transition-colors cursor-pointer ${
                      released
                        ? 'bg-gold/10 text-gold border-gold/20 hover:bg-gold/20'
                        : 'bg-dark-lighter text-muted border-dark-lighter hover:border-gold/30'
                    }`}
                    data-start={slot.start}
                    data-end={slot.end}
                    data-released={released ? 'true' : 'false'}
                    title={released ? 'Freigabe zurückziehen' : 'Slot freigeben'}
                  >
                    {slot.display}
                    {released && <span class="ml-1 opacity-60">×</span>}
                  </button>
                );
              })}
            </div>
```

- [ ] **Schritt 4: Inline-Script für Toggle-Logik**

Vor dem schließenden `</Layout>` Tag das folgende Script einfügen:

```html
<script>
  document.querySelectorAll<HTMLButtonElement>('.slot-toggle').forEach(btn => {
    btn.addEventListener('click', async () => {
      const start = btn.dataset.start!;
      const end   = btn.dataset.end!;
      const isReleased = btn.dataset.released === 'true';

      btn.disabled = true;
      btn.style.opacity = '0.5';

      try {
        const res = await fetch(
          isReleased ? '/api/admin/slots/remove' : '/api/admin/slots/add',
          {
            method: isReleased ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(isReleased ? { slotStart: start } : { slotStart: start, slotEnd: end }),
          }
        );

        if (!res.ok) {
          console.error('Slot toggle failed:', await res.text());
          btn.disabled = false;
          btn.style.opacity = '1';
          return;
        }

        // Flip state
        const nowReleased = !isReleased;
        btn.dataset.released = nowReleased ? 'true' : 'false';

        if (nowReleased) {
          btn.classList.remove('bg-dark-lighter', 'text-muted', 'border-dark-lighter', 'hover:border-gold/30');
          btn.classList.add('bg-gold/10', 'text-gold', 'border-gold/20', 'hover:bg-gold/20');
          btn.title = 'Freigabe zurückziehen';
          // Add × indicator
          const text = btn.childNodes[0];
          if (text && !btn.querySelector('.toggle-x')) {
            const x = document.createElement('span');
            x.className = 'ml-1 opacity-60 toggle-x';
            x.textContent = '×';
            btn.appendChild(x);
          }
        } else {
          btn.classList.remove('bg-gold/10', 'text-gold', 'border-gold/20', 'hover:bg-gold/20');
          btn.classList.add('bg-dark-lighter', 'text-muted', 'border-dark-lighter', 'hover:border-gold/30');
          btn.title = 'Slot freigeben';
          btn.querySelector('.toggle-x')?.remove();
        }

        // Update released counter
        const counterEl = document.getElementById('released-counter');
        if (counterEl) {
          counterEl.textContent = String(Number(counterEl.textContent) + (nowReleased ? 1 : -1));
        }
      } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
      }
    });
  });
</script>
```

Hinweis: Der Counter-Span im Header braucht `data-counter` Attribut. Den Span aus Schritt 2 so anpassen:
```html
<span class="text-gold"><span id="released-counter">{releasedCount}</span> freigegeben</span>
```

- [ ] **Schritt 5: Build-Check**

```bash
cd website && npx astro check 2>&1 | grep -E "error|termine"
```

Erwartet: keine Fehler.

- [ ] **Schritt 6: Commit**

```bash
git add website/src/pages/admin/termine.astro
git commit -m "feat(admin): slot whitelist toggle UI in Termine-Admin"
```

---

## Task 6: Tests aktualisieren

**Files:**
- Modify: `website/tests/api.test.mjs`
- Modify: `tests/e2e/specs/fa-16-booking.spec.ts`

- [ ] **Schritt 1: Neue Sektion in `api.test.mjs` hinzufügen**

Am Ende der Hauptfunktion (vor dem `section('Summary')` Block), neue Sektion einfügen:

```javascript
  // -- Slot Whitelist Admin Endpoints --
  section('Slot Whitelist API (unauthenticated)');

  await assert('POST /api/admin/slots/add without auth returns 403', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/slots/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotStart: '2026-05-01T08:00:00.000Z', slotEnd: '2026-05-01T09:00:00.000Z' }),
    });
    expect(res.status).toBe(403);
  });

  await assert('DELETE /api/admin/slots/remove without auth returns 403', async () => {
    const res = await fetch(`${BASE_URL}/api/admin/slots/remove`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotStart: '2026-05-01T08:00:00.000Z' }),
    });
    expect(res.status).toBe(403);
  });

  await assert('GET /api/calendar/slots returns empty array (no slots whitelisted)', async () => {
    const res = await fetch(`${BASE_URL}/api/calendar/slots`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // With whitelist mode active and no whitelisted slots, array must be empty
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(0);
  });
```

- [ ] **Schritt 2: Booking-Test T6 in `fa-16-booking.spec.ts` anpassen**

Den bisherigen Test T6 (Zeilen 53–70) ersetzen durch:

```typescript
  test('T6: POST /api/booking with non-whitelisted slot returns 400', async ({ request }) => {
    const res = await request.post(`${BASE}/api/booking`, {
      data: {
        name: 'Test User',
        email: 'test@example.de',
        phone: '',
        type: 'erstgespraech',
        message: '',
        slotStart: '2026-04-10T07:00:00.000Z',
        slotEnd: '2026-04-10T08:00:00.000Z',
        slotDisplay: '09:00 - 10:00',
        date: '2026-04-10',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('nicht mehr verfügbar');
  });
```

- [ ] **Schritt 3: Tests lokal ausführen** *(gegen laufende Dev-Instanz)*

```bash
cd website && BASE_URL=http://localhost:4321 node tests/api.test.mjs 2>&1 | grep -E "Slot Whitelist|✓|✗"
```

Erwartet: Alle drei Whitelist-Tests grün.

- [ ] **Schritt 4: Commit**

```bash
git add website/tests/api.test.mjs tests/e2e/specs/fa-16-booking.spec.ts
git commit -m "test: update booking + add slot whitelist API tests"
```

---

## Task 7: Branch pushen und PR erstellen

- [ ] **Schritt 1: CI-Validierung lokal**

```bash
task workspace:validate 2>&1 | tail -5
```

Erwartet: `Build successful` / keine Fehler.

- [ ] **Schritt 2: Branch pushen und PR erstellen**

```bash
git push -u origin feature/slot-whitelist
gh pr create \
  --title "feat: Slot-Whitelist für Admin-Terminverwaltung (BR-20260415-d4be)" \
  --body "$(cat <<'EOF'
## Summary
- Neue `slot_whitelist` PostgreSQL-Tabelle: Admin gibt Slots explizit frei
- `getAvailableSlots()` filtert auf Whitelist wenn `brand` übergeben (öffentliche API + Booking)
- Admin-UI `termine.astro`: Slots zeigen Toggle-Buttons (ausgegraut/gold)
- Booking-API lehnt nicht freigegebene Slots mit 400 ab
- Tests: API-Whitelist-Endpoints + FA-16 T6 angepasst

## Test plan
- [ ] `node tests/api.test.mjs` — alle Whitelist-Tests grün
- [ ] `./tests/runner.sh local FA-16` — Booking-Tests grün
- [ ] Admin-UI manuell prüfen: `/admin/termine` — Toggle-Buttons sichtbar, Klick ändert Status

Closes BR-20260415-d4be
🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
