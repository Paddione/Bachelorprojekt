import { pool, initEurTables } from './website-db';

// ---- EÜR Booking types ----

export interface EurBooking {
  id: number; brand: string; bookingDate: string; type: string;
  category: string; description: string; netAmount: number;
  vatAmount: number; invoiceId?: string; receiptPath?: string;
}

export async function addBooking(p: Omit<EurBooking, 'id'>): Promise<EurBooking> {
  await initEurTables();
  const r = await pool.query(
    `INSERT INTO eur_bookings (brand,booking_date,type,category,description,net_amount,vat_amount,invoice_id,receipt_path)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [p.brand, p.bookingDate, p.type, p.category, p.description,
     p.netAmount, p.vatAmount, p.invoiceId??null, p.receiptPath??null]
  );
  return mapBooking(r.rows[0]);
}

export interface EurSummary {
  year: number; totalIncome: number; totalExpenses: number;
  totalVatCollected: number; totalPretax: number; profit: number;
}

export async function getEurSummary(brand: string, year: number): Promise<EurSummary> {
  await initEurTables();
  const r = await pool.query(
    `SELECT type, SUM(net_amount) AS net, SUM(vat_amount) AS vat
     FROM eur_bookings
     WHERE brand=$1 AND EXTRACT(YEAR FROM booking_date)=$2
     GROUP BY type`,
    [brand, year]
  );
  const byType: Record<string, { net: number; vat: number }> = {};
  for (const row of r.rows) byType[row.type] = { net: Number(row.net), vat: Number(row.vat) };
  const income   = (byType['income']?.net ?? 0) + (byType['vat_refund']?.net ?? 0);
  const expenses = (byType['expense']?.net ?? 0) + (byType['pretax']?.net ?? 0) + (byType['vat_payment']?.net ?? 0);
  return {
    year, totalIncome: income, totalExpenses: expenses,
    totalVatCollected: byType['income']?.vat ?? 0,
    totalPretax: byType['pretax']?.net ?? 0,
    profit: income - expenses,
  };
}

function mapBooking(row: Record<string, unknown>): EurBooking {
  return {
    id: Number(row.id), brand: row.brand as string,
    bookingDate: (row.booking_date as Date).toISOString().split('T')[0],
    type: row.type as string, category: row.category as string,
    description: row.description as string,
    netAmount: Number(row.net_amount), vatAmount: Number(row.vat_amount),
    invoiceId: (row.invoice_id as string) ?? undefined,
    receiptPath: (row.receipt_path as string) ?? undefined,
  };
}

// ---- Asset types (§15a UStG) ----

export interface Asset {
  id: number; brand: string; description: string; purchaseDate: string;
  netPurchasePrice: number; vatPaid: number; usefulLifeMonths: number;
  correctionStartDate?: string; isGwg: boolean;
}

export async function addAsset(p: Omit<Asset, 'id'>): Promise<Asset> {
  await initEurTables();
  const r = await pool.query(
    `INSERT INTO assets (brand,description,purchase_date,net_purchase_price,vat_paid,useful_life_months,correction_start_date,is_gwg)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [p.brand, p.description, p.purchaseDate, p.netPurchasePrice, p.vatPaid,
     p.usefulLifeMonths, p.correctionStartDate??null, p.isGwg??false]
  );
  return mapAsset(r.rows[0]);
}

const SECTION_15A_THRESHOLD = 1_000;

export interface Section15aResult {
  eligible: boolean; reason?: string;
  correctionAmount: number; remainingMonths: number;
}

export function calculateSection15aCorrection(asset: Asset, switchDate: Date): Section15aResult {
  if (asset.netPurchasePrice < SECTION_15A_THRESHOLD) {
    return { eligible: false, reason: `Anschaffungskosten (${asset.netPurchasePrice} €) < ${SECTION_15A_THRESHOLD} € Bagatellgrenze (§ 44 UStDV)`, correctionAmount: 0, remainingMonths: 0 };
  }
  const purchase = new Date(asset.purchaseDate);
  const elapsedMonths = Math.floor((switchDate.getTime() - purchase.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  const remainingMonths = Math.max(0, asset.usefulLifeMonths - elapsedMonths);
  if (remainingMonths === 0) {
    return { eligible: false, reason: 'Berichtigungszeitraum abgelaufen', correctionAmount: 0, remainingMonths: 0 };
  }
  const correctionAmount = (asset.vatPaid / asset.usefulLifeMonths) * remainingMonths;
  return { eligible: true, correctionAmount: Math.round(correctionAmount * 100) / 100, remainingMonths };
}

function mapAsset(row: Record<string, unknown>): Asset {
  return {
    id: Number(row.id), brand: row.brand as string,
    description: row.description as string,
    purchaseDate: (row.purchase_date as Date).toISOString().split('T')[0],
    netPurchasePrice: Number(row.net_purchase_price),
    vatPaid: Number(row.vat_paid),
    usefulLifeMonths: Number(row.useful_life_months),
    correctionStartDate: row.correction_start_date
      ? (row.correction_start_date as Date).toISOString().split('T')[0] : undefined,
    isGwg: Boolean(row.is_gwg),
  };
}

// ---- Gewerbesteuer Kalkulator ----

const GEWST_FREIBETRAG    = 24_500;
const GEWST_STEUERMESSZAHL = 0.035;

export interface GewerbesteuerResult {
  gewerbeertrag: number; messbetrag: number; gewerbesteuer: number;
  anrechenbareGewerbesteuer: number;
}

export function calculateGewerbesteuer(p: {
  profit: number;
  hinzurechnungen?: number;
  kuerzungen?: number;
  hebesatz: number;
  isKapitalgesellschaft?: boolean;
}): GewerbesteuerResult {
  const freibetrag = p.isKapitalgesellschaft ? 0 : GEWST_FREIBETRAG;
  const rawErtrag  = p.profit + (p.hinzurechnungen ?? 0) - (p.kuerzungen ?? 0);
  const gewerbeertrag = Math.max(0, rawErtrag - freibetrag);
  const gewerbeertragRounded = Math.floor(gewerbeertrag / 100) * 100;
  const messbetrag      = Math.round(gewerbeertragRounded * GEWST_STEUERMESSZAHL * 100) / 100;
  const gewerbesteuer   = Math.round(messbetrag * (p.hebesatz / 100) * 100) / 100;
  const anrechenbareGewerbesteuer = messbetrag * 4.0;
  return { gewerbeertrag: gewerbeertragRounded, messbetrag, gewerbesteuer, anrechenbareGewerbesteuer };
}
