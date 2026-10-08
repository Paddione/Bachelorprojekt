// components/website/src/lib/invoices.ts
// Basis-Rechnungen für die Massage-Praxis (T901027, Slug basic-invoices).
// Regelquelle: massage-privacy-requirements README §5 (§14-Pflichtangaben,
// §19-Hinweis, Aufbewahrung §257 HGB / §147 AO / GoBD). Recherche-Checkliste,
// keine Rechts- oder Steuerberatung. Belege liegen in public.massage_invoices
// (NICHT billing_invoices: Portal-Billing, keine Umnutzung). Kein
// Online-Payment: Zahlung ist nur der manuelle Statuswechsel mit Methode
// sepa|cash|bank|other. Aufrufer-Vertrag: Brand-Filter und
// is_test_data-Ausschluss passieren beim Laden. Der Katalogpreis ist
// Platzhalter und wird nie gelesen; unitPriceCents kommt explizit aus dem
// Aufruf und wird eingefroren. Snapshot-Spalten werden nie per UPDATE
// verändert; Korrektur nur per Storno und Neuausstellung (Nachfolger mit
// appointment_token NULL, Verknüpfung über cancels_invoice_id).

import { pool } from './website-db.js';
import { getSiteSetting } from './website-core-db.js';

export const KLEINUNTERNEHMER_NOTE =
  'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet';

export type TaxMode = 'kleinunternehmer' | 'regelbesteuerung';
export type InvoiceStatus = 'offen' | 'bezahlt' | 'storniert';
export type PaymentMethod = 'sepa' | 'cash' | 'bank' | 'other';

// Kleinunternehmer ist Default an.
export const DEFAULT_TAX_MODE: TaxMode = 'kleinunternehmer';

// ── Reine Bausteine (kein DB-Zugriff) ───────────────────────────────────────

export function formatInvoiceNumber(year: number, seq: number): string {
  if (!Number.isInteger(year) || year < 2000) throw new RangeError('Jahr muss eine ganze Zahl >= 2000 sein');
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError('Folgenummer muss eine ganze Zahl >= 1 sein');
  return `${year}-${String(seq).padStart(4, '0')}`;
}

export function nextSequenceNumber(last: number): number {
  if (!Number.isInteger(last) || last < 0) throw new RangeError('last_number muss eine ganze Zahl >= 0 sein');
  return last + 1;
}

export interface InvoiceSnapshotInput {
  customerName: string; customerContact: string;
  serviceKey: string; serviceName: string; serviceDurationMin: number;
  unitPriceCents: number; taxMode: TaxMode; taxRate: number;
  issueDate: string; serviceDate: string; appointmentToken?: string;
}

export interface InvoiceSnapshot {
  customerName: string; customerContact: string;
  serviceKey: string; serviceName: string; serviceDurationMin: number;
  unitPriceCents: number; taxMode: TaxMode; taxRate: number;
  taxAmountCents: number; grossAmountCents: number; taxNote: string | null;
  issueDate: string; serviceDate: string; appointmentToken: string | null;
}

export type CreateInvoiceInput = Omit<InvoiceSnapshotInput, 'taxMode'> & {
  taxMode?: TaxMode; notes?: string;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === m && probe.getUTCDate() === d;
}

function nonEmpty(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RangeError(`${field} darf nicht leer sein`);
  return value.trim();
}

export function buildSnapshot(input: InvoiceSnapshotInput): InvoiceSnapshot {
  const customerName = nonEmpty(input.customerName, 'customerName');
  const customerContact = nonEmpty(input.customerContact, 'customerContact');
  const serviceKey = nonEmpty(input.serviceKey, 'serviceKey');
  const serviceName = nonEmpty(input.serviceName, 'serviceName');
  if (!Number.isInteger(input.serviceDurationMin) || input.serviceDurationMin < 0) {
    throw new RangeError('serviceDurationMin muss eine ganze Zahl >= 0 sein');
  }
  if (!Number.isInteger(input.unitPriceCents) || input.unitPriceCents < 0) {
    throw new RangeError('unitPriceCents muss eine ganze Zahl >= 0 sein');
  }
  if (input.taxMode !== 'kleinunternehmer' && input.taxMode !== 'regelbesteuerung') {
    throw new RangeError('taxMode muss kleinunternehmer oder regelbesteuerung sein');
  }
  if (typeof input.taxRate !== 'number' || !Number.isFinite(input.taxRate) || input.taxRate < 0) {
    throw new RangeError('taxRate muss eine Zahl >= 0 sein');
  }
  if (!isRealDay(input.issueDate)) throw new RangeError('issueDate muss ein reales YYYY-MM-DD-Datum sein');
  if (!isRealDay(input.serviceDate)) throw new RangeError('serviceDate muss ein reales YYYY-MM-DD-Datum sein');
  const appointmentToken = input.appointmentToken === undefined ? null : nonEmpty(input.appointmentToken, 'appointmentToken');
  const base = {
    customerName, customerContact, serviceKey, serviceName,
    serviceDurationMin: input.serviceDurationMin, unitPriceCents: input.unitPriceCents,
    issueDate: input.issueDate, serviceDate: input.serviceDate, appointmentToken,
  };
  if (input.taxMode === 'kleinunternehmer') {
    // Kein Steuerausweis, dafür der §19-Hinweis; taxRate-Eingaben verfallen.
    return { ...base, taxMode: input.taxMode, taxRate: 0, taxAmountCents: 0,
      grossAmountCents: input.unitPriceCents, taxNote: KLEINUNTERNEHMER_NOTE };
  }
  const taxAmountCents = Math.round((input.unitPriceCents * input.taxRate) / 100);
  return { ...base, taxMode: input.taxMode, taxRate: input.taxRate, taxAmountCents,
    grossAmountCents: input.unitPriceCents + taxAmountCents, taxNote: null };
}

export interface Creditor { name: string; address: string; taxId: string; }

export function validatePflichtangaben(snapshot: InvoiceSnapshot, creditor: Creditor): string[] {
  const missing: string[] = [];
  if (creditor.name.trim() === '') missing.push('Leistender: Name fehlt');
  if (creditor.address.trim() === '') missing.push('Leistender: Anschrift fehlt');
  if (creditor.taxId.trim() === '') missing.push('Leistender: Steuernummer oder USt-IdNr. fehlt');
  if (snapshot.customerName.trim() === '') missing.push('Empfänger: Name fehlt');
  if (snapshot.customerContact.trim() === '') missing.push('Empfänger: Kontakt fehlt');
  if (snapshot.serviceName.trim() === '') missing.push('Art und Umfang der Leistung fehlt');
  if (!isRealDay(snapshot.issueDate)) missing.push('Rechnungsdatum fehlt oder ist ungültig');
  if (!isRealDay(snapshot.serviceDate)) missing.push('Leistungsdatum fehlt oder ist ungültig');
  if (!Number.isInteger(snapshot.unitPriceCents) || snapshot.unitPriceCents < 0) missing.push('Entgelt fehlt oder ist ungültig');
  if (snapshot.taxMode === 'kleinunternehmer') {
    if (!snapshot.taxNote) missing.push('Steuerbefreiungs-Hinweis (§ 19 UStG) fehlt');
  } else if (snapshot.taxNote) {
    missing.push('Steuerbefreiungs-Hinweis darf im Regelmodus nicht gesetzt sein');
  }
  // Die Nummer vergibt die Sequenz beim Insert (Format: formatInvoiceNumber).
  return missing;
}

export interface CatalogService { serviceName: string; serviceDurationMin: number; }

type CatalogEntry = Record<string, unknown>;

function serviceLists(catalog: unknown): CatalogEntry[] {
  if (Array.isArray(catalog)) return catalog as CatalogEntry[];
  if (typeof catalog !== 'object' || catalog === null) return [];
  const root = catalog as Record<string, unknown>;
  if (Array.isArray(root.services)) return root.services as CatalogEntry[];
  if (!Array.isArray(root.categories)) return [];
  const out: CatalogEntry[] = [];
  for (const category of root.categories as CatalogEntry[]) {
    if (category && Array.isArray(category.services)) out.push(...(category.services as CatalogEntry[]));
  }
  return out;
}

export function resolveCatalogService(catalog: unknown, serviceKey: string): CatalogService {
  if (typeof serviceKey !== 'string' || serviceKey.trim() === '') throw new RangeError('serviceKey darf nicht leer sein');
  for (const entry of serviceLists(catalog)) {
    if (entry.key !== serviceKey) continue;
    if (typeof entry.name !== 'string' || entry.name.trim() === '') {
      throw new RangeError(`Katalogeintrag ${JSON.stringify(serviceKey)} ohne Namen`);
    }
    if (typeof entry.durationMin !== 'number' || !Number.isInteger(entry.durationMin) || entry.durationMin < 0) {
      throw new RangeError(`Katalogeintrag ${JSON.stringify(serviceKey)} ohne gültige Dauer`);
    }
    return { serviceName: entry.name, serviceDurationMin: entry.durationMin };
  }
  throw new RangeError(`unbekannter Leistungsschlüssel: ${JSON.stringify(serviceKey)}`);
}

export function canTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return from === 'offen' && (to === 'bezahlt' || to === 'storniert');
}

export function correctionReference(originalId: string): { cancelsInvoiceId: string } {
  if (typeof originalId !== 'string' || originalId.trim() === '') throw new RangeError('Original-Rechnungs-ID erforderlich');
  return { cancelsInvoiceId: originalId.trim() };
}

export class InvoiceDuplicateError extends Error {
  constructor(message: string) { super(message); this.name = 'InvoiceDuplicateError'; }
}

// ── DB-Funktionen ───────────────────────────────────────────────────────────

export interface MassageInvoice {
  id: string; brand: string; invoiceYear: number; invoiceNumber: number; number: string;
  status: InvoiceStatus; paymentMethod: PaymentMethod | null;
  customerName: string; customerContact: string;
  serviceKey: string; serviceName: string; serviceDurationMin: number;
  unitPriceCents: number; taxMode: TaxMode; taxRate: number;
  taxAmountCents: number; grossAmountCents: number; taxNote: string | null;
  issueDate: string; serviceDate: string; appointmentToken: string | null;
  cancelsInvoiceId: string | null; notes: string | null;
  isTestData: boolean; createdAt: string; updatedAt: string;
}

interface MassageInvoiceRow {
  id: string; brand: string; invoice_year: number; invoice_number: number;
  customer_name: string; customer_contact: string;
  service_key: string; service_name: string; service_duration_min: number;
  unit_price_cents: number; tax_mode: string; tax_rate: string | number;
  tax_amount_cents: number; gross_amount_cents: number; tax_note: string | null;
  issue_date: string | Date; service_date: string | Date;
  status: string; payment_method: string | null; appointment_token: string | null;
  cancels_invoice_id: string | null; notes: string | null; is_test_data: boolean;
  created_at: string | Date; updated_at: string | Date;
}

type DbClient = import('pg').PoolClient;

function toDateString(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function asStatus(value: string): InvoiceStatus {
  if (value === 'offen' || value === 'bezahlt' || value === 'storniert') return value;
  throw new Error(`unbekannter Rechnungsstatus: ${JSON.stringify(value)}`);
}

function asTaxMode(value: string): TaxMode {
  if (value === 'kleinunternehmer' || value === 'regelbesteuerung') return value;
  throw new Error(`unbekannter Steuermodus: ${JSON.stringify(value)}`);
}

function asPaymentMethod(value: string | null): PaymentMethod | null {
  if (value === null) return null;
  if (value === 'sepa' || value === 'cash' || value === 'bank' || value === 'other') return value;
  throw new Error(`unbekannte Zahlungsmethode: ${JSON.stringify(value)}`);
}

function mapInvoice(row: MassageInvoiceRow): MassageInvoice {
  const year = Number(row.invoice_year);
  const seq = Number(row.invoice_number);
  return {
    id: row.id, brand: row.brand, invoiceYear: year, invoiceNumber: seq,
    number: formatInvoiceNumber(year, seq),
    status: asStatus(row.status), paymentMethod: asPaymentMethod(row.payment_method),
    customerName: row.customer_name, customerContact: row.customer_contact,
    serviceKey: row.service_key, serviceName: row.service_name,
    serviceDurationMin: Number(row.service_duration_min),
    unitPriceCents: Number(row.unit_price_cents), taxMode: asTaxMode(row.tax_mode),
    taxRate: Number(row.tax_rate), taxAmountCents: Number(row.tax_amount_cents),
    grossAmountCents: Number(row.gross_amount_cents), taxNote: row.tax_note,
    issueDate: toDateString(row.issue_date), serviceDate: toDateString(row.service_date),
    appointmentToken: row.appointment_token, cancelsInvoiceId: row.cancels_invoice_id,
    notes: row.notes, isTestData: row.is_test_data,
    createdAt: toDateString(row.created_at), updatedAt: toDateString(row.updated_at),
  };
}

function isPgUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err
    && (err as { code?: unknown }).code === '23505';
}

async function withTx<T>(work: (client: DbClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await work(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* Originalfehler zählt */ }
    if (isPgUniqueViolation(err)) throw new InvoiceDuplicateError('Für diesen Termin existiert bereits eine Rechnung.');
    throw err;
  } finally {
    client.release();
  }
}

async function bumpSequence(client: DbClient, brand: string, year: number): Promise<number> {
  await client.query(
    `INSERT INTO public.massage_invoice_sequences (brand, invoice_year, last_number)
     VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`, [brand, year]);
  const current = await client.query<{ last_number: number }>(
    `SELECT last_number FROM public.massage_invoice_sequences
     WHERE brand = $1 AND invoice_year = $2 FOR UPDATE`, [brand, year]);
  const next = nextSequenceNumber(Number(current.rows[0].last_number));
  await client.query(
    `UPDATE public.massage_invoice_sequences SET last_number = $3
     WHERE brand = $1 AND invoice_year = $2`, [brand, year, next]);
  return next;
}

async function lockInvoice(client: DbClient, id: string): Promise<MassageInvoiceRow> {
  const found = await client.query<MassageInvoiceRow>(
    `SELECT * FROM public.massage_invoices WHERE id = $1 FOR UPDATE`, [id]);
  const row = found.rows[0] ?? null;
  if (!row) throw new Error('invoice not found');
  return row;
}

async function resolveTaxMode(brand: string, override: TaxMode | undefined): Promise<TaxMode> {
  if (override) return override;
  const configured = await getSiteSetting(brand, 'tax_mode');
  if (configured === 'kleinunternehmer' || configured === 'regelbesteuerung') return configured;
  return DEFAULT_TAX_MODE;
}

async function readCreditor(brand: string): Promise<Creditor> {
  const [name, address, taxId] = await Promise.all([
    getSiteSetting(brand, 'creditor_name'),
    getSiteSetting(brand, 'creditor_address'),
    getSiteSetting(brand, 'creditor_tax_id'),
  ]);
  return { name: name ?? '', address: address ?? '', taxId: taxId ?? '' };
}

function assertPflichtangaben(snapshot: InvoiceSnapshot, creditor: Creditor): void {
  const missing = validatePflichtangaben(snapshot, creditor);
  if (missing.length > 0) throw new RangeError(`Pflichtangaben unvollständig: ${missing.join('; ')}`);
}

function cleanNotes(notes: string | undefined): string | null {
  return notes?.trim() ? notes.trim() : null;
}

export async function nextInvoiceNumber(brand: string, year: number): Promise<number> {
  if (!Number.isInteger(year) || year < 2000) throw new RangeError('Jahr muss eine ganze Zahl >= 2000 sein');
  return withTx((client) => bumpSequence(client, brand, year));
}

const INSERT_COLUMNS = `brand, invoice_year, invoice_number, customer_name, customer_contact,
  service_key, service_name, service_duration_min, unit_price_cents,
  tax_mode, tax_rate, tax_amount_cents, gross_amount_cents, tax_note,
  issue_date, service_date, status, appointment_token, cancels_invoice_id, notes`;

function insertParams(brand: string, year: number, seq: number, snapshot: InvoiceSnapshot,
    cancelsInvoiceId: string | null, notes: string | null): Array<string | number | null> {
  return [brand, year, seq, snapshot.customerName, snapshot.customerContact,
    snapshot.serviceKey, snapshot.serviceName, snapshot.serviceDurationMin,
    snapshot.unitPriceCents, snapshot.taxMode, snapshot.taxRate,
    snapshot.taxAmountCents, snapshot.grossAmountCents, snapshot.taxNote,
    snapshot.issueDate, snapshot.serviceDate, 'offen',
    snapshot.appointmentToken, cancelsInvoiceId, notes];
}

export async function createInvoice(brand: string, input: CreateInvoiceInput): Promise<MassageInvoice> {
  const snapshot = buildSnapshot({ ...input, taxMode: await resolveTaxMode(brand, input.taxMode) });
  assertPflichtangaben(snapshot, await readCreditor(brand));
  const year = Number(snapshot.issueDate.slice(0, 4));
  const notes = cleanNotes(input.notes);
  return withTx(async (client) => {
    const seq = await bumpSequence(client, brand, year);
    const inserted = await client.query<MassageInvoiceRow>(
      `INSERT INTO public.massage_invoices (${INSERT_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      insertParams(brand, year, seq, snapshot, null, notes));
    return mapInvoice(inserted.rows[0]);
  });
}

export async function markPaid(id: string, method: PaymentMethod, paidBy: string): Promise<MassageInvoice> {
  void paidBy;
  if (method !== 'sepa' && method !== 'cash' && method !== 'bank' && method !== 'other') {
    throw new RangeError('Methode muss sepa, cash, bank oder other sein.');
  }
  return withTx(async (client) => {
    const current = asStatus((await lockInvoice(client, id)).status);
    if (!canTransition(current, 'bezahlt')) throw new Error(`illegal transition ${current} -> bezahlt`);
    const updated = await client.query<MassageInvoiceRow>(
      `UPDATE public.massage_invoices SET status = 'bezahlt', payment_method = $2, updated_at = now()
       WHERE id = $1 RETURNING *`, [id, method]);
    return mapInvoice(updated.rows[0]);
  });
}

export async function markStorniert(id: string, reason: string): Promise<MassageInvoice> {
  if (reason.trim() === '') throw new RangeError('Storno-Begründung erforderlich.');
  return withTx(async (client) => {
    const current = asStatus((await lockInvoice(client, id)).status);
    if (!canTransition(current, 'storniert')) throw new Error(`illegal transition ${current} -> storniert`);
    const updated = await client.query<MassageInvoiceRow>(
      `UPDATE public.massage_invoices SET status = 'storniert', updated_at = now(),
         notes = CASE WHEN notes IS NULL OR notes = '' THEN $2 ELSE notes || E'\n' || $2 END
       WHERE id = $1 RETURNING *`, [id, `Storniert: ${reason.trim()}`]);
    return mapInvoice(updated.rows[0]);
  });
}

export async function correctInvoice(id: string, corrected: CreateInvoiceInput, correctedBy: string)
    : Promise<{ storno: MassageInvoice; successor: MassageInvoice }> {
  void correctedBy;
  // Begründung aus corrected.notes: landet auf beiden Belegen.
  const successorNote = cleanNotes(corrected.notes) ?? 'Korrektur';
  return withTx(async (client) => {
    const original = mapInvoice(await lockInvoice(client, id));
    if (!canTransition(original.status, 'storniert')) throw new Error(`invoice already ${original.status}`);
    const snapshot = buildSnapshot({ ...corrected, taxMode: corrected.taxMode ?? original.taxMode });
    assertPflichtangaben(snapshot, await readCreditor(original.brand));
    const ref = correctionReference(original.id);
    const year = Number(snapshot.issueDate.slice(0, 4));
    const seq = await bumpSequence(client, original.brand, year);
    const successorSnapshot: InvoiceSnapshot = { ...snapshot, appointmentToken: null };
    const inserted = await client.query<MassageInvoiceRow>(
      `INSERT INTO public.massage_invoices (${INSERT_COLUMNS})
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      insertParams(original.brand, year, seq, successorSnapshot, ref.cancelsInvoiceId, successorNote));
    const successor = mapInvoice(inserted.rows[0]);
    const stornoRows = await client.query<MassageInvoiceRow>(
      `UPDATE public.massage_invoices SET status = 'storniert', updated_at = now(),
         notes = CASE WHEN notes IS NULL OR notes = '' THEN $2 ELSE notes || E'\n' || $2 END
       WHERE id = $1 RETURNING *`,
      [original.id, `Storniert, ersetzt durch ${successor.number}: ${successorNote}`]);
    return { storno: mapInvoice(stornoRows.rows[0]), successor };
  });
}

export async function getInvoice(id: string): Promise<MassageInvoice | null> {
  const result = await pool.query<MassageInvoiceRow>(
    `SELECT * FROM public.massage_invoices WHERE id = $1 AND is_test_data = false`, [id]);
  const row = result.rows[0] ?? null;
  return row ? mapInvoice(row) : null;
}

export async function listInvoices(brand: string): Promise<MassageInvoice[]> {
  const result = await pool.query<MassageInvoiceRow>(
    `SELECT * FROM public.massage_invoices WHERE brand = $1 AND is_test_data = false
     ORDER BY invoice_year DESC, invoice_number DESC`, [brand]);
  return result.rows.map(mapInvoice);
}

export async function findInvoiceByAppointmentToken(appointmentToken: string): Promise<MassageInvoice | null> {
  const result = await pool.query<MassageInvoiceRow>(
    `SELECT * FROM public.massage_invoices WHERE appointment_token = $1 AND is_test_data = false
     ORDER BY invoice_year DESC, invoice_number DESC LIMIT 1`, [appointmentToken]);
  const row = result.rows[0] ?? null;
  return row ? mapInvoice(row) : null;
}
