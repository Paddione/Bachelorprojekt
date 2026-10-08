// components/website/src/lib/appointment-notify.ts
// Notify core for T901025: German service templates, dedupe, retry, log.
// Pure module (S2): only ./email.js and ./appointment-requests.js symbols.
//
// Persistence decision (no migration needed): the send log lives in
// inbox_items.payload.notify (T901024 precedent — requests live in the
// inbox payload, the 20261008 migration is dropped). Small volume (a few
// entries per request), atomic (log append rides the status UPDATE) and
// simple deletion (row deletion removes the log, no orphans).

import { sendEmail } from './email.js';
import type { AppointmentRequest } from './appointment-requests.js';

const PROD_DOMAIN = process.env.PROD_DOMAIN || '';

export const MAX_NOTIFY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 4000];

export type NotifyKind =
  | 'bestaetigung' | 'erinnerung' | 'storno' | 'umbuchung' | 'eingang' | 'absage';
export type NotifyDeliveryStatus = 'versandt' | 'fehlgeschlagen' | 'ausstehend';

export interface NotifyParams {
  request: AppointmentRequest;
  kind: NotifyKind;
  manageUrl: string;
  slotLabel?: string;
  typeLabel?: string;
  note?: string;
  brandName?: string;
}

export interface NotifyResult {
  ok: boolean;
  kind: NotifyKind;
  key: string;
  attempts: number;
  error?: string;
}

export interface NotifyLogEntry {
  key: string;
  kind: NotifyKind;
  status: 'sent' | 'failed';
  attempts: number;
  at: string;
  error?: string;
}

export interface SendNotifyDeps {
  mailer?: (mail: { to: string; subject: string; text: string; html: string }, request?: Request) => Promise<boolean>;
  request?: Request;
  log?: readonly NotifyLogEntry[];
  sleep?: (ms: number) => Promise<void>;
}

/** Stable dedupe key: one entry per request and message kind. */
export function dedupeKey(requestId: number, kind: NotifyKind): string {
  return `notify:${requestId}:${kind}`;
}

/** Local Berlin date-time (de-DE, weekday + date + time), never throws. */
export function formatNotifyDateTime(slotStartISO: string, fallback?: string | null): string {
  const date = new Date(slotStartISO);
  if (Number.isNaN(date.getTime())) return fallback ?? slotStartISO;
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit',
    month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Token manage link after the email.ts pattern; relative without PROD_DOMAIN. */
export function notifyManageUrl(token: string): string {
  return PROD_DOMAIN ? `https://web.${PROD_DOMAIN}/anfrage/${token}` : `/anfrage/${token}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Template rails (T901019): all six kinds are ad-free German service notes
// with minimal data (name, service, date, time, token link) and no treatment
// promises, condition references or anamnesis fields. No access details.
// - eingang: receipt right after the request (callback vs appointment branch).
// - bestaetigung: acceptance notice after the owner decision.
// - absage: rejection notice with the optional owner note.
// - erinnerung: plain 24h service reminder for contract handling.
// - storno: cancellation confirmation for the guest.
// - umbuchung: new-appointment notice after rescheduling.
export function renderNotify(params: NotifyParams): { subject: string; text: string; html: string } {
  const { request, kind, manageUrl } = params;
  const brand = params.brandName ?? 'Workspace';
  const service = request.serviceName ?? 'Termin';
  const when = params.slotLabel
    ?? (request.slotStart !== null ? formatNotifyDateTime(request.slotStart, request.slotDisplay) : (request.slotDisplay ?? 'Rückruf'));
  const slotShort = request.slotDisplay ?? request.slotStart ?? 'Rückruf';
  const typeLabel = params.typeLabel ?? service;
  const note = (params.note ?? '').trim();
  const head = (title: string) => `<p>Hallo ${escapeHtml(request.name)},</p><p><strong>${escapeHtml(title)}</strong></p>`;
  const foot = `<p>Verwalten: <a href="${escapeHtml(manageUrl)}">${escapeHtml(manageUrl)}</a><br>Mit freundlichen Grüßen<br>${escapeHtml(brand)}</p>`;
  const body = (lines: string[]) => lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  switch (kind) {
    case 'eingang': {
      if (request.slotStart === null) {
        return {
          subject: `Rückruf-Anfrage bei ${brand}`,
          text: `Hallo ${request.name},\n\nvielen Dank für Ihre Rückruf-Anfrage bei ${brand}.\n\nWir melden uns in Kürze${request.phone ? ` unter ${request.phone}` : ''} bei Ihnen.\n\nIhren persönlichen Verwaltungs-Link finden Sie hier:\n${manageUrl}\nBitte bewahren Sie diesen Link auf.\n\nMit freundlichen Grüßen\n${brand}`,
          html: `${head(`Rückruf-Anfrage bei ${brand}`)}${body([`Wir melden uns in Kürze${request.phone ? ` unter ${request.phone}` : ''} bei Ihnen.`])}${foot}`,
        };
      }
      return {
        subject: `Terminanfrage: ${typeLabel} am ${when}`,
        text: `Hallo ${request.name},\n\nvielen Dank für Ihre Terminanfrage bei ${brand}.\n\nIhr gewünschter Termin:\n  Typ:     ${typeLabel}\n  Termin:  ${when}\n\nWir prüfen Ihre Anfrage und melden uns in Kürze mit einer Bestätigung.\n\nIhren persönlichen Verwaltungs-Link finden Sie hier:\n${manageUrl}\nBitte bewahren Sie diesen Link auf.\n\nMit freundlichen Grüßen\n${brand}`,
        html: `${head(`Terminanfrage: ${typeLabel}`)}${body([`Ihr gewünschter Termin: ${when}.`, 'Wir prüfen Ihre Anfrage und melden uns in Kürze mit einer Bestätigung.'])}${foot}`,
      };
    }
    case 'bestaetigung':
      return {
        subject: `Termin bestätigt: ${request.serviceName ?? 'Ihre Anfrage'} (${slotShort})`,
        text: `Hallo ${request.name},\n\nIhr Termin bei ${brand} ist bestätigt:\n\n  Leistung: ${service}\n  Termin:   ${when}\n\nVerwalten: ${manageUrl}\n\nWir freuen uns auf Sie!\n\nMit freundlichen Grüßen\n${brand}`,
        html: `${head(`Termin bestätigt: ${service}`)}${body([`Ihr Termin: ${when}.`, 'Wir freuen uns auf Sie!'])}${foot}`,
      };
    case 'absage':
      return {
        subject: `Absage: Ihre Terminanfrage bei ${brand}`,
        text: `Hallo ${request.name},\n\nleider können wir Ihre Terminanfrage (${service}, ${when}) nicht bestätigen.${note !== '' ? `\n\nNotiz:\n${note}` : ''}\n\nVerwalten: ${manageUrl}\n\nGerne finden wir gemeinsam einen anderen Termin.\n\nMit freundlichen Grüßen\n${brand}`,
        html: `${head('Absage Ihrer Terminanfrage')}${body([`Leider können wir Ihre Terminanfrage (${service}, ${when}) nicht bestätigen.`, ...(note !== '' ? [`Notiz: ${note}`] : []), 'Gerne finden wir gemeinsam einen anderen Termin.'])}${foot}`,
      };
    case 'erinnerung':
      return {
        subject: `Erinnerung — Ihr Termin am ${when}`,
        text: `Hallo ${request.name},\n\nzur Erinnerung: Ihr Termin bei ${brand} findet statt:\n\n  Leistung: ${service}\n  Termin:   ${when}\n\nBei Bedarf können Sie ihn hier verwalten:\n${manageUrl}\n\nMit freundlichen Grüßen\n${brand}`,
        html: `${head(`Erinnerung: Ihr Termin am ${when}`)}${body([`Leistung: ${service}.`, 'Bei Bedarf können Sie ihn über den Link unten verwalten.'])}${foot}`,
      };
    case 'storno':
      return {
        subject: `Stornobestätigung: ${service} (${slotShort})`,
        text: `Hallo ${request.name},\n\nIhr Termin bei ${brand} wurde storniert:\n\n  Leistung: ${service}\n  Termin:   ${when}\n\nVerwalten: ${manageUrl}\n\nGerne buchen Sie bei Bedarf einen neuen Termin.\n\nMit freundlichen Grüßen\n${brand}`,
        html: `${head('Ihr Termin wurde storniert')}${body([`Leistung: ${service}.`, `Termin: ${when}.`, 'Gerne buchen Sie bei Bedarf einen neuen Termin.'])}${foot}`,
      };
    case 'umbuchung':
      return {
        subject: `Umbuchung bestätigt — ${service} (${slotShort})`,
        text: `Hallo ${request.name},\n\nIhr Termin bei ${brand} wurde umgebucht. Ihr neuer Termin:\n\n  Leistung: ${service}\n  Termin:   ${when}\n\nIhren persönlichen Verwaltungs-Link finden Sie hier:\n${manageUrl}\n\nMit freundlichen Grüßen\n${brand}`,
        html: `${head('Ihr Termin wurde umgebucht')}${body([`Leistung: ${service}.`, `Neuer Termin: ${when}.`])}${foot}`,
      };
  }
}

function isNotifyKind(value: unknown): value is NotifyKind {
  return value === 'bestaetigung' || value === 'erinnerung' || value === 'storno'
    || value === 'umbuchung' || value === 'eingang' || value === 'absage';
}

/** Reads validated notify entries from an inbox payload (empty when absent). */
export function readNotifyLog(payload: Record<string, unknown>): NotifyLogEntry[] {
  const raw = payload.notify;
  if (!Array.isArray(raw)) return [];
  const out: NotifyLogEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.key !== 'string' || !isNotifyKind(row.kind)) continue;
    if (row.status !== 'sent' && row.status !== 'failed') continue;
    if (typeof row.attempts !== 'number' || typeof row.at !== 'string') continue;
    out.push({ key: row.key, kind: row.kind, status: row.status, attempts: row.attempts, at: row.at, ...(typeof row.error === 'string' ? { error: row.error } : {}) });
  }
  return out;
}

/** Delivery status for one request: failed wins over sent over pending. */
export function notifyStatusFor(payload: Record<string, unknown>): NotifyDeliveryStatus {
  const latest = new Map<string, 'sent' | 'failed'>();
  for (const entry of readNotifyLog(payload)) latest.set(entry.key, entry.status);
  let seenSent = false;
  for (const status of latest.values()) {
    if (status === 'failed') return 'fehlgeschlagen';
    if (status === 'sent') seenSent = true;
  }
  return seenSent ? 'versandt' : 'ausstehend';
}

/** Kind of the most recent failed send, for the owner resend route. */
export function lastFailedNotifyKind(payload: Record<string, unknown>): NotifyKind | null {
  const entries = readNotifyLog(payload);
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index] as NotifyLogEntry;
    if (entry.status !== 'failed') continue;
    const superseded = entries.slice(index + 1).some((later) => later.key === entry.key && later.status === 'sent');
    if (!superseded) return entry.kind;
  }
  return null;
}

/** True when the slot starts within the next 24h; closed on bad input. */
export function isReminderDue(slotStartISO: string, now: Date = new Date()): boolean {
  const slot = new Date(slotStartISO);
  if (Number.isNaN(slot.getTime()) || Number.isNaN(now.getTime())) return false;
  const diffMs = slot.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= 24 * 3600 * 1000;
}

/**
 * Sends one templated mail with dedupe + retry. Already-sent keys return
 * immediately; otherwise up to MAX_NOTIFY_ATTEMPTS with backoff. The result
 * carries attempts/error — callers persist it via appendNotifyLog.
 */
export async function sendNotify(params: NotifyParams, deps: SendNotifyDeps = {}): Promise<NotifyResult> {
  const { request, kind } = params;
  const key = dedupeKey(request.id, kind);
  const log = deps.log ?? [];
  if (log.some((entry) => entry.key === key && entry.status === 'sent')) {
    return { ok: true, kind, key, attempts: 0 };
  }
  const mailer = deps.mailer ?? ((mail, req) => sendEmail({ to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }, req));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }));
  const rendered = renderNotify(params);
  let error = 'Unbekannter Fehler';
  for (let attempt = 1; attempt <= MAX_NOTIFY_ATTEMPTS; attempt++) {
    try {
      const mailed = await mailer({ to: request.email, subject: rendered.subject, text: rendered.text, html: rendered.html }, deps.request);
      if (mailed) return { ok: true, kind, key, attempts: attempt };
      error = 'Versand fehlgeschlagen';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unbekannter Fehler';
    }
    if (attempt < MAX_NOTIFY_ATTEMPTS) await sleep(RETRY_DELAYS_MS[attempt - 1] as number);
  }
  return { ok: false, kind, key, attempts: MAX_NOTIFY_ATTEMPTS, error };
}

/** Builds the log entry for a send result (same shape on every route). */
export function notifyEntryFromResult(result: NotifyResult, at: string = new Date().toISOString()): NotifyLogEntry {
  return { key: result.key, kind: result.kind, status: result.ok ? 'sent' : 'failed', attempts: result.attempts, at, ...(result.ok || result.error === undefined ? {} : { error: result.error }) };
}

/** Pure log append: caps payload.notify at the last 20 entries, no writes. */
export function appendNotifyLog(payload: Record<string, unknown>, entry: NotifyLogEntry): Record<string, unknown> {
  const entries = readNotifyLog(payload);
  entries.push(entry);
  return { ...payload, notify: entries.slice(-20) };
}
