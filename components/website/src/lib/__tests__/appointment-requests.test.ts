import { describe, it, expect } from 'vitest';

// Pure-module suite: no DB, no network, no mocks needed. The request lib
// (../appointment-requests.js) takes rows/params as arguments, so invalid
// tokens, lead-time edges and transitions are testable without a pool.
import { berlinDayKey, berlinWallMinutes } from '../caldav-cache.js';
import {
  TransitionError,
  generateRequestToken,
  getAppointmentRequestByToken,
  isLeadTimeOk,
  isValidRequestTokenFormat,
  transitionRequest,
  type InboxRowLike,
} from '../appointment-requests.js';

describe('lead time Europe/Berlin', () => {
  it('treats 23:30 UTC as the next Berlin day (midnight boundary)', () => {
    expect(berlinDayKey(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
    const now = new Date('2026-01-15T23:30:00Z'); // 00:30 Berlin time, Jan 16th
    // A slot later on Jan 16th Berlin time is same-day -> rejected.
    expect(isLeadTimeOk('2026-01-16T10:00:00+01:00', now)).toBe(false);
    // A slot on Jan 17th Berlin time is strictly after -> allowed.
    expect(isLeadTimeOk('2026-01-17T09:00:00+01:00', now)).toBe(true);
  });

  it('handles the March spring-forward transition (2026-03-29, 02:00 missing)', () => {
    // 00:30 UTC = 01:30 CET, still standard time.
    expect(berlinDayKey(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    expect(berlinWallMinutes(new Date('2026-03-29T00:30:00Z'))).toBe(90);
    // 01:30 UTC = 03:30 CEST (02:00-03:00 does not exist).
    expect(berlinDayKey(new Date('2026-03-29T01:30:00Z'))).toBe('2026-03-29');
    expect(berlinWallMinutes(new Date('2026-03-29T01:30:00Z'))).toBe(210);
    const now = new Date('2026-03-28T12:00:00Z');
    expect(isLeadTimeOk('2026-03-29T10:00:00+01:00', now)).toBe(true);
    expect(isLeadTimeOk('2026-03-28T23:00:00+01:00', now)).toBe(false);
  });

  it('handles the October fall-back transition (2026-10-25, doubled 02:30)', () => {
    // Both 00:30 UTC (02:30 CEST) and 01:30 UTC (02:30 CET) share the Berlin day.
    expect(berlinDayKey(new Date('2026-10-25T00:30:00Z'))).toBe('2026-10-25');
    expect(berlinDayKey(new Date('2026-10-25T01:30:00Z'))).toBe('2026-10-25');
    expect(berlinWallMinutes(new Date('2026-10-25T01:30:00Z'))).toBe(150);
    const now = new Date('2026-10-24T12:00:00Z');
    expect(isLeadTimeOk('2026-10-25T02:30:00+02:00', now)).toBe(true);
    expect(isLeadTimeOk('2026-10-24T23:30:00+02:00', now)).toBe(false);
  });

  it('encodes the lead rule: same day rejected, next day allowed', () => {
    const now = new Date('2026-05-13T10:00:00Z');
    expect(isLeadTimeOk('2026-05-13T18:00:00+02:00', now)).toBe(false);
    expect(isLeadTimeOk('2026-05-14T09:00:00+02:00', now)).toBe(true);
    expect(isLeadTimeOk('2026-05-12T09:00:00+02:00', now)).toBe(false);
  });

  it('fails closed on unparseable slot input', () => {
    expect(isLeadTimeOk('kein-datum', new Date('2026-05-13T10:00:00Z'))).toBe(false);
    expect(isLeadTimeOk('', new Date('2026-05-13T10:00:00Z'))).toBe(false);
  });
});

describe('request state machine', () => {
  it.each([
    ['offen', 'bestaetigt'],
    ['offen', 'abgelehnt'],
    ['offen', 'storniert'],
    ['bestaetigt', 'storniert'],
  ] as const)('accepts the legal transition %s -> %s', (from, to) => {
    expect(transitionRequest(from, to)).toBe(to);
  });

  it.each([
    ['abgelehnt', 'bestaetigt'],
    ['storniert', 'offen'],
    ['storniert', 'bestaetigt'],
    ['bestaetigt', 'offen'],
    ['bestaetigt', 'abgelehnt'],
    ['abgelehnt', 'storniert'],
    ['abgelehnt', 'offen'],
    ['offen', 'offen'],
    ['bestaetigt', 'bestaetigt'],
  ] as const)('rejects the illegal transition %s -> %s', (from, to) => {
    expect(() => transitionRequest(from, to)).toThrow(TransitionError);
  });
});

describe('request tokens', () => {
  const VALID = 'v'.repeat(22);

  function row(token: string, state = 'offen'): InboxRowLike {
    return {
      id: 7,
      brand: null,
      payload: {
        state,
        token,
        name: 'Test Person',
        email: 'test@example.test',
        phone: null,
        slotStart: '2026-05-14T09:00:00+02:00',
        slotEnd: '2026-05-14T10:00:00+02:00',
        slotDisplay: '09:00 - 10:00',
        message: null,
      },
    };
  }

  it('generates URL-safe tokens with at least 128 bit entropy', () => {
    const a = generateRequestToken();
    const b = generateRequestToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(a).not.toBe(b);
    expect(isValidRequestTokenFormat(a)).toBe(true);
  });

  it('rejects empty and malformed token formats', () => {
    expect(isValidRequestTokenFormat('')).toBe(false);
    expect(isValidRequestTokenFormat(null)).toBe(false);
    expect(isValidRequestTokenFormat(undefined)).toBe(false);
    expect(isValidRequestTokenFormat('  ')).toBe(false);
    expect(isValidRequestTokenFormat('zu-kurz')).toBe(false);
    expect(isValidRequestTokenFormat('mit leerzeichen in der mitte')).toBe(false);
    expect(isValidRequestTokenFormat('mit/unzulaessigem+zeichen')).toBe(false);
  });

  it('resolves a valid token to its request', () => {
    const found = getAppointmentRequestByToken([row(VALID)], VALID);
    expect(found).not.toBeNull();
    expect(found?.token).toBe(VALID);
    expect(found?.state).toBe('offen');
    expect(found?.name).toBe('Test Person');
  });

  it('answers empty, malformed and unknown tokens identically generic', () => {
    const rows = [row(VALID)];
    const empty = getAppointmentRequestByToken(rows, '');
    const malformed = getAppointmentRequestByToken(rows, '!!!kein-token!!!');
    const unknown = getAppointmentRequestByToken(rows, 'u'.repeat(22));
    expect(empty).toBeNull();
    expect(malformed).toEqual(empty);
    expect(unknown).toEqual(empty);
    expect(unknown).toEqual(malformed);
  });

  it('ignores rows without a matching token', () => {
    expect(getAppointmentRequestByToken([], VALID)).toBeNull();
    expect(getAppointmentRequestByToken([{ id: 1, brand: null, payload: {} }], VALID)).toBeNull();
  });
});
