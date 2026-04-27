import { pool, getSiteSetting, setSiteSetting, initTaxMonitorTables } from './website-db';

export enum TaxThresholdStatus {
  Safe = 'safe',
  Warning = 'warning',
  Exceeded = 'exceeded',
  HardExceeded = 'hard',
}

export const THRESHOLD_KLEIN   = 25_000;
export const THRESHOLD_WARNING = 20_000;
export const THRESHOLD_HARD    = 100_000;

export async function getTaxMode(brand: string): Promise<'kleinunternehmer' | 'regelbesteuerung'> {
  const v = await getSiteSetting(brand, 'tax_mode');
  return v === 'regelbesteuerung' ? 'regelbesteuerung' : 'kleinunternehmer';
}

export async function setTaxMode(brand: string, mode: 'kleinunternehmer' | 'regelbesteuerung', opts?: {
  triggerInvoiceId?: string; yearRevenue?: number; notes?: string;
}): Promise<void> {
  await initTaxMonitorTables();
  const current = await getTaxMode(brand);
  if (current === mode) return;
  await setSiteSetting(brand, 'tax_mode', mode);
  await pool.query(
    `INSERT INTO tax_mode_changes (brand, from_mode, to_mode, trigger_invoice_id, year_revenue_at_change, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [brand, current, mode, opts?.triggerInvoiceId??null, opts?.yearRevenue??null, opts?.notes??null]
  );
}

export async function getYearRevenue(brand: string, year: number): Promise<number> {
  await initTaxMonitorTables();
  const r = await pool.query(
    `SELECT COALESCE(SUM(net_amount), 0)::numeric AS total
     FROM billing_invoices
     WHERE brand=$1 AND EXTRACT(YEAR FROM issue_date)=$2
       AND status IN ('open','paid')`,
    [brand, year]
  );
  return Number(r.rows[0].total);
}

export function checkThreshold(revenue: number): TaxThresholdStatus {
  if (revenue >= THRESHOLD_HARD)    return TaxThresholdStatus.HardExceeded;
  if (revenue >= THRESHOLD_KLEIN)   return TaxThresholdStatus.Exceeded;
  if (revenue >= THRESHOLD_WARNING) return TaxThresholdStatus.Warning;
  return TaxThresholdStatus.Safe;
}

export async function checkAndApplyTaxModeSwitch(brand: string, invoiceId: string): Promise<boolean> {
  const year = new Date().getFullYear();
  const revenue = await getYearRevenue(brand, year);
  const status  = checkThreshold(revenue);
  if (status === TaxThresholdStatus.Exceeded || status === TaxThresholdStatus.HardExceeded) {
    const current = await getTaxMode(brand);
    if (current === 'kleinunternehmer') {
      await setTaxMode(brand, 'regelbesteuerung', {
        triggerInvoiceId: invoiceId, yearRevenue: revenue,
        notes: `Automatischer Wechsel: Jahresumsatz ${revenue.toFixed(2)} € ≥ ${THRESHOLD_KLEIN} € (§ 19 UStG 2025)`,
      });
      return true;
    }
  }
  return false;
}

export async function getUstvaExport(brand: string, year: number, quarter?: number): Promise<{
  period: string; taxMode: string; revenue0: number; revenue7: number; revenue19: number;
  tax7: number; tax19: number; totalTax: number;
}> {
  const monthRange = quarter
    ? { start: (quarter-1)*3+1, end: quarter*3 }
    : { start: 1, end: 12 };
  const r = await pool.query(
    `SELECT tax_rate, SUM(net_amount) AS net, SUM(tax_amount) AS tax
     FROM billing_invoices
     WHERE brand=$1 AND EXTRACT(YEAR FROM issue_date)=$2
       AND EXTRACT(MONTH FROM issue_date) BETWEEN $3 AND $4
       AND status IN ('open','paid')
     GROUP BY tax_rate`,
    [brand, year, monthRange.start, monthRange.end]
  );
  const period = quarter ? `Q${quarter}/${year}` : `${year}`;
  const byRate = Object.fromEntries(r.rows.map((row: {tax_rate:string;net:string;tax:string}) =>
    [row.tax_rate, { net: Number(row.net), tax: Number(row.tax) }]
  ));
  return {
    period,
    taxMode: await getTaxMode(brand),
    revenue0:  byRate['0']?.net  ?? 0,
    revenue7:  byRate['7']?.net  ?? 0,
    revenue19: byRate['19']?.net ?? 0,
    tax7:   byRate['7']?.tax  ?? 0,
    tax19:  byRate['19']?.tax ?? 0,
    totalTax: (byRate['7']?.tax ?? 0) + (byRate['19']?.tax ?? 0),
  };
}
