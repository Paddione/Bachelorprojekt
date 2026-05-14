---
title: Plan E — DATEV EXTF Export Implementation Plan
domains: [db]
status: completed
pr_number: null
---

# Plan E — DATEV EXTF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a DATEV EXTF Buchungsstapel CSV export for outgoing invoices with a period-selection UI, one-click download, and Steuerberater handoff via email attachment.

**Architecture:** Three layers — (1) pure generator lib `datev-extf.ts` with EXTF header builder, row mapper, and DB query; (2) two Astro API routes (`datev-export.ts` GET for download, `datev-email.ts` POST for email); (3) Svelte `DatevExportWidget` component embedded in the existing `/admin/rechnungen` page. No new DB tables or environment variables required.

**Tech Stack:** TypeScript, Astro SSR (Node), PostgreSQL (`pool` from `website-db.ts`), nodemailer (`sendEmail` from `email.ts`), Svelte 5, Vitest.

---

## Scope Notes

This plan assumes the GoBD Compliance Core (Plan A, PR merged on feature/gobd-compliance-core) is present, meaning:
- `eur_bookings` table exists with `belegnummer`, `skr_konto` columns
- `billing_invoices` has `tax_mode`, `tax_rate`, `gross_amount`, `locked` columns
- `billing_customers` table exists
- `sendEmail` (with `attachments`) is in `website/src/lib/email.ts`
- `skrAccountFor()` is in `website/src/lib/skr.ts` (SKR03: income-regelbesteuerung→8400, income-kleinunternehmer→8195)

---

## DATEV EXTF Format Reference

**Row 1 — Metadata header** (31 semicolon-separated fields):

```
"EXTF";700;21;"Buchungsstapel";7;{YYYYMMDDHHmmssmmm};;"";;"";;0;0;{YYYYMMDD_FY};4;{YYYYMMDD_FROM};{YYYYMMDD_TO};"Buchungsstapel {label}";;"1";0;0;"EUR";;;;;;;;
```

Fields (1-indexed):
1. `"EXTF"` — format marker (quoted)
2. `700` — version (always 700)
3. `21` — data category (21 = Buchungsstapel)
4. `"Buchungsstapel"` — format name
5. `7` — format version
6. timestamp `YYYYMMDDHHmmssmmm` (17 digits, no quotes)
7–10. empty (`;;"";;"";;`)
11. `0` — Beraternummer
12. `0` — Mandantennummer
13. `YYYYMMDD` — fiscal year start (no quotes)
14. `4` — account number length (SKR03 = 4 digits)
15. `YYYYMMDD` — period start
16. `YYYYMMDD` — period end
17. `"Buchungsstapel {label}"` — description
18. empty — Diktatkürzel
19. `1` — Buchungstyp (Finanzbuchführung)
20. `0` — Rechnungslegungszweck
21. `0` — Festschreibung (not locked)
22. `"EUR"` — currency
23–31. empty reserved fields

**Row 2 — Column headers** (fixed, see Task 1 code)

**Row 3+ — Data rows** (semicolon-separated, 46 fields; only first 14 are used):

| # | Field | Example |
|---|-------|---------|
| 1 | Umsatz (gross, comma decimal) | `1190,00` |
| 2 | Soll/Haben-Kennzeichen | `S` |
| 3 | WKZ Umsatz | `EUR` |
| 4–6 | Kurs / Basis-Umsatz / WKZ | empty |
| 7 | Konto (receivables in SKR03) | `1400` |
| 8 | Gegenkonto (revenue account) | `8400` |
| 9 | BU-Schlüssel | `9` (19%), empty (§19) |
| 10 | Belegdatum | `DDMM` e.g. `1501` |
| 11 | Belegfeld 1 (invoice number, max 12) | `RE-2026-0001` |
| 12 | Belegfeld 2 | empty |
| 13 | Skonto | empty |
| 14 | Buchungstext (max 60 chars) | `Muster GmbH Webhosting` |
| 15–46 | reserved optional fields | empty |

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `website/src/lib/datev-extf.ts` | **Create** | Pure EXTF generator: header row, column row, data rows, DB query |
| `website/src/pages/api/admin/billing/datev-export.ts` | **Create** | GET: period params → EXTF CSV download |
| `website/src/pages/api/admin/billing/datev-email.ts` | **Create** | POST: period params + recipient → generate + email attachment |
| `website/src/components/admin/DatevExportWidget.svelte` | **Create** | Period picker UI (year + optional month), download + email buttons |
| `website/src/pages/admin/rechnungen.astro` | **Modify** | Import and render `DatevExportWidget` |
| `website/src/lib/datev-extf.test.ts` | **Create** | Vitest unit tests for generator functions |
| `website/src/pages/api/admin/billing/datev-export.test.ts` | **Create** | Vitest integration tests for export endpoint |

---

## Task 1: DATEV EXTF Generator Library

**Files:**
- Create: `website/src/lib/datev-extf.ts`
- Create: `website/src/lib/datev-extf.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `website/src/lib/datev-extf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildExtfCsv, buildExtfRow, type ExtfRecord, type ExtfParams } from './datev-extf';

const baseParams: ExtfParams = {
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  fiscalYearStart: '2026-01-01',
  bezeichnung: 'Test Export',
};

const regelRecord: ExtfRecord = {
  booking: {
    id: 1,
    bookingDate: '2026-01-15',
    belegnummer: 'INV-abc12345',
    description: 'Webhosting Januar 2026',
    netAmount: 1000,
    vatAmount: 190,
    skrKonto: '8400',
    type: 'income',
  },
  invoice: {
    number: 'RE-2026-0001',
    grossAmount: 1190,
    taxMode: 'regelbesteuerung',
    taxRate: 19,
  },
  customer: { name: 'Max Mustermann', company: 'Muster GmbH' },
};

const kleinRecord: ExtfRecord = {
  booking: {
    id: 2,
    bookingDate: '2026-01-20',
    belegnummer: 'INV-def67890',
    description: 'Beratung',
    netAmount: 500,
    vatAmount: 0,
    skrKonto: '8195',
    type: 'income',
  },
  invoice: {
    number: 'RE-2026-0002',
    grossAmount: 500,
    taxMode: 'kleinunternehmer',
    taxRate: 0,
  },
  customer: { name: 'Anna Beispiel', company: undefined },
};

describe('buildExtfRow', () => {
  it('sets gross amount with comma decimal for regelbesteuerung', () => {
    const row = buildExtfRow(regelRecord);
    const fields = row.split(';');
    expect(fields[0]).toBe('1190,00');
  });

  it('sets S/H-Kennzeichen to S', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[1]).toBe('S');
  });

  it('sets Konto to 1400 (Forderungen SKR03)', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[6]).toBe('1400');
  });

  it('sets Gegenkonto to skrKonto (8400 for regelbesteuerung)', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[7]).toBe('8400');
  });

  it('sets BU-Schlüssel to 9 for 19% regelbesteuerung', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[8]).toBe('9');
  });

  it('sets empty BU-Schlüssel for kleinunternehmer', () => {
    const row = buildExtfRow(kleinRecord);
    expect(row.split(';')[8]).toBe('');
  });

  it('formats Belegdatum as DDMM', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[9]).toBe('1501'); // 15. Jan
  });

  it('truncates Belegfeld 1 to 12 chars', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';')[10]).toBe('RE-2026-0001');
    expect(row.split(';')[10].length).toBeLessThanOrEqual(12);
  });

  it('sets Buchungstext from company name + description, max 60 chars', () => {
    const row = buildExtfRow(regelRecord);
    const text = row.split(';')[13];
    expect(text).toContain('Muster GmbH');
    expect(text.length).toBeLessThanOrEqual(60);
  });

  it('uses customer name when no company for Buchungstext', () => {
    const row = buildExtfRow(kleinRecord);
    expect(row.split(';')[13]).toContain('Anna Beispiel');
  });

  it('has exactly 46 fields', () => {
    const row = buildExtfRow(regelRecord);
    expect(row.split(';').length).toBe(46);
  });
});

describe('buildExtfCsv', () => {
  it('starts with EXTF header line starting with "EXTF"', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    const lines = csv.split('\r\n');
    expect(lines[0]).toMatch(/^"EXTF"/);
  });

  it('second row is column headers containing Umsatz', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    const lines = csv.split('\r\n');
    expect(lines[1]).toContain('Umsatz');
    expect(lines[1]).toContain('Soll/Haben-Kennzeichen');
  });

  it('third row is the data row', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    const lines = csv.split('\r\n');
    expect(lines[2]).toContain('1190,00');
  });

  it('header contains period dates', () => {
    const csv = buildExtfCsv([regelRecord], baseParams);
    expect(csv.split('\r\n')[0]).toContain('20260101');
    expect(csv.split('\r\n')[0]).toContain('20260131');
  });

  it('returns empty data section for empty records array', () => {
    const csv = buildExtfCsv([], baseParams);
    const lines = csv.split('\r\n').filter(Boolean);
    expect(lines.length).toBe(2); // header + column row only
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run src/lib/datev-extf.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module './datev-extf'"

- [ ] **Step 1.3: Implement `website/src/lib/datev-extf.ts`**

```typescript
import { pool } from './website-db';

export interface ExtfParams {
  periodStart: string;      // YYYY-MM-DD
  periodEnd: string;        // YYYY-MM-DD
  fiscalYearStart: string;  // YYYY-MM-DD (usually Jan 1)
  bezeichnung?: string;
  beraternummer?: number;
  mandantennummer?: number;
}

export interface ExtfRecord {
  booking: {
    id: number;
    bookingDate: string; // YYYY-MM-DD
    belegnummer: string;
    description: string;
    netAmount: number;
    vatAmount: number;
    skrKonto: string;
    type: string;
  };
  invoice: {
    number: string;
    grossAmount: number;
    taxMode: string;
    taxRate: number;
  } | null;
  customer: {
    name: string;
    company?: string;
  } | null;
}

// ---- Formatting helpers ----

function fmtAmount(n: number): string {
  return Math.abs(n).toFixed(2).replace('.', ',');
}

// DATEV Belegdatum: DDMM (4 digits, no year)
function fmtBelegdatum(isoDate: string): string {
  const [, mm, dd] = isoDate.split('-');
  return `${dd}${mm}`;
}

// Header timestamp: YYYYMMDDHHmmssmmm (17 digits)
function fmtTimestamp(d: Date): string {
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
         `${p(d.getMilliseconds(), 3)}`;
}

function fmtHeaderDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

function esc(s: string | number | undefined): string {
  if (s === undefined || s === null) return '';
  return String(s);
}

// ---- EXTF CSV builder ----

const COL_HEADERS = [
  '"Umsatz (ohne Soll/Haben-Kz)"', '"Soll/Haben-Kennzeichen"', '"WKZ Umsatz"',
  '"Kurs"', '"Basis-Umsatz"', '"WKZ Basis-Umsatz"',
  '"Konto"', '"Gegenkonto (ohne BU-Schlüssel)"', '"BU-Schlüssel"',
  '"Belegdatum"', '"Belegfeld 1"', '"Belegfeld 2"',
  '"Skonto"', '"Buchungstext"',
  '"Postensperre"', '"Diverse Adressnummer"', '"Geschäftspartnerbank"',
  '"Sachverhalt"', '"Zinssperre"', '"Beleglink"',
  '"Beleginfo - Art 1"', '"Beleginfo - Inhalt 1"',
  '"Beleginfo - Art 2"', '"Beleginfo - Inhalt 2"',
  '"Beleginfo - Art 3"', '"Beleginfo - Inhalt 3"',
  '"Beleginfo - Art 4"', '"Beleginfo - Inhalt 4"',
  '"KOST1 - Kostenstelle"', '"KOST2 - Kostenstelle"', '"KOST-Menge"',
  '"EU-Land u. UStID"', '"EU-Steuersatz"', '"Abw. Versteuerungsart"',
  '"Sachkonten-U.-Kz."', '"Zahlweise"', '"Forderungsart"',
  '"Veranlagungsjahr"', '"Zugeordnete Fälligkeit"', '"Skontotyp"',
  '"Auftragsnummer"', '"Land"', '"Abrechnungsreferenz"',
  '"BVV-Position (Betriebsvermögensvergleich)"',
  '"EU-Mitgliedstaat u. UStID des Leistungsempfängers"',
  '"Eigene Kostenstelle"',
].join(';');

export function buildExtfRow(r: ExtfRecord): string {
  const { booking: b, invoice: inv, customer: cust } = r;
  const isKlein = inv?.taxMode === 'kleinunternehmer';
  const grossAmount = inv ? inv.grossAmount : b.netAmount + b.vatAmount;
  const buKey = inv && !isKlein ? (inv.taxRate === 7 ? '8' : '9') : '';
  const gegenkonto = esc(b.skrKonto) || '8400'; // revenue account
  const konto = '1400'; // Forderungen aus L+L (SKR03)
  const belegdatum = fmtBelegdatum(b.bookingDate);
  const belegfeld1 = (inv?.number ?? b.belegnummer ?? '').slice(0, 12);
  const custLabel = cust?.company ?? cust?.name ?? '';
  const buchungstext = `${custLabel} ${b.description}`.trim().slice(0, 60);

  const cells: string[] = [
    fmtAmount(grossAmount), // 1 Umsatz
    'S',                    // 2 S/H-Kennzeichen
    'EUR',                  // 3 WKZ
    '', '', '',             // 4–6 Kurs/Basis/WKZ leer
    konto,                  // 7 Konto (Forderungen 1400)
    gegenkonto,             // 8 Gegenkonto (8400/8195)
    buKey,                  // 9 BU-Schlüssel
    belegdatum,             // 10 Belegdatum DDMM
    belegfeld1,             // 11 Belegfeld 1
    '',                     // 12 Belegfeld 2
    '',                     // 13 Skonto
    buchungstext,           // 14 Buchungstext
    ...Array(32).fill(''),  // 15–46 optional fields
  ];

  return cells.join(';');
}

export function buildExtfCsv(records: ExtfRecord[], params: ExtfParams): string {
  const now = new Date();
  const fyStart  = fmtHeaderDate(params.fiscalYearStart);
  const periFrom = fmtHeaderDate(params.periodStart);
  const periTo   = fmtHeaderDate(params.periodEnd);
  const bez      = params.bezeichnung ?? 'Buchungsstapel';
  const bNr      = params.beraternummer ?? 0;
  const mNr      = params.mandantennummer ?? 0;

  // 31-field metadata header (DATEV EXTF spec, v700)
  const metaRow = [
    '"EXTF"', 700, 21, '"Buchungsstapel"', 7,
    fmtTimestamp(now), '', '""', '', '""', '',
    bNr, mNr,
    fyStart, 4,
    periFrom, periTo,
    `"${bez}"`, '',
    1, 0, 0,
    '"EUR"',
    '', '', '', '', '', '', '', '',
  ].join(';');

  const rows = records.map(buildExtfRow);
  const parts = [metaRow, COL_HEADERS, ...rows];
  return parts.join('\r\n');
}

// ---- DB query ----

export async function getBookingsForPeriod(
  brand: string,
  from: string,
  to: string,
): Promise<ExtfRecord[]> {
  const r = await pool.query(
    `SELECT
       eb.id, eb.booking_date, eb.belegnummer, eb.description,
       eb.net_amount, eb.vat_amount, eb.skr_konto, eb.type,
       bi.number  AS inv_number,
       bi.gross_amount AS inv_gross,
       bi.tax_mode AS inv_tax_mode,
       bi.tax_rate AS inv_tax_rate,
       bc.name    AS cust_name,
       bc.company AS cust_company
     FROM eur_bookings eb
     LEFT JOIN billing_invoices bi ON bi.id = eb.invoice_id
     LEFT JOIN billing_customers bc ON bc.id = bi.customer_id
     WHERE eb.brand = $1
       AND eb.booking_date BETWEEN $2 AND $3
       AND eb.type = 'income'
     ORDER BY eb.booking_date, eb.id`,
    [brand, from, to],
  );

  return r.rows.map(row => ({
    booking: {
      id: Number(row.id),
      bookingDate: (row.booking_date as Date).toISOString().split('T')[0],
      belegnummer: row.belegnummer as string,
      description: row.description as string,
      netAmount: Number(row.net_amount),
      vatAmount: Number(row.vat_amount),
      skrKonto: row.skr_konto as string,
      type: row.type as string,
    },
    invoice: row.inv_number ? {
      number: row.inv_number as string,
      grossAmount: Number(row.inv_gross),
      taxMode: row.inv_tax_mode as string,
      taxRate: Number(row.inv_tax_rate),
    } : null,
    customer: row.cust_name ? {
      name: row.cust_name as string,
      company: (row.cust_company as string) || undefined,
    } : null,
  }));
}

// ---- Period helpers (exported for reuse in API routes) ----

export function periodRange(year: number, month?: number): { from: string; to: string; label: string } {
  if (month !== undefined) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const label = new Date(year, month - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    return { from, to, label };
  }
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) };
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run src/lib/datev-extf.test.ts 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 1.5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/lib/datev-extf.ts website/src/lib/datev-extf.test.ts
git commit -m "feat(billing): DATEV EXTF generator lib with period query and unit tests"
```

---

## Task 2: Download API Endpoint

**Files:**
- Create: `website/src/pages/api/admin/billing/datev-export.ts`
- Create: `website/src/pages/api/admin/billing/datev-export.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `website/src/pages/api/admin/billing/datev-export.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/auth', () => ({
  getSession: vi.fn(),
  isAdmin: vi.fn(),
}));
vi.mock('../../../../lib/datev-extf', () => ({
  getBookingsForPeriod: vi.fn().mockResolvedValue([]),
  buildExtfCsv: vi.fn().mockReturnValue('"EXTF";700;21;"Buchungsstapel"'),
  periodRange: vi.fn().mockReturnValue({ from: '2026-01-01', to: '2026-01-31', label: 'Januar 2026' }),
}));

import { getSession, isAdmin } from '../../../../lib/auth';
import { GET } from './datev-export';

const mockSession = { userId: 'admin', email: 'admin@test.de' };

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost/api/admin/billing/datev-export');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new Request(url.toString(), { headers: { cookie: 'session=test' } });
}

describe('GET /api/admin/billing/datev-export', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await GET({ request: makeRequest({ year: '2026' }), url: new URL('http://localhost?year=2026') } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when year is missing', async () => {
    const res = await GET({ request: makeRequest(), url: new URL('http://localhost') } as any);
    expect(res.status).toBe(400);
  });

  it('returns CSV with correct Content-Type', async () => {
    const res = await GET({ request: makeRequest({ year: '2026', month: '1' }), url: new URL('http://localhost?year=2026&month=1') } as any);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
  });

  it('sets Content-Disposition attachment with filename', async () => {
    const res = await GET({ request: makeRequest({ year: '2026', month: '1' }), url: new URL('http://localhost?year=2026&month=1') } as any);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment.*filename/);
    expect(res.headers.get('Content-Disposition')).toContain('datev-');
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run src/pages/api/admin/billing/datev-export.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module './datev-export'"

- [ ] **Step 2.3: Implement `website/src/pages/api/admin/billing/datev-export.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getBookingsForPeriod, buildExtfCsv, periodRange } from '../../../../lib/datev-extf';

export const GET: APIRoute = async ({ request, url }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const yearStr = url.searchParams.get('year');
  if (!yearStr) return new Response('year required', { status: 400 });
  const year  = parseInt(yearStr, 10);
  const monthStr = url.searchParams.get('month');
  const month = monthStr ? parseInt(monthStr, 10) : undefined;

  if (isNaN(year) || year < 2020 || year > 2099) {
    return new Response('invalid year', { status: 400 });
  }
  if (month !== undefined && (isNaN(month) || month < 1 || month > 12)) {
    return new Response('invalid month (1–12)', { status: 400 });
  }

  const brand = process.env.BRAND || 'mentolder';
  const { from, to, label } = periodRange(year, month);
  const records = await getBookingsForPeriod(brand, from, to);
  const csv = buildExtfCsv(records, {
    periodStart: from,
    periodEnd: to,
    fiscalYearStart: `${year}-01-01`,
    bezeichnung: `Buchungsstapel ${label}`,
  });

  const filename = `datev-buchungsstapel-${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
```

- [ ] **Step 2.4: Run tests to verify they pass**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run src/pages/api/admin/billing/datev-export.test.ts 2>&1 | tail -20
```

Expected: All PASS

- [ ] **Step 2.5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/billing/datev-export.ts website/src/pages/api/admin/billing/datev-export.test.ts
git commit -m "feat(billing): DATEV EXTF download API endpoint with period params"
```

---

## Task 3: Steuerberater Email Endpoint

**Files:**
- Create: `website/src/pages/api/admin/billing/datev-email.ts`

- [ ] **Step 3.1: Write the failing test**

Add to `website/src/pages/api/admin/billing/datev-export.test.ts` (append at the bottom):

```typescript
// --- datev-email tests ---
vi.mock('../../../../lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { POST } from './datev-email';
import { sendEmail } from '../../../../lib/email';

describe('POST /api/admin/billing/datev-email', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(mockSession as any);
    vi.mocked(isAdmin).mockReturnValue(true);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ year: 2026, month: 1, to: 'stb@example.de' }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(401);
  });

  it('returns 400 when year missing', async () => {
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ month: 1, to: 'stb@example.de' }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(400);
  });

  it('returns 400 when recipient email missing', async () => {
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ year: 2026, month: 1 }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(400);
  });

  it('calls sendEmail with CSV attachment and returns 200', async () => {
    const req = new Request('http://localhost/api/admin/billing/datev-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'session=test' },
      body: JSON.stringify({ year: 2026, month: 1, to: 'stb@example.de' }),
    });
    const res = await POST({ request: req } as any);
    expect(res.status).toBe(200);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'stb@example.de',
        attachments: expect.arrayContaining([
          expect.objectContaining({ filename: expect.stringMatching(/\.csv$/) }),
        ]),
      }),
    );
  });
});
```

- [ ] **Step 3.2: Run tests to verify they fail**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run src/pages/api/admin/billing/datev-export.test.ts 2>&1 | tail -20
```

Expected: FAIL with "Cannot find module './datev-email'"

- [ ] **Step 3.3: Implement `website/src/pages/api/admin/billing/datev-email.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getBookingsForPeriod, buildExtfCsv, periodRange } from '../../../../lib/datev-extf';
import { sendEmail } from '../../../../lib/email';

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  let body: { year?: number; month?: number; to?: string };
  try {
    body = await request.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const { year, month, to } = body;
  if (!year || typeof year !== 'number') return new Response('year required', { status: 400 });
  if (!to || typeof to !== 'string' || !to.includes('@')) return new Response('to (email) required', { status: 400 });

  const brand = process.env.BRAND || 'mentolder';
  const brandName = process.env.BRAND_NAME || brand;
  const { from, to: toDate, label } = periodRange(year, month);
  const records = await getBookingsForPeriod(brand, from, toDate);
  const csv = buildExtfCsv(records, {
    periodStart: from,
    periodEnd: toDate,
    fiscalYearStart: `${year}-01-01`,
    bezeichnung: `Buchungsstapel ${label}`,
  });

  const filename = `datev-buchungsstapel-${label.replace(/\s+/g, '-').toLowerCase()}.csv`;
  const ok = await sendEmail({
    to,
    subject: `DATEV Buchungsstapel ${label} — ${brandName}`,
    text: `Sehr geehrte/r Steuerberater/in,

anbei der DATEV Buchungsstapel für den Zeitraum ${label} (${records.length} Buchung${records.length !== 1 ? 'en' : ''}).

Die Datei kann direkt in DATEV importiert werden (Extras → Datenimport → Buchungsdatenservice).

Mit freundlichen Grüßen
${brandName}`,
    attachments: [{ filename, content: Buffer.from(csv, 'utf-8') }],
  });

  if (!ok) return new Response(JSON.stringify({ error: 'Email konnte nicht gesendet werden' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify({ sent: true, count: records.length, to, filename }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 3.4: Run tests to verify they pass**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run src/pages/api/admin/billing/datev-export.test.ts 2>&1 | tail -20
```

Expected: All PASS

- [ ] **Step 3.5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/api/admin/billing/datev-email.ts website/src/pages/api/admin/billing/datev-export.test.ts
git commit -m "feat(billing): DATEV email endpoint for Steuerberater handoff"
```

---

## Task 4: DatevExportWidget Svelte Component

**Files:**
- Create: `website/src/components/admin/DatevExportWidget.svelte`

- [ ] **Step 4.1: Implement `website/src/components/admin/DatevExportWidget.svelte`**

```svelte
<script lang="ts">
  let year = new Date().getFullYear();
  let month: number | '' = new Date().getMonth() + 1; // current month default
  let emailTo = '';
  let status: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  let statusMsg = '';

  const MONTHS = [
    { v: '', label: 'Ganzes Jahr' },
    { v: 1,  label: 'Januar' }, { v: 2, label: 'Februar' }, { v: 3, label: 'März' },
    { v: 4,  label: 'April' },  { v: 5, label: 'Mai' },     { v: 6, label: 'Juni' },
    { v: 7,  label: 'Juli' },   { v: 8, label: 'August' },  { v: 9, label: 'September' },
    { v: 10, label: 'Oktober' },{ v: 11, label: 'November'},{ v: 12, label: 'Dezember' },
  ];

  function downloadUrl(): string {
    const p = new URLSearchParams({ year: String(year) });
    if (month !== '') p.set('month', String(month));
    return `/api/admin/billing/datev-export?${p}`;
  }

  async function sendEmail() {
    if (!emailTo.trim()) { statusMsg = 'Bitte E-Mail-Adresse eingeben.'; status = 'error'; return; }
    status = 'loading';
    statusMsg = '';
    try {
      const res = await fetch('/api/admin/billing/datev-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month: month !== '' ? month : undefined, to: emailTo.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Fehler');
      const data = await res.json();
      statusMsg = `${data.count} Buchung${data.count !== 1 ? 'en' : ''} gesendet an ${data.to}`;
      status = 'success';
    } catch (err: any) {
      statusMsg = err.message ?? 'Unbekannter Fehler';
      status = 'error';
    }
  }
</script>

<div class="border border-dark-lighter rounded-xl p-6 bg-dark-lighter/30 mb-8">
  <h2 class="text-lg font-semibold text-light mb-4">DATEV Export (Buchungsstapel)</h2>

  <div class="flex flex-wrap gap-4 items-end mb-4">
    <div>
      <label class="block text-xs text-muted mb-1">Jahr</label>
      <select bind:value={year} class="bg-dark border border-dark-lighter rounded px-3 py-2 text-light text-sm">
        {#each [2024, 2025, 2026, 2027] as y}
          <option value={y}>{y}</option>
        {/each}
      </select>
    </div>
    <div>
      <label class="block text-xs text-muted mb-1">Monat</label>
      <select bind:value={month} class="bg-dark border border-dark-lighter rounded px-3 py-2 text-light text-sm">
        {#each MONTHS as m}
          <option value={m.v}>{m.label}</option>
        {/each}
      </select>
    </div>
    <a
      href={downloadUrl()}
      download
      class="inline-flex items-center gap-2 px-4 py-2 bg-brass/20 hover:bg-brass/30 border border-brass/40 text-brass rounded-lg text-sm font-medium transition-colors"
    >
      ↓ CSV herunterladen
    </a>
  </div>

  <div class="flex flex-wrap gap-3 items-end border-t border-dark-lighter pt-4">
    <div class="flex-1 min-w-[220px]">
      <label class="block text-xs text-muted mb-1">Steuerberater E-Mail</label>
      <input
        type="email"
        bind:value={emailTo}
        placeholder="stb@kanzlei.de"
        class="w-full bg-dark border border-dark-lighter rounded px-3 py-2 text-light text-sm placeholder:text-muted"
      />
    </div>
    <button
      on:click={sendEmail}
      disabled={status === 'loading'}
      class="px-4 py-2 bg-green-800/30 hover:bg-green-800/50 border border-green-700/40 text-green-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
    >
      {status === 'loading' ? 'Sendet…' : '✉ An Steuerberater senden'}
    </button>
  </div>

  {#if statusMsg}
    <p class="mt-3 text-sm {status === 'error' ? 'text-red-400' : 'text-green-400'}">
      {statusMsg}
    </p>
  {/if}
</div>
```

- [ ] **Step 4.2: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/components/admin/DatevExportWidget.svelte
git commit -m "feat(billing): DatevExportWidget with period picker, download, and email"
```

---

## Task 5: Integrate Widget into Admin Rechnungen Page

**Files:**
- Modify: `website/src/pages/admin/rechnungen.astro` (lines 1–10 frontmatter, after existing imports)

- [ ] **Step 5.1: Read the current import block**

Read lines 1–15 of `website/src/pages/admin/rechnungen.astro` to find the exact import list.

- [ ] **Step 5.2: Add import for DatevExportWidget**

In `website/src/pages/admin/rechnungen.astro`, add after the existing component imports in the frontmatter (after line `import TaxMonitorWidget from '../../components/admin/TaxMonitorWidget.svelte';`):

```typescript
import DatevExportWidget from '../../components/admin/DatevExportWidget.svelte';
```

- [ ] **Step 5.3: Add widget to template**

In the Astro template in `rechnungen.astro`, find the line `<TaxMonitorWidget client:load />` and add immediately after it:

```astro
<DatevExportWidget client:load />
```

- [ ] **Step 5.4: Verify manifest still builds**

```bash
cd /home/patrick/Bachelorprojekt && task workspace:validate 2>&1 | tail -5
```

Expected: exit 0 (no Kubernetes errors — Astro build errors would show in website:deploy)

- [ ] **Step 5.5: Commit**

```bash
cd /home/patrick/Bachelorprojekt
git add website/src/pages/admin/rechnungen.astro
git commit -m "feat(billing): add DatevExportWidget to admin rechnungen page"
```

---

## Task 6: Smoke Test (Manual) + CI Green

- [ ] **Step 6.1: Run all billing-related unit tests**

```bash
cd /home/patrick/Bachelorprojekt/website && npx vitest run --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|datev)" | head -40
```

Expected: no FAIL lines involving datev-extf or datev-export

- [ ] **Step 6.2: Build the website to catch TypeScript errors**

```bash
cd /home/patrick/Bachelorprojekt/website && npx astro build 2>&1 | tail -20
```

Expected: Build completed without type errors. (Ignore missing env warnings.)

- [ ] **Step 6.3: Manual smoke test against dev cluster**

```bash
# Deploy website to dev cluster
cd /home/patrick/Bachelorprojekt && task website:deploy
```

Then visit `https://web.localhost/admin/rechnungen` and verify:
- DATEV Export widget appears below TaxMonitorWidget
- Year/month dropdowns are functional
- "CSV herunterladen" link resolves to `/api/admin/billing/datev-export?year=...`
- (Optional) Click download with an active month — verify the CSV starts with `"EXTF";700;21`
- Enter an email address and click "An Steuerberater senden" — verify Mailpit receives the email with `.csv` attachment

- [ ] **Step 6.4: Validate EXTF header manually**

Open the downloaded CSV in a text editor and verify:
- Line 1 starts with `"EXTF";700;21;"Buchungsstapel";7;`
- Line 1 contains the period dates (YYYYMMDD format)
- Line 2 starts with `"Umsatz (ohne Soll/Haben-Kz)"`
- Line 3+ (if bookings exist): amount uses comma decimal, Belegdatum is 4 digits (DDMM)

- [ ] **Step 6.5: Final commit & push for PR**

```bash
cd /home/patrick/Bachelorprojekt
git status
# If all clean from previous commits, no additional commit needed
git log --oneline -6
```

---

## Task 7: Push + open PR

- [ ] **Step 7.1: Confirm branch and worktree**

```bash
cd /home/patrick/Bachelorprojekt
git status
git branch --show-current
```

Expected: only the intended DATEV EXTF plan implementation commits are present on the feature branch.

- [ ] **Step 7.2: Push branch**

```bash
cd /home/patrick/Bachelorprojekt
git push -u origin feature/datev-extf-export
```

- [ ] **Step 7.3: Open PR with implementation summary**

```bash
gh pr create --title "feat(billing): DATEV EXTF export (Plan E)" --body "$(cat <<'EOF'
## Summary
- adds `datev-extf.ts` with DATEV EXTF header builder, row mapper, and booking-period query
- adds admin download endpoint for DATEV Buchungsstapel CSV export by year or month
- adds admin email endpoint for Steuerberater handoff with CSV attachment
- adds `DatevExportWidget` to `/admin/rechnungen` with year/month picker, download, and email actions
- adds unit and endpoint tests covering EXTF generation and export flows

Implements Plan E of the billing compliance series and provides a practical DATEV handoff path without introducing new tables or configuration.

## Test plan
- [ ] `cd website && npx vitest run src/lib/datev-extf.test.ts src/pages/api/admin/billing/datev-export.test.ts`
- [ ] `cd website && npx vitest run`
- [ ] `cd website && npx astro build`
- [ ] Manual: download a monthly CSV from `/admin/rechnungen` and verify line 1 starts with `"EXTF";700;21`
- [ ] Manual: send the export to Mailpit and verify `.csv` attachment is present

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

### Spec coverage check

| Requirement | Task |
|-------------|------|
| EXTF CSV generator (Buchungsstapel format) | Task 1 (`datev-extf.ts`) |
| `!Buchungsstapel` header conventions | Task 1 (`buildExtfCsv` row 1) |
| Period selection UI | Task 4 (`DatevExportWidget`) |
| Year + month picker | Task 4 |
| Download button | Task 4 + Task 2 (GET endpoint) |
| Steuerberater handoff email | Task 3 + Task 4 |
| Email attachment (.csv) | Task 3 (`sendEmail` with `attachments`) |
| Admin page integration | Task 5 |
| DATEV header conventions checked | EXTF format reference + Task 1 |
| BU-Schlüssel (tax key mapping) | Task 1 (`buildExtfRow`, BU 9/8/empty) |
| SKR account mapping | Task 1 (`konto=1400`, `gegenkonto=skrKonto`) |
| §19 Kleinunternehmer handling | Task 1 (empty BU-Schlüssel, 8195 account) |

### Placeholder scan
- All code blocks are complete
- No TBD, no placeholder implementations
- Test assertions match exactly the implementation field positions

### Type consistency
- `ExtfRecord`, `ExtfParams` defined in `datev-extf.ts` Task 1, used in Tasks 2 and 3 via import
- `periodRange()` defined in Task 1, imported by Tasks 2 and 3
- `getBookingsForPeriod()` defined in Task 1, imported by Tasks 2 and 3
- `buildExtfCsv()` defined in Task 1, imported by Tasks 2 and 3
- `sendEmail` signature (`{ to, subject, text, attachments }`) matches `email.ts` interface exactly
