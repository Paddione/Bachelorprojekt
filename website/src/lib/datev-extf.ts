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
