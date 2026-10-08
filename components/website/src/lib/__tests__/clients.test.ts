import { describe, it, expect } from 'vitest';

// Pure-module suite: no DB, no network, no mocks needed. The client lib
// (../clients.js) takes inbox rows as arguments, so grouping, history,
// search and duplicate candidates are testable without a pool.
// Fixtures use example.test addresses and fictitious names only.

import {
  deriveClients,
  findDuplicateCandidates,
  normalizeClientEmail,
  normalizeClientName,
  searchClients,
  type ClientRecord,
  type InboxRowLike,
} from '../clients.js';

let nextId = 1;

function row(overrides: Partial<{
  id: number;
  brand: string | null;
  token: string;
  state: string;
  name: string;
  email: string;
  phone: string | null;
  serviceKey: string;
  serviceName: string;
  slotStart: string | null;
  slotEnd: string | null;
  slotDisplay: string | null;
  message: string | null;
}> = {}): InboxRowLike {
  const id = overrides.id ?? nextId++;
  return {
    id,
    brand: overrides.brand ?? null,
    payload: {
      token: overrides.token ?? `t${String(id).padStart(21, '0')}`,
      state: overrides.state ?? 'offen',
      name: overrides.name ?? 'Fiktiva Muster',
      email: overrides.email ?? 'fiktiva@example.test',
      phone: overrides.phone ?? null,
      serviceKey: overrides.serviceKey ?? 'klassisch-60',
      serviceSnapshot: {
        key: 'klassisch-60',
        name: overrides.serviceName ?? 'Klassische Massage 60',
        price: '70 EUR',
        durationMin: 60,
      },
      slotStart: overrides.slotStart ?? '2026-05-14T09:00:00+02:00',
      slotEnd: overrides.slotEnd ?? '2026-05-14T10:00:00+02:00',
      slotDisplay: overrides.slotDisplay ?? '09:00 - 10:00',
      message: overrides.message ?? null,
    },
  };
}

function byEmail(clients: ClientRecord[], email: string): ClientRecord {
  const found = clients.find((c) => c.email === email);
  if (!found) throw new Error(`expected client ${email}`);
  return found;
}

describe('normalizeClientEmail', () => {
  it('lowercases mixed-case addresses', () => {
    expect(normalizeClientEmail('Fiktiva@Example.TEST')).toBe('fiktiva@example.test');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeClientEmail('  fiktiva@example.test\n')).toBe('fiktiva@example.test');
  });

  it('is idempotent for already normalized addresses', () => {
    expect(normalizeClientEmail('fiktiva@example.test')).toBe('fiktiva@example.test');
  });

  it('returns null for missing or unusable input without crashing', () => {
    expect(normalizeClientEmail('')).toBeNull();
    expect(normalizeClientEmail('   ')).toBeNull();
    expect(normalizeClientEmail('keine-adresse')).toBeNull();
    expect(normalizeClientEmail('@example.test')).toBeNull();
    expect(normalizeClientEmail('fiktiva@')).toBeNull();
    expect(normalizeClientEmail(null)).toBeNull();
    expect(normalizeClientEmail(undefined)).toBeNull();
    expect(normalizeClientEmail(42)).toBeNull();
  });
});

describe('deriveClients history', () => {
  it('groups rows by normalized email into one record per customer', () => {
    const clients = deriveClients([
      row({ id: 1, name: 'Fiktiva Muster', email: 'Fiktiva@Example.test' }),
      row({ id: 2, name: 'Fiktiva Muster', email: 'fiktiva@example.test' }),
      row({ id: 3, name: 'Max Beispiel', email: 'max@example.test' }),
    ]);
    expect(clients).toHaveLength(2);
    const fiktiva = byEmail(clients, 'fiktiva@example.test');
    expect(fiktiva.id).toBe('mail:fiktiva@example.test');
    expect(fiktiva.requestIds).toEqual([1, 2]);
    expect(fiktiva.requestCount).toBe(2);
  });

  it('sorts history ascending by row id and records chronology', () => {
    const clients = deriveClients([
      row({ id: 30, email: 'fiktiva@example.test', state: 'bestaetigt' }),
      row({ id: 10, email: 'fiktiva@example.test', state: 'offen' }),
      row({ id: 20, email: 'fiktiva@example.test', state: 'storniert' }),
    ]);
    const history = byEmail(clients, 'fiktiva@example.test').history;
    expect(history.map((h) => h.requestId)).toEqual([10, 20, 30]);
    expect(history.map((h) => h.state)).toEqual(['offen', 'storniert', 'bestaetigt']);
    for (const entry of history) {
      expect(entry.token).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      expect(entry.serviceName).toBe('Klassische Massage 60');
      expect(entry.slotStart).toBe('2026-05-14T09:00:00+02:00');
    }
  });

  it('prefers the youngest non-empty name and phone, keeping variants', () => {
    const clients = deriveClients([
      row({ id: 1, email: 'fiktiva@example.test', name: 'F. Muster', phone: '030 111' }),
      row({ id: 2, email: 'fiktiva@example.test', name: 'Fiktiva Muster', phone: null }),
      row({ id: 3, email: 'fiktiva@example.test', name: '', phone: '030 222' }),
    ]);
    const client = byEmail(clients, 'fiktiva@example.test');
    expect(client.name).toBe('Fiktiva Muster');
    expect(client.phone).toBe('030 222');
    expect(client.nameVariants).toEqual(['F. Muster']);
  });

  it('skips legacy rows and rows without a usable email', () => {
    const clients = deriveClients([
      { id: 1, brand: null, payload: {} },
      row({ id: 2, email: 'keine-adresse' }),
      row({ id: 3, email: 'max@example.test', name: 'Max Beispiel' }),
    ]);
    expect(clients).toHaveLength(1);
    expect(clients[0].email).toBe('max@example.test');
  });

  it('returns an empty history for empty input and counts open requests', () => {
    expect(deriveClients([])).toEqual([]);
    const clients = deriveClients([
      row({ id: 1, email: 'fiktiva@example.test', state: 'offen' }),
      row({ id: 2, email: 'fiktiva@example.test', state: 'bestaetigt' }),
    ]);
    expect(byEmail(clients, 'fiktiva@example.test').openCount).toBe(1);
  });

  it('sorts customers by name and searches across name, email and variants', () => {
    const clients = deriveClients([
      row({ id: 1, email: 'z@example.test', name: 'Zed Beispiel' }),
      row({ id: 2, email: 'a@example.test', name: 'Anna Muster', phone: null }),
      row({ id: 3, email: 'a@example.test', name: 'A. Muster' }),
    ]);
    expect(clients.map((c) => c.name)).toEqual(['A. Muster', 'Zed Beispiel']);
    expect(searchClients(clients, '')).toHaveLength(2);
    expect(searchClients(clients, 'anna').map((c) => c.email)).toEqual(['a@example.test']);
    expect(searchClients(clients, 'Z@EXAMPLE').map((c) => c.email)).toEqual(['z@example.test']);
    expect(searchClients(clients, 'unbekannt')).toEqual([]);
  });
});

describe('findDuplicateCandidates', () => {
  it('flags equal phone numbers across different emails', () => {
    const clients = deriveClients([
      row({ id: 1, email: 'a@example.test', name: 'Anna Muster', phone: '+49 30 123456' }),
      row({ id: 2, email: 'b@example.test', name: 'Bea Beispiel', phone: '+49-30-123 456' }),
    ]);
    const dupes = findDuplicateCandidates(clients);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reason).toBe('gleiche-telefonnummer');
    expect([dupes[0].a.email, dupes[0].b.email].sort()).toEqual(['a@example.test', 'b@example.test']);
  });

  it('flags equal normalized names across different emails', () => {
    const clients = deriveClients([
      row({ id: 1, email: 'a@example.test', name: 'Anna  Muster' }),
      row({ id: 2, email: 'b@example.test', name: 'anna muster' }),
    ]);
    expect(normalizeClientName('Anna  Muster')).toBe('anna muster');
    const dupes = findDuplicateCandidates(clients);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].reason).toBe('gleicher-name');
  });

  it('ignores short phone numbers and never merges by itself', () => {
    const clients = deriveClients([
      row({ id: 1, email: 'a@example.test', name: 'Anna Muster', phone: '12345' }),
      row({ id: 2, email: 'b@example.test', name: 'Bea Beispiel', phone: '12345' }),
    ]);
    expect(findDuplicateCandidates(clients)).toEqual([]);
    expect(clients).toHaveLength(2);
  });
});

describe('keine Gesundheitsfelder', () => {
  it('exposes no message or health keys on records and history', () => {
    const forbidden = ['message', 'nachricht', 'notiz', 'notizen', 'notes', 'anamnese', 'beschwerden', 'diagnose', 'gesundheit', 'behandlung'];
    const clients = deriveClients([
      row({ id: 1, email: 'fiktiva@example.test', message: 'Rückenschmerzen seit Wochen' }),
    ]);
    expect(clients).toHaveLength(1);
    const flat = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(flat);
      if (typeof value === 'object' && value !== null) {
        return Object.entries(value).flatMap(([k, v]) => [k.toLowerCase(), ...flat(v)]);
      }
      return [];
    };
    const keys = flat(JSON.parse(JSON.stringify(clients)) as unknown);
    for (const key of forbidden) {
      expect(keys).not.toContain(key);
    }
    expect(Object.keys(clients[0]).sort()).toEqual(
      ['email', 'history', 'id', 'name', 'nameVariants', 'openCount', 'phone', 'requestCount', 'requestIds'].sort(),
    );
  });
});
