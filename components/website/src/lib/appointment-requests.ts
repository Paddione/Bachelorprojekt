// components/website/src/lib/appointment-requests.ts
// Request core for visitor appointment requests (T901024): state machine,
// request tokens, Berlin lead time, idempotency keys, inbox row mapping.
//
// Persistence decision (no migration needed): requests live in the existing
// inbox_items table, whose payload JSONB column plus reference_id/status
// columns already cover every request field —
// - Request-State (`offen`, `bestaetigt`, `abgelehnt`, `storniert`) lives in
//   `payload.state`; transitions are enforced by `transitionRequest` below.
// - inbox_items.status mirrors coarsely: `pending` while `offen`, otherwise
//   `actioned`; `payload.outcome` keeps the terminal state.
// - The request token lives in `payload.token` and additionally in
//   `reference_id` (lookup column, readable without new query helpers).
// - The idempotency key lives in `payload.idempotencyKey` (24h dedupe
//   window in the creation path, no UNIQUE constraint needed).
// Hence no new table, column or index — the 20261008 migration is dropped.
//
// Pure module (S2): the only imports are node:crypto and the import-free
// berlinDayKey helper. No DB/API imports, no env/pool/clock access except
// through parameters — callers inject rows, dates and query results.

import { randomBytes } from 'node:crypto';
import { berlinDayKey } from './caldav-cache';

// ── States ──────────────────────────────────────────────────────────────────

export type RequestState = 'offen' | 'bestaetigt' | 'abgelehnt' | 'storniert';

export class TransitionError extends Error {
  readonly from: RequestState;
  readonly to: RequestState;
  constructor(from: RequestState, to: RequestState) {
    super(`Request-Übergang ${from} -> ${to} ist nicht erlaubt.`);
    this.name = 'TransitionError';
    this.from = from;
    this.to = to;
  }
}

const TRANSITIONS: Record<RequestState, readonly RequestState[]> = {
  offen: ['bestaetigt', 'abgelehnt', 'storniert'],
  bestaetigt: ['storniert'],
  abgelehnt: [],
  storniert: [],
};

/** Applies a request state transition, throwing TransitionError if illegal. */
export function transitionRequest(from: RequestState, to: RequestState): RequestState {
  if (!TRANSITIONS[from].includes(to)) throw new TransitionError(from, to);
  return to;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

const TOKEN_RE = /^[A-Za-z0-9_-]{22,128}$/;

/** Generates a URL-safe request token (128 bit entropy, base64url). */
export function generateRequestToken(): string {
  return randomBytes(16).toString('base64url');
}

/** Pure format validation — no DB lookup, no existence signal. */
export function isValidRequestTokenFormat(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

// ── Lead time (Berlin previous-day rule) ────────────────────────────────────

/**
 * True when the slot's Berlin calendar day is strictly after the request's
 * Berlin calendar day. DST-safe via berlinDayKey, no manual offsets.
 * Fails closed (false) on unparseable input.
 */
export function isLeadTimeOk(slotStartISO: string, now: Date = new Date()): boolean {
  const slot = new Date(slotStartISO);
  if (Number.isNaN(slot.getTime()) || Number.isNaN(now.getTime())) return false;
  return berlinDayKey(slot) > berlinDayKey(now);
}

// ── Idempotency ─────────────────────────────────────────────────────────────

export const IDEMPOTENCY_KEY_MAX_LEN = 128;

export class IdempotencyKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdempotencyKeyError';
  }
}

/**
 * Resolves the idempotency key: header wins over body, trimmed, empty
 * becomes null. Throws IdempotencyKeyError when over the length cap.
 * No persistence — callers do the 24h payload lookup.
 */
export function resolveIdempotencyKey(headerValue: unknown, bodyValue: unknown): string | null {
  const pick = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  const key = pick(headerValue) ?? pick(bodyValue);
  if (key === null) return null;
  if (key.length > IDEMPOTENCY_KEY_MAX_LEN) {
    throw new IdempotencyKeyError(
      `Idempotency-Key ist zu lang (max. ${IDEMPOTENCY_KEY_MAX_LEN} Zeichen).`,
    );
  }
  return key;
}

// ── Inbox row mapping (structural types, no messaging-db import) ────────────

export interface InboxRowLike {
  id: number;
  brand: string | null;
  payload: Record<string, unknown>;
}

export interface ServiceSnapshotLike {
  key: string;
  name: string;
  price: string;
  durationMin: number | null;
}

export interface AppointmentRequest {
  id: number;
  brand: string | null;
  token: string;
  state: RequestState;
  name: string;
  email: string;
  phone: string | null;
  serviceKey: string | null;
  serviceName: string | null;
  serviceSnapshot: ServiceSnapshotLike | null;
  slotStart: string | null;
  slotEnd: string | null;
  slotDisplay: string | null;
  message: string | null;
  /** True when the creation path consumed a whitelist row for this request. */
  slotClaimed: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRequestState(value: unknown): value is RequestState {
  return value === 'offen' || value === 'bestaetigt' || value === 'abgelehnt' || value === 'storniert';
}

/** Reads the request state from an inbox payload (null when not a request). */
export function getRequestState(payload: Record<string, unknown>): RequestState | null {
  const state = payload.state;
  return isRequestState(state) ? state : null;
}

function asServiceSnapshot(value: unknown): ServiceSnapshotLike | null {
  if (typeof value !== 'object' || value === null) return null;
  const snap = value as Record<string, unknown>;
  if (typeof snap.key !== 'string' || typeof snap.name !== 'string') return null;
  if (typeof snap.price !== 'string') return null;
  const durationMin = snap.durationMin;
  return {
    key: snap.key,
    name: snap.name,
    price: snap.price,
    durationMin: typeof durationMin === 'number' ? durationMin : null,
  };
}

/**
 * Maps an inbox row to its appointment request view. Returns null for rows
 * that carry no request (legacy rows without token/state) — callers treat
 * null generically (404 / list filtering), never distinguishing reasons.
 */
export function toAppointmentRequest(row: InboxRowLike): AppointmentRequest | null {
  const payload = row.payload;
  const token = asString(payload.token);
  const state = getRequestState(payload);
  const name = asString(payload.name);
  const email = asString(payload.email);
  if (token === null || state === null || name === null || email === null) return null;
  if (!isValidRequestTokenFormat(token)) return null;
  const snapshot = asServiceSnapshot(payload.serviceSnapshot);
  return {
    id: row.id,
    brand: row.brand,
    token,
    state,
    name,
    email,
    phone: asString(payload.phone),
    serviceKey: asString(payload.serviceKey),
    serviceName: snapshot?.name ?? asString(payload.serviceKey),
    serviceSnapshot: snapshot,
    slotStart: asString(payload.slotStart),
    slotEnd: asString(payload.slotEnd),
    slotDisplay: asString(payload.slotDisplay),
    message: asString(payload.message),
    slotClaimed: payload.slotClaimed === true,
  };
}

/**
 * Resolves a presented token against candidate rows. Empty, malformed and
 * unknown tokens all yield the same generic null — no enumeration signal.
 */
export function getAppointmentRequestByToken(
  rows: readonly InboxRowLike[],
  token: unknown,
): AppointmentRequest | null {
  if (!isValidRequestTokenFormat(token)) return null;
  for (const row of rows) {
    const request = toAppointmentRequest(row);
    if (request !== null && request.token === token) return request;
  }
  return null;
}
