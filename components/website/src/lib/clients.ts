// components/website/src/lib/clients.ts
// Client directory core (T901026): derives customers from booking inbox
// rows (email as key) with contact data and appointment history.
//
// Persistence decision (no migration needed): every customer field (name,
// email, phone, service, slot, state) already lives in inbox_items.payload
// (T901024 pattern: the inbox is the SSOT). No customer table exists, so
// writes persist as payload updates on the customer's inbox rows and
// deletion is a row delete with no shadow-table residue.
//
// Art. 9 exclusion (T901019 §6): the free-text message field may carry
// health data, so it is never copied into ClientRecord — no message,
// notes, or treatment field exists on any type below.
//
// Caller contracts: brand filtering and is_test_data exclusion happen at
// load time via listInboxItems({ brand }), not in this module. Correcting
// an email changes the derived id; history follows via payload rewrite.
// Merges stay a manual owner act — this module only suggests candidates.

import {
  toAppointmentRequest,
  type InboxRowLike,
  type RequestState,
} from './appointment-requests.js';

export type { InboxRowLike };

export interface ClientHistoryEntry {
  requestId: number;
  token: string;
  state: RequestState;
  serviceName: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  slotDisplay: string | null;
}

export interface ClientRecord {
  /** Stable derived id: `mail:` plus the normalized email. */
  id: string;
  name: string;
  email: string;
  phone: string | null;
  requestIds: number[];
  history: ClientHistoryEntry[];
  nameVariants: string[];
  requestCount: number;
  openCount: number;
}

export type DuplicateReason = 'gleiche-telefonnummer' | 'gleicher-name';

export interface DuplicateCandidate {
  a: ClientRecord;
  b: ClientRecord;
  reason: DuplicateReason;
}

/**
 * Normalizes an email for identity use: trimmed, lowercased. Returns null
 * for missing `@` or empty local/domain parts. No plus-address stripping
 * (documented decision: identity-neutral, `a+b@x` stays distinct).
 */
export function normalizeClientEmail(email: unknown): string | null {
  if (typeof email !== 'string') return null;
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at !== trimmed.lastIndexOf('@') || at === trimmed.length - 1) return null;
  return trimmed;
}

/** Comparison base for the duplicate heuristic: trimmed, folded, lowercase. */
export function normalizeClientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

/**
 * Groups inbox rows into one record per normalized email. Legacy rows
 * (toAppointmentRequest returns null) and rows without a usable email are
 * skipped: no customer without a contact path (§6 minimum fields).
 */
export function deriveClients(rows: readonly InboxRowLike[]): ClientRecord[] {
  const groups = new Map<string, { id: number; name: string; email: string; phone: string | null; token: string; state: RequestState; serviceName: string | null; slotStart: string | null; slotEnd: string | null; slotDisplay: string | null }[]>();
  for (const row of rows) {
    const request = toAppointmentRequest(row);
    if (request === null) continue;
    const email = normalizeClientEmail(request.email);
    if (email === null) continue;
    const list = groups.get(email) ?? [];
    list.push({
      id: row.id,
      name: request.name,
      email,
      phone: request.phone,
      token: request.token,
      state: request.state,
      serviceName: request.serviceName,
      slotStart: request.slotStart,
      slotEnd: request.slotEnd,
      slotDisplay: request.slotDisplay,
    });
    groups.set(email, list);
  }

  const clients: ClientRecord[] = [];
  for (const [email, entries] of groups) {
    const ordered = [...entries].sort((x, y) => x.id - y.id);
    let name = '';
    for (const entry of ordered) {
      if (entry.name.trim() !== '') name = entry.name.trim();
    }
    let phone: string | null = null;
    for (const entry of ordered) {
      if (entry.phone !== null && entry.phone.trim() !== '') phone = entry.phone.trim();
    }
    const nameVariants: string[] = [];
    for (const entry of ordered) {
      const trimmed = entry.name.trim();
      if (trimmed !== '' && trimmed !== name && !nameVariants.includes(trimmed)) {
        nameVariants.push(trimmed);
      }
    }
    clients.push({
      id: `mail:${email}`,
      name,
      email,
      phone,
      requestIds: ordered.map((entry) => entry.id),
      history: ordered.map((entry) => ({
        requestId: entry.id,
        token: entry.token,
        state: entry.state,
        serviceName: entry.serviceName,
        slotStart: entry.slotStart,
        slotEnd: entry.slotEnd,
        slotDisplay: entry.slotDisplay,
      })),
      nameVariants,
      requestCount: ordered.length,
      openCount: ordered.filter((entry) => entry.state === 'offen').length,
    });
  }
  clients.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return clients;
}

/** Substring search over name, email and name variants; empty query returns all. */
export function searchClients(clients: readonly ClientRecord[], query: string): ClientRecord[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return [...clients];
  return clients.filter((client) =>
    client.name.toLowerCase().includes(needle)
    || client.email.toLowerCase().includes(needle)
    || client.nameVariants.some((variant) => variant.toLowerCase().includes(needle)),
  );
}

/**
 * Duplicate candidates only — never an auto-merge. A pair qualifies on a
 * digit-normalized phone match (minimum 6 digits) or on an equal
 * normalized name across different emails. Pairs are sorted by id for a
 * deterministic order; one entry per pair (phone reason wins on ties).
 */
export function findDuplicateCandidates(clients: readonly ClientRecord[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const first = clients[i];
      const second = clients[j];
      if (first.email === second.email) continue;
      const phoneA = first.phone !== null ? digitsOnly(first.phone) : '';
      const phoneB = second.phone !== null ? digitsOnly(second.phone) : '';
      const samePhone = phoneA.length >= 6 && phoneA === phoneB;
      const nameA = normalizeClientName(first.name);
      const nameB = normalizeClientName(second.name);
      const sameName = nameA !== '' && nameA === nameB;
      if (!samePhone && !sameName) continue;
      const [a, b] = first.id < second.id ? [first, second] : [second, first];
      candidates.push({ a, b, reason: samePhone ? 'gleiche-telefonnummer' : 'gleicher-name' });
    }
  }
  candidates.sort((x, y) => x.a.id.localeCompare(y.a.id) || x.b.id.localeCompare(y.b.id));
  return candidates;
}
