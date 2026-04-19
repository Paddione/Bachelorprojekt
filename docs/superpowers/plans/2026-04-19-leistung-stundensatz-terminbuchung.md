# Leistung + Stundensatz + Terminbuchung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leistungen bekommen einen Stundensatz, Zeiteinträge frieren ihn ein, Terminbuchungen verknüpfen Leistung + Projekt — sowohl für Admins als auch für Kunden im Portal.

**Architecture:** Ansatz A — JSONB-Erweiterung. `stundensatz_cents` wird in `LeistungServiceOverride` (JSONB) gespeichert. `time_entries` und `booking_project_links` bekommen neue `leistung_key`-Spalten via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Keine neuen Tabellen.

**Tech Stack:** Astro 5, Svelte 5, TypeScript, PostgreSQL 16, Tailwind CSS

---

## File Map

| Datei | Was sich ändert |
|-------|----------------|
| `src/config/types.ts` | `stundensatz_cents?` zu `LeistungService` |
| `src/lib/website-db.ts` | `stundensatz_cents?` zu `LeistungServiceOverride`; migrations; `createTimeEntry` + `setBookingProject` erweitert; `getBookingLeistungen` neu |
| `src/lib/content.ts` | `getEffectiveLeistungen` merged `stundensatz_cents` |
| `src/pages/admin/angebote.astro` | Stundensatz-Input pro Leistung; DB-Merge |
| `src/pages/api/admin/angebote/save.ts` | `stundensatz_cents` aus Form lesen + speichern |
| `src/pages/admin/zeiterfassung.astro` | Leistung-Dropdown + Auto-fill + Betrag-Spalten |
| `src/pages/api/admin/zeiterfassung/create.ts` | `leistung_key` entgegennehmen |
| `src/pages/api/bookings/[uid]/project.ts` | `leistung_key` entgegennehmen |
| `src/pages/admin/termine.astro` | Leistung-Dropdown beim Verknüpfen; requested Leistung/Projekt anzeigen |
| `src/pages/api/leistungen.ts` | Neuer öffentlicher GET-Endpunkt (key + name, keine Rates) |
| `src/components/BookingForm.svelte` | Leistung + Projekt Dropdowns wenn eingeloggt |
| `src/pages/api/booking.ts` | `projectId` + `leistungKey` in Inbox-Payload speichern |

---

## Task 1: `stundensatz_cents` zu den Typ-Interfaces hinzufügen

**Files:**
- Modify: `src/config/types.ts:33-40`
- Modify: `src/lib/website-db.ts:537-544`
- Modify: `src/lib/content.ts:78-89`

- [ ] **Schritt 1: `LeistungService` in `config/types.ts` erweitern**

In `src/config/types.ts`, Zeile 39 (nach `highlight?: boolean;`):

```typescript
export interface LeistungService {
  key: string;
  name: string;
  price: string;
  unit: string;
  desc: string;
  highlight?: boolean;
  stundensatz_cents?: number;
}
```

- [ ] **Schritt 2: `LeistungServiceOverride` in `website-db.ts` erweitern**

In `src/lib/website-db.ts`, Zeile 543 (nach `highlight?: boolean;`):

```typescript
export interface LeistungServiceOverride {
  key: string;
  name?: string;
  price?: string;
  unit?: string;
  desc?: string;
  highlight?: boolean;
  stundensatz_cents?: number;
}
```

- [ ] **Schritt 3: `getEffectiveLeistungen` in `content.ts` merged `stundensatz_cents`**

In `src/lib/content.ts`, den `return { ...svc, ... }`-Block in `getEffectiveLeistungen` (Zeilen 81-87) ersetzen:

```typescript
      return {
        ...svc,
        name: so.name ?? svc.name,
        price: so.price ?? svc.price,
        unit: so.unit ?? svc.unit,
        desc: so.desc ?? svc.desc,
        highlight: so.highlight ?? svc.highlight,
        stundensatz_cents: so.stundensatz_cents ?? svc.stundensatz_cents,
      };
```

- [ ] **Schritt 4: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine Fehler in den geänderten Dateien.

- [ ] **Schritt 5: Commit**

```bash
git add src/config/types.ts src/lib/website-db.ts src/lib/content.ts
git commit -m "feat: add stundensatz_cents to LeistungService and override interfaces"
```

---

## Task 2: DB-Migrationen — neue Spalten

**Files:**
- Modify: `src/lib/website-db.ts` (initTimeEntriesTable, initBookingProjectLinks)

- [ ] **Schritt 1: `leistung_key` zu `time_entries` Migration hinzufügen**

In `src/lib/website-db.ts`, in der Funktion `initTimeEntriesTable()` (nach Zeile 1254, nach dem bestehenden `ALTER TABLE ... ADD COLUMN IF NOT EXISTS stripe_invoice_id`-Block):

```typescript
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS leistung_key TEXT
  `);
```

- [ ] **Schritt 2: `leistung_key` zu `booking_project_links` Migration hinzufügen**

In `src/lib/website-db.ts`, in der Funktion `initBookingProjectLinks()` (nach dem `CREATE TABLE IF NOT EXISTS`-Block, also nach Zeile 1878):

```typescript
  await pool.query(`
    ALTER TABLE booking_project_links ADD COLUMN IF NOT EXISTS leistung_key TEXT
  `);
```

- [ ] **Schritt 3: `TimeEntry`-Interface um `leistungKey` erweitern**

In `src/lib/website-db.ts`, das `TimeEntry`-Interface (Zeilen 1217-1230) um ein Feld ergänzen:

```typescript
export interface TimeEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  description: string | null;
  minutes: number;
  billable: boolean;
  rateCents: number;
  leistungKey: string | null;
  stripeInvoiceId: string | null;
  entryDate: Date;
  createdAt: Date;
}
```

- [ ] **Schritt 4: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine neuen Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add src/lib/website-db.ts
git commit -m "feat: add leistung_key columns to time_entries and booking_project_links"
```

---

## Task 3: DB-Funktionen erweitern

**Files:**
- Modify: `src/lib/website-db.ts` (createTimeEntry, listTimeEntries, listAllTimeEntries, setBookingProject)
- Create: `src/lib/website-db.ts` (getBookingLeistungen — neue Funktion)

- [ ] **Schritt 1: `createTimeEntry` — `leistungKey` Parameter + INSERT**

In `src/lib/website-db.ts`, die Funktion `createTimeEntry` (ab Zeile 1266) vollständig ersetzen:

```typescript
export async function createTimeEntry(params: {
  projectId: string;
  taskId?: string;
  description?: string;
  minutes: number;
  billable?: boolean;
  rateCents?: number;
  leistungKey?: string;
  entryDate?: string;
}): Promise<TimeEntry> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `INSERT INTO time_entries (project_id, task_id, description, minutes, billable, rate_cents, leistung_key, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING
       id,
       project_id        AS "projectId",
       NULL::text        AS "projectName",
       task_id           AS "taskId",
       NULL::text        AS "taskName",
       description,
       minutes,
       billable,
       rate_cents        AS "rateCents",
       leistung_key      AS "leistungKey",
       stripe_invoice_id AS "stripeInvoiceId",
       entry_date        AS "entryDate",
       created_at        AS "createdAt"`,
    [
      params.projectId,
      params.taskId ?? null,
      params.description ?? null,
      params.minutes,
      params.billable ?? true,
      params.rateCents ?? 0,
      params.leistungKey ?? null,
      params.entryDate ?? null,
    ]
  );
  return result.rows[0] as TimeEntry;
}
```

- [ ] **Schritt 2: `listTimeEntries` und `listAllTimeEntries` — `leistung_key` in SELECT**

In `src/lib/website-db.ts`, in beiden `SELECT`-Queries für `listTimeEntries` und `listAllTimeEntries`, nach der Zeile `te.stripe_invoice_id AS "stripeInvoiceId",` folgende Zeile einfügen:

```sql
            te.leistung_key      AS "leistungKey",
```

(In beiden Funktionen — `listTimeEntries` ab Zeile 1305 und `listAllTimeEntries` weiter unten.)

- [ ] **Schritt 3: `setBookingProject` — `leistungKey` Parameter + UPSERT**

In `src/lib/website-db.ts`, die Funktion `setBookingProject` (ab Zeile 1963) vollständig ersetzen:

```typescript
export async function setBookingProject(
  caldavUid: string,
  projectId: string | null,
  brand: string,
  leistungKey?: string
): Promise<void> {
  await initBookingProjectLinks();
  if (!projectId) {
    await pool.query(
      `DELETE FROM booking_project_links WHERE caldav_uid = $1 AND brand = $2`,
      [caldavUid, brand]
    );
  } else {
    await pool.query(
      `INSERT INTO booking_project_links (caldav_uid, brand, project_id, leistung_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (caldav_uid, brand) DO UPDATE
         SET project_id  = EXCLUDED.project_id,
             leistung_key = EXCLUDED.leistung_key`,
      [caldavUid, brand, projectId, leistungKey ?? null]
    );
  }
}
```

- [ ] **Schritt 4: `getBookingLeistungen` neue Funktion hinzufügen**

In `src/lib/website-db.ts`, direkt nach der `getBookingProjects`-Funktion (nach Zeile 1960) einfügen:

```typescript
export async function getBookingLeistungen(caldavUids: string[], brand: string): Promise<Map<string, string>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingProjectLinks();
  const result = await pool.query(
    `SELECT caldav_uid, leistung_key FROM booking_project_links
     WHERE caldav_uid = ANY($1) AND brand = $2 AND leistung_key IS NOT NULL`,
    [caldavUids, brand]
  );
  return new Map(result.rows.map((r: { caldav_uid: string; leistung_key: string }) => [r.caldav_uid, r.leistung_key]));
}
```

- [ ] **Schritt 5: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine Fehler.

- [ ] **Schritt 6: Commit**

```bash
git add src/lib/website-db.ts
git commit -m "feat: extend createTimeEntry, setBookingProject and add getBookingLeistungen"
```

---

## Task 4: Admin Angebote — Stundensatz-Input pro Leistung

**Files:**
- Modify: `src/pages/admin/angebote.astro`
- Modify: `src/pages/api/admin/angebote/save.ts`

- [ ] **Schritt 1: Stundensatz-Wert im Frontmatter laden**

In `src/pages/admin/angebote.astro`, den `leistungen`-Merge-Block (Zeilen 44-62) so erweitern, dass `stundensatz_cents` mitgeladen wird:

```typescript
const leistungen = mentolderConfig.leistungen.map(cat => {
  const o = dbLeistungen?.find(x => x.id === cat.id);
  return {
    id: cat.id,
    title: o?.title ?? cat.title,
    icon: o?.icon ?? cat.icon,
    services: cat.services.map(svc => {
      const so = o?.services?.find(x => x.key === svc.key);
      return {
        key: svc.key,
        name: so?.name ?? svc.name,
        price: so?.price ?? svc.price,
        unit: so?.unit ?? svc.unit,
        desc: so?.desc ?? svc.desc,
        highlight: so?.highlight ?? svc.highlight,
        stundensatz_cents: so?.stundensatz_cents ?? svc.stundensatz_cents ?? 0,
      };
    }),
  };
});
```

- [ ] **Schritt 2: Stundensatz-Input-Feld pro Leistung in der UI**

In `src/pages/admin/angebote.astro`, innerhalb des Leistungen-Abschnitts, nach dem bestehenden `grid grid-cols-2`-Block pro `svc` (nach dem `Einheit`-Input und dem `Hervorheben`-Checkbox-Block, also nach Zeile 218), einen neuen Block einfügen:

```astro
                        <div>
                          <label class={labelCls}>Stundensatz (€/Std.)</label>
                          <input
                            type="number"
                            name={`lk_${cat.id}_${svc.key}_stundensatz`}
                            value={Math.round(svc.stundensatz_cents / 100)}
                            min="0"
                            step="1"
                            class={inputCls}
                            placeholder="z.B. 60"
                          />
                        </div>
```

Genauer: das `grid grid-cols-2`-Raster hat 4 Zellen (Name, Preis, Einheit, Hervorheben). Den Stundensatz als 5. Zelle in dasselbe Grid einfügen — vor dem schließenden `</div>` des Grid-Containers.

Der vollständige Grid-Block nach der Änderung:

```astro
                      <div class="grid grid-cols-2 gap-3">
                        <div>
                          <label class={labelCls}>Name</label>
                          <input type="text" name={`lk_${cat.id}_${svc.key}_name`} value={svc.name} class={inputCls} />
                        </div>
                        <div>
                          <label class={labelCls}>Preis</label>
                          <input type="text" name={`lk_${cat.id}_${svc.key}_price`} value={svc.price} class={inputCls} />
                        </div>
                        <div>
                          <label class={labelCls}>Einheit</label>
                          <input type="text" name={`lk_${cat.id}_${svc.key}_unit`} value={svc.unit} class={inputCls} />
                        </div>
                        <div>
                          <label class={labelCls}>Stundensatz (€/Std.)</label>
                          <input
                            type="number"
                            name={`lk_${cat.id}_${svc.key}_stundensatz`}
                            value={Math.round(svc.stundensatz_cents / 100)}
                            min="0"
                            step="1"
                            class={inputCls}
                            placeholder="z.B. 60"
                          />
                        </div>
                        <div class="flex items-end pb-1">
                          <label class="flex items-center gap-2 text-sm text-muted cursor-pointer">
                            <input type="checkbox" name={`lk_${cat.id}_${svc.key}_highlight`} value="1"
                              checked={svc.highlight} class="rounded border-dark-lighter bg-dark accent-gold" />
                            Hervorheben
                          </label>
                        </div>
                      </div>
```

- [ ] **Schritt 3: `stundensatz_cents` im Save-Handler lesen**

In `src/pages/api/admin/angebote/save.ts`, den `leistungenOverrides`-Block (Zeilen 52-64) um `stundensatz_cents` erweitern:

```typescript
  const leistungenOverrides: LeistungCategoryOverride[] = mentolderConfig.leistungen.map(cat => ({
    id: cat.id,
    title: (form.get(`lk_${cat.id}_title`) as string) || cat.title,
    icon: (form.get(`lk_${cat.id}_icon`) as string) || cat.icon,
    services: cat.services.map(svc => {
      const stundensatzEuro = parseFloat((form.get(`lk_${cat.id}_${svc.key}_stundensatz`) as string) || '0');
      const stundensatz_cents = isNaN(stundensatzEuro) ? 0 : Math.round(stundensatzEuro * 100);
      return {
        key: svc.key,
        name: (form.get(`lk_${cat.id}_${svc.key}_name`) as string) || svc.name,
        price: (form.get(`lk_${cat.id}_${svc.key}_price`) as string) || svc.price,
        unit: (form.get(`lk_${cat.id}_${svc.key}_unit`) as string ?? svc.unit),
        desc: (form.get(`lk_${cat.id}_${svc.key}_desc`) as string) || svc.desc,
        highlight: form.get(`lk_${cat.id}_${svc.key}_highlight`) === '1',
        stundensatz_cents,
      };
    }),
  }));
```

- [ ] **Schritt 4: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine Fehler.

- [ ] **Schritt 5: Commit**

```bash
git add src/pages/admin/angebote.astro src/pages/api/admin/angebote/save.ts
git commit -m "feat: add Stundensatz input per Leistung in admin Angebote"
```

---

## Task 5: Admin Zeiterfassung — Leistung-Dropdown + Betrag-Spalten

**Files:**
- Modify: `src/pages/admin/zeiterfassung.astro`
- Modify: `src/pages/api/admin/zeiterfassung/create.ts`

- [ ] **Schritt 1: Leistungen im Frontmatter laden**

In `src/pages/admin/zeiterfassung.astro`, den Import-Block oben erweitern:

```typescript
import { getLastTimeEntryRate, listAllTimeEntries, listProjects } from '../../lib/website-db';
import { getEffectiveLeistungen } from '../../lib/content';
import type { TimeEntry, Project } from '../../lib/website-db';
import type { LeistungCategory } from '../../config/types';
```

Im Frontmatter, `leistungen` laden und eine Rate-Map für den Client erstellen (nach dem `lastRate`-Aufruf):

```typescript
const lastRate = await getLastTimeEntryRate();
let leistungen: LeistungCategory[] = [];
try {
  leistungen = await getEffectiveLeistungen();
} catch { /* ignore */ }

// Map key → stundensatz_cents für client-seitiges Auto-fill
const leistungRates: Record<string, number> = {};
for (const cat of leistungen) {
  for (const svc of cat.services) {
    if (svc.stundensatz_cents != null) leistungRates[svc.key] = svc.stundensatz_cents;
  }
}
```

- [ ] **Schritt 2: Leistung-Dropdown + Auto-fill im Create-Dialog**

In `src/pages/admin/zeiterfassung.astro`, im Dialog-Formular (nach dem Projekt-Dropdown, vor dem Minuten/Datum-Grid), einen neuen Block einfügen:

```astro
      <div>
        <label class={labelCls}>Leistung</label>
        <select name="leistungKey" id="leistung-select" class={selectCls}>
          <option value="">— Keine Leistung —</option>
          {leistungen.map(cat => (
            <optgroup label={`${cat.icon} ${cat.title}`}>
              {cat.services.map(svc => (
                <option value={svc.key} data-rate={svc.stundensatz_cents ?? 0}>
                  {svc.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
```

- [ ] **Schritt 3: Stundensatz-Feld anpassen**

Das bestehende `rateCents`-Input-Feld (Zeilen 189-200) so anpassen, dass es eine `id` bekommt für das JS-Auto-fill:

```astro
      <div>
        <label class={labelCls}>Stundensatz (€/h)</label>
        <input
          type="number"
          id="rate-input"
          name="rateCents"
          min="0"
          step="1"
          required
          class={inputCls}
          placeholder="z.B. 100"
          value={Math.round(lastRate / 100)}
        />
        <p class="text-xs text-muted mt-1">Wird bei Leistungsauswahl automatisch befüllt. Manuell überschreibbar.</p>
      </div>
```

- [ ] **Schritt 4: Auto-fill JavaScript im `<script>`-Block**

Im `<script>`-Block am Ende der Datei (Zeilen 218-222), das Auto-fill hinzufügen:

```html
<script>
  const dialog = document.getElementById('create-dialog') as HTMLDialogElement;
  document.getElementById('create-btn')?.addEventListener('click', () => dialog.showModal());
  document.getElementById('create-cancel')?.addEventListener('click', () => dialog.close());

  const leistungSelect = document.getElementById('leistung-select') as HTMLSelectElement;
  const rateInput = document.getElementById('rate-input') as HTMLInputElement;
  leistungSelect?.addEventListener('change', () => {
    const selected = leistungSelect.options[leistungSelect.selectedIndex];
    const rate = parseInt(selected.dataset.rate ?? '0', 10);
    if (rate > 0) rateInput.value = String(Math.round(rate / 100));
  });
</script>
```

- [ ] **Schritt 5: Betrag-Spalte in der Tabelle ergänzen**

In `src/pages/admin/zeiterfassung.astro`, in der Tabellen-Header-Zeile (nach `Abr.`-Spalte, vor `Aktionen`):

```astro
              <th class="text-right px-4 py-3 text-xs text-muted uppercase tracking-wide font-medium">Betrag</th>
```

In der Tabellen-Body-Zeile (nach der `e.billable`-Zelle, vor der Löschen-Zelle):

```astro
                <td class="px-4 py-3 text-sm text-right font-mono text-gold">
                  {e.rateCents > 0
                    ? `${((e.minutes / 60) * (e.rateCents / 100)).toFixed(2)} €`
                    : <span class="text-muted">—</span>}
                </td>
```

Außerdem in der `<p>`-Zeile unter dem H1 (Zeile 56), die Gesamtsumme ergänzen:

```typescript
const billableAmount = entries
  .filter(e => e.billable && e.rateCents > 0)
  .reduce((sum, e) => sum + (e.minutes / 60) * (e.rateCents / 100), 0);
```

Und in der Subtitle-Zeile:
```astro
          <p class="text-muted mt-1">{fmtMin(totalMinutes)} gesamt · {fmtMin(billableMinutes)} abrechenbar · {billableAmount.toFixed(2)} € abr. Betrag</p>
```

- [ ] **Schritt 6: `create.ts` — `leistungKey` entgegennehmen**

In `src/pages/api/admin/zeiterfassung/create.ts`, nach dem `entryDate`-Auslesen:

```typescript
  const leistungKey = (form.get('leistungKey') as string | null) || undefined;
```

Den `createTimeEntry`-Aufruf ergänzen:

```typescript
    await createTimeEntry({
      projectId,
      taskId: taskId || undefined,
      description: description || undefined,
      minutes,
      billable,
      rateCents,
      leistungKey,
      entryDate: entryDate || undefined,
    });
```

- [ ] **Schritt 7: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine Fehler.

- [ ] **Schritt 8: Commit**

```bash
git add src/pages/admin/zeiterfassung.astro src/pages/api/admin/zeiterfassung/create.ts
git commit -m "feat: add Leistung dropdown and Betrag column to Zeiterfassung"
```

---

## Task 6: Admin Termine — Leistung beim Booking-Link

**Files:**
- Modify: `src/pages/api/bookings/[uid]/project.ts`
- Modify: `src/pages/admin/termine.astro`

- [ ] **Schritt 1: PATCH-Endpunkt — `leistungKey` entgegennehmen**

In `src/pages/api/bookings/[uid]/project.ts`, Zeilen 25-45 vollständig ersetzen:

```typescript
  let body: { projectId?: string | null; leistungKey?: string | null };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const brand = process.env.BRAND_NAME || 'mentolder';
  try {
    await setBookingProject(uid, body.projectId ?? null, brand, body.leistungKey ?? undefined);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[PATCH /api/bookings/[uid]/project] DB error:', err);
    return new Response(JSON.stringify({ error: 'Database error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
```

- [ ] **Schritt 2: Importe und Variablen in `termine.astro` erweitern**

In `src/pages/admin/termine.astro`, Zeile 6 ersetzen:

```typescript
import { getBookingProjects, listProjects, getBookingInvoices, getWhitelistedSlots, getBookingLeistungen } from '../../lib/website-db';
import type { Project, BookingInvoiceInfo } from '../../lib/website-db';
```

Nach Zeile 7, neuen Import einfügen:

```typescript
import { getEffectiveLeistungen } from '../../lib/content';
import type { LeistungCategory } from '../../config/types';
```

Nach Zeile 26 (`let bookingInvoiceMap...`), neue Variablen hinzufügen:

```typescript
let bookingLeistungMap: Map<string, string> = new Map();
let leistungen: LeistungCategory[] = [];
```

- [ ] **Schritt 3: Daten im `try`-Block laden**

In `src/pages/admin/termine.astro`, im `try`-Block (Zeile 40), das `Promise.all` für `bookingProjectMap` und `bookingInvoiceMap` erweitern:

```typescript
  [bookingProjectMap, bookingInvoiceMap, bookingLeistungMap] = await Promise.all([
    getBookingProjects(uids, brand),
    getBookingInvoices(uids, brand),
    getBookingLeistungen(uids, brand),
  ]);
  leistungen = await getEffectiveLeistungen();
```

- [ ] **Schritt 4: Leistung-Dropdown nach jedem Projekt-Select einfügen**

In `src/pages/admin/termine.astro`, direkt nach dem `</select>`-Tag des Projekt-Selects bei den **Upcoming Bookings** (nach Zeile 135, vor `{inv && (`):

```astro
                        {leistungen.length > 0 && (
                          <select
                            class="booking-leistung-select text-xs bg-dark border border-dark-lighter rounded-lg px-2 py-1 text-light focus:border-gold focus:ring-1 focus:ring-gold/20 outline-none cursor-pointer"
                            data-booking-uid={b.uid}
                          >
                            <option value="">— Keine Leistung —</option>
                            {leistungen.map(cat => (
                              <optgroup label={`${cat.icon} ${cat.title}`}>
                                {cat.services.map(svc => (
                                  <option value={svc.key} selected={bookingLeistungMap.get(b.uid) === svc.key}>
                                    {svc.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        )}
```

Dasselbe bei den **Past Bookings** einfügen (nach Zeile 190, nach dem schließenden `</select>` des Projekt-Selects).

- [ ] **Schritt 5: JavaScript-Handler für Leistung-Select erweitern**

In `src/pages/admin/termine.astro`, im `<script>`-Block, nach dem bestehenden `booking-project-select`-Handler (nach Zeile 341) einen neuen Handler hinzufügen:

```javascript
  // Booking leistung assignment
  document.querySelectorAll<HTMLSelectElement>('.booking-leistung-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const uid = sel.dataset.bookingUid;
      if (!uid) return;
      // Find the sibling project select to get current projectId
      const container = sel.closest('[data-booking-uid]') ?? sel.parentElement;
      const projectSel = container?.querySelector<HTMLSelectElement>('.booking-project-select');
      const projectId = projectSel?.value || null;
      sel.disabled = true;
      try {
        const res = await fetch(`/api/bookings/${encodeURIComponent(uid)}/project`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, leistungKey: sel.value || null }),
        });
        if (!res.ok) alert('Fehler beim Speichern der Leistungszuordnung.');
      } catch {
        alert('Netzwerkfehler.');
      } finally {
        sel.disabled = false;
      }
    });
  });
```

Außerdem den bestehenden `booking-project-select`-Handler aktualisieren, damit er beim Ändern des Projekts auch die aktuelle Leistung mitschickt (Zeile 335 ersetzen):

```javascript
          body: JSON.stringify({
            projectId: sel.value || null,
            leistungKey: sel.closest('[data-booking-uid]')?.querySelector<HTMLSelectElement>('.booking-leistung-select')?.value || null,
          }),
```

- [ ] **Schritt 6: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine Fehler.

- [ ] **Schritt 7: Commit**

```bash
git add src/pages/api/bookings/[uid]/project.ts src/pages/admin/termine.astro
git commit -m "feat: add leistung_key to booking project link in admin Termine"
```

---

## Task 7: Öffentlicher Leistungen-Endpunkt + Portal BookingForm

**Files:**
- Create: `src/pages/api/leistungen.ts`
- Modify: `src/components/BookingForm.svelte`
- Modify: `src/pages/api/booking.ts`

- [ ] **Schritt 1: Neuen öffentlichen GET-Endpunkt erstellen**

Datei `src/pages/api/leistungen.ts` erstellen:

```typescript
import type { APIRoute } from 'astro';
import { getEffectiveLeistungen } from '../../lib/content';

export const GET: APIRoute = async () => {
  const cats = await getEffectiveLeistungen();
  const flat = cats.flatMap(cat =>
    cat.services.map(svc => ({
      key: svc.key,
      name: svc.name,
      category: cat.title,
    }))
  );
  return new Response(JSON.stringify(flat), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

Hinweis: `stundensatz_cents` wird bewusst nicht zurückgegeben — das ist interne Admin-Information.

- [ ] **Schritt 2: Endpunkt manuell testen**

```bash
curl -s http://localhost:4321/api/leistungen | head -c 200
```

Erwartet: JSON-Array mit `[{ key, name, category }, ...]`.

- [ ] **Schritt 3: `booking.ts` — `projectId` + `leistungKey` in Payload speichern**

In `src/pages/api/booking.ts`, die Destrukturierung der Request-Body (Zeile 18) erweitern:

```typescript
const { name, email, phone, type, message, slotStart, slotEnd, slotDisplay, date, serviceKey, projectId, leistungKey } = await request.json();
```

Im `createInboxItem`-Aufruf (Zeilen 60-68), das Payload-Objekt erweitern:

```typescript
    await createInboxItem({
      type: 'booking',
      payload: {
        name, email, phone: phone ?? null, type, typeLabel,
        slotStart: slotStart ?? null, slotEnd: slotEnd ?? null,
        slotDisplay: slotDisplay ?? null, date: date ?? null,
        serviceKey: serviceKey ?? null, message: message ?? null,
        projectId: projectId ?? null, leistungKey: leistungKey ?? null,
      },
    });
```

- [ ] **Schritt 4: `BookingForm.svelte` — Leistung + Projekt Dropdowns**

In `src/components/BookingForm.svelte`, im `<script>`-Block, Client-seitiges Laden der Daten hinzufügen:

```typescript
  import { onMount } from 'svelte';

  let portalProjects: Array<{ id: string; name: string }> = [];
  let leistungenOptions: Array<{ key: string; name: string; category: string }> = [];
  let selectedProjectId = '';
  let selectedLeistungKey = '';

  onMount(async () => {
    // Leistungen immer laden
    try {
      const res = await fetch('/api/leistungen');
      if (res.ok) leistungenOptions = await res.json();
    } catch { /* ignore */ }

    // Projekte nur wenn eingeloggt
    try {
      const res = await fetch('/api/portal/projekte');
      if (res.ok) portalProjects = await res.json();
    } catch { /* ignore */ }
  });
```

Im Template-Teil, unterhalb der bestehenden Felder (direkt vor dem Submit-Button), die optionalen Felder hinzufügen (nur wenn im `termin`/`erstgespraech`/`meeting`-Modus und Leistungen verfügbar):

```svelte
  {#if leistungenOptions.length > 0 && type !== 'callback'}
    <div>
      <label class="block text-sm text-muted mb-1">Leistung (optional)</label>
      <select bind:value={selectedLeistungKey}
        class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm">
        <option value="">— Keine Leistung auswählen —</option>
        {#each leistungenOptions as opt}
          <option value={opt.key}>{opt.category} — {opt.name}</option>
        {/each}
      </select>
    </div>

    {#if portalProjects.length > 0}
      <div>
        <label class="block text-sm text-muted mb-1">Für welches Projekt? (optional)</label>
        <select bind:value={selectedProjectId}
          class="w-full px-3 py-2 bg-dark border border-dark-lighter rounded-lg text-light text-sm">
          <option value="">— Kein Projekt —</option>
          {#each portalProjects as p}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
      </div>
    {/if}
  {/if}
```

Im `handleSubmit`-Fetch-Aufruf, den Body um die neuen Felder erweitern (in der `body: JSON.stringify({...})`-Sektion):

```javascript
projectId: selectedProjectId || undefined,
leistungKey: selectedLeistungKey || undefined,
```

- [ ] **Schritt 5: TypeScript prüfen**

```bash
cd /home/patrick/Bachelorprojekt/website && npx tsc --noEmit 2>&1 | head -30
```

Erwartet: keine Fehler.

- [ ] **Schritt 6: Commit**

```bash
git add src/pages/api/leistungen.ts src/components/BookingForm.svelte src/pages/api/booking.ts
git commit -m "feat: portal booking form with Leistung and Projekt selection"
```

---

## Abschluss

- [ ] **Build-Test**

```bash
cd /home/patrick/Bachelorprojekt/website && npm run build 2>&1 | tail -20
```

Erwartet: `Build complete.` ohne Fehler.

- [ ] **Finaler Commit (falls nötig)**

```bash
git log --oneline -8
```

Alle 7 Feature-Commits sollten sichtbar sein.
