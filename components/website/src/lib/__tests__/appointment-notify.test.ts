import { describe, it, expect } from 'vitest';

// Pure-module suite: no DB, no network, no mocks needed. sendNotify takes
// an injected mailer + sleep, so dedupe/retry are testable without SMTP.
import { berlinDayKey } from '../caldav-cache.js';
import type { AppointmentRequest } from '../appointment-requests.js';
import {
  MAX_NOTIFY_ATTEMPTS,
  appendNotifyLog,
  dedupeKey,
  isReminderDue,
  lastFailedNotifyKind,
  notifyStatusFor,
  renderNotify,
  sendNotify,
  type NotifyKind,
  type NotifyLogEntry,
  type NotifyParams,
} from '../appointment-notify.js';

const KINDS: NotifyKind[] = ['bestaetigung', 'erinnerung', 'storno', 'umbuchung', 'eingang', 'absage'];

function requestFixture(overrides: Partial<AppointmentRequest> = {}): AppointmentRequest {
  return {
    id: 42,
    brand: null,
    token: 't'.repeat(22),
    state: 'bestaetigt',
    name: 'Max Muster',
    email: 'max@example.test',
    phone: '+49 170 123456',
    serviceKey: 'massage-60',
    serviceName: 'Wohlfühl-Massage',
    serviceSnapshot: null,
    slotStart: '2026-05-14T09:00:00+02:00',
    slotEnd: '2026-05-14T10:00:00+02:00',
    slotDisplay: '09:00 - 10:00',
    message: null,
    slotClaimed: false,
    ...overrides,
  };
}

function paramsFixture(kind: NotifyKind, overrides: Partial<NotifyParams> = {}): NotifyParams {
  return {
    request: requestFixture(),
    kind,
    manageUrl: `/anfrage/${'t'.repeat(22)}`,
    brandName: 'Testpraxis',
    ...overrides,
  };
}

describe('template rendering', () => {
  it.each(KINDS)('renders %s with name, service, date, time and token link', (kind) => {
    const rendered = renderNotify(paramsFixture(kind));
    for (const field of [rendered.subject, rendered.text, rendered.html]) {
      expect(field.length).toBeGreaterThan(0);
    }
    expect(rendered.text).toContain('Max Muster');
    expect(rendered.text).toContain('Wohlfühl-Massage');
    expect(rendered.text).toContain(`/anfrage/${'t'.repeat(22)}`);
    expect(rendered.html).toContain(`/anfrage/${'t'.repeat(22)}`);
    // Berlin date + time of the 09:00 slot must be visible in the body.
    expect(rendered.text).toContain('14.05.2026');
    expect(rendered.text).toContain('09:00');
  });

  it('marks the reminder subject with Erinnerung plus date and time', () => {
    const rendered = renderNotify(paramsFixture('erinnerung'));
    expect(rendered.subject).toContain('Erinnerung');
    expect(rendered.subject).toContain('14.05.2026');
    expect(rendered.subject).toContain('09:00');
  });

  it.each(KINDS)('keeps %s free of health data and advertising', (kind) => {
    const rendered = renderNotify(paramsFixture(kind, { note: 'Bitte pünktlich erscheinen.' }));
    const combined = `${rendered.subject}\n${rendered.text}\n${rendered.html}`;
    expect(combined).not.toMatch(/rabatt|newsletter|gutschein|cross-?selling|angebot des monats/i);
    expect(combined).not.toMatch(/diagnos|symptom|krankheit|beschwerde|anamnes|therapieerfolg|heilversprechen|lindert/i);
  });

  it('escapes guest data in the HTML variant', () => {
    const rendered = renderNotify(paramsFixture('bestaetigung', {
      request: requestFixture({ name: '<b>Bo</b>', serviceName: 'A & B' }),
    }));
    expect(rendered.html).toContain('&lt;b&gt;Bo&lt;/b&gt;');
    expect(rendered.html).toContain('A &amp; B');
    expect(rendered.html).not.toContain('<b>Bo</b>');
  });

  it('falls back to Rückruf for slotless callback receipts', () => {
    const rendered = renderNotify(paramsFixture('eingang', {
      request: requestFixture({ slotStart: null, slotEnd: null, slotDisplay: null }),
    }));
    expect(rendered.subject).toContain('Rückruf');
    expect(rendered.text).toContain('+49 170 123456');
  });
});

describe('dedupe key stability', () => {
  it('returns the same key for repeated calls (no random/time parts)', () => {
    expect(dedupeKey(42, 'erinnerung')).toBe('notify:42:erinnerung');
    expect(dedupeKey(42, 'erinnerung')).toBe(dedupeKey(42, 'erinnerung'));
  });

  it('separates requests and kinds', () => {
    expect(dedupeKey(42, 'erinnerung')).not.toBe(dedupeKey(43, 'erinnerung'));
    expect(dedupeKey(42, 'erinnerung')).not.toBe(dedupeKey(42, 'bestaetigung'));
  });
});

describe('retry counting', () => {
  function scriptedMailer(script: Array<boolean | Error>): { mailer: (mail: { to: string; subject: string; text: string; html: string }) => Promise<boolean> } {
    let calls = 0;
    return {
      mailer: async () => {
        calls += 1;
        const step = script[Math.min(calls - 1, script.length - 1)] as boolean | Error;
        if (step instanceof Error) throw step;
        return step;
      },
    };
  }

  it('caps attempts at MAX_NOTIFY_ATTEMPTS = 3', () => {
    expect(MAX_NOTIFY_ATTEMPTS).toBe(3);
  });

  it('succeeds on the first try without sleeping', async () => {
    const { mailer } = scriptedMailer([true]);
    const sleeps: number[] = [];
    const result = await sendNotify(paramsFixture('erinnerung'), { mailer, log: [], sleep: async (ms) => { sleeps.push(ms); } });
    expect(result).toMatchObject({ ok: true, attempts: 1, key: 'notify:42:erinnerung' });
    expect(sleeps).toEqual([]);
  });

  it('retries after failures 1 and 2, then aborts after failure 3', async () => {
    const { mailer } = scriptedMailer([false, new Error('boom'), false]);
    const sleeps: number[] = [];
    const result = await sendNotify(paramsFixture('erinnerung'), { mailer, log: [], sleep: async (ms) => { sleeps.push(ms); } });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.error).toBe('Versand fehlgeschlagen');
    expect(sleeps).toEqual([1000, 4000]);
  });

  it('recovers when the third attempt succeeds (no fourth attempt)', async () => {
    const { mailer } = scriptedMailer([false, false, true, false]);
    let calls = 0;
    const counting = async (...args: Parameters<typeof mailer>): Promise<boolean> => { calls += 1; return mailer(...args); };
    const result = await sendNotify(paramsFixture('erinnerung'), { mailer: counting, log: [], sleep: async () => {} });
    expect(result).toMatchObject({ ok: true, attempts: 3 });
    expect(calls).toBe(3);
  });

  it('skips the mailer entirely for an already-sent key', async () => {
    let calls = 0;
    const log: NotifyLogEntry[] = [{ key: 'notify:42:erinnerung', kind: 'erinnerung', status: 'sent', attempts: 1, at: '2026-05-13T00:00:00Z' }];
    const result = await sendNotify(paramsFixture('erinnerung'), {
      mailer: async () => { calls += 1; return true; },
      log,
      sleep: async () => {},
    });
    expect(result).toMatchObject({ ok: true, attempts: 0 });
    expect(calls).toBe(0);
  });

  it('retries a previously failed key instead of skipping it', async () => {
    let calls = 0;
    const log: NotifyLogEntry[] = [{ key: 'notify:42:erinnerung', kind: 'erinnerung', status: 'failed', attempts: 3, at: '2026-05-13T00:00:00Z', error: 'x' }];
    const result = await sendNotify(paramsFixture('erinnerung'), {
      mailer: async () => { calls += 1; return true; },
      log,
      sleep: async () => {},
    });
    expect(result).toMatchObject({ ok: true, attempts: 1 });
    expect(calls).toBe(1);
  });
});

describe('24h window logic', () => {
  const NOW = new Date('2026-05-13T10:00:00+02:00');

  it('is due below 24h and not due above 24h', () => {
    expect(isReminderDue('2026-05-14T09:59:00+02:00', NOW)).toBe(true);
    expect(isReminderDue('2026-05-14T10:00:00+02:00', NOW)).toBe(true);
    expect(isReminderDue('2026-05-14T10:00:01+02:00', NOW)).toBe(false);
    expect(isReminderDue('2026-05-15T10:00:00+02:00', NOW)).toBe(false);
  });

  it('never flags past appointments', () => {
    expect(isReminderDue('2026-05-13T09:59:59+02:00', NOW)).toBe(false);
    expect(isReminderDue('2026-05-12T10:00:00+02:00', NOW)).toBe(false);
  });

  it('fails closed on unparseable input', () => {
    expect(isReminderDue('kein-datum', NOW)).toBe(false);
    expect(isReminderDue('', NOW)).toBe(false);
    expect(isReminderDue('2026-05-14T09:00:00+02:00', new Date('ungültig'))).toBe(false);
  });

  it('follows durations across the spring-forward transition (2026-03-29)', () => {
    const before = new Date('2026-03-28T12:00:00+01:00');
    // 23 real hours later the Berlin day already flipped twice — still due.
    expect(berlinDayKey(before)).toBe('2026-03-28');
    expect(isReminderDue('2026-03-29T12:00:00+02:00', before)).toBe(true);
    expect(isReminderDue('2026-03-29T13:00:01+02:00', before)).toBe(false);
  });

  it('follows durations across the fall-back transition (2026-10-25)', () => {
    const before = new Date('2026-10-24T12:00:00+02:00');
    // The 25h-long day: 11:00 local is exactly 24 real hours later — due.
    expect(isReminderDue('2026-10-25T11:00:00+01:00', before)).toBe(true);
    expect(isReminderDue('2026-10-25T11:00:01+01:00', before)).toBe(false);
    expect(isReminderDue('2026-10-25T12:00:00+01:00', before)).toBe(false);
  });
});

describe('notify log helpers', () => {
  function entry(overrides: Partial<NotifyLogEntry> = {}): NotifyLogEntry {
    return { key: 'notify:42:erinnerung', kind: 'erinnerung', status: 'sent', attempts: 1, at: '2026-05-13T00:00:00Z', ...overrides };
  }

  it('derives versandt / fehlgeschlagen / ausstehend with failed winning', () => {
    expect(notifyStatusFor({})).toBe('ausstehend');
    expect(notifyStatusFor({ notify: [entry()] })).toBe('versandt');
    expect(notifyStatusFor({ notify: [entry(), entry({ key: 'notify:42:bestaetigung', kind: 'bestaetigung', status: 'failed', attempts: 3 })] })).toBe('fehlgeschlagen');
    // A later sent entry clears the same key.
    expect(notifyStatusFor({ notify: [entry({ status: 'failed', attempts: 3 }), entry()] })).toBe('versandt');
  });

  it('ignores malformed log rows instead of crashing', () => {
    expect(notifyStatusFor({ notify: 'kein-array' })).toBe('ausstehend');
    expect(notifyStatusFor({ notify: [{ key: 42 }, null, 'x'] })).toBe('ausstehend');
    expect(lastFailedNotifyKind({ notify: [{ key: 42 }] })).toBeNull();
  });

  it('returns the most recent unsuperseded failed kind', () => {
    expect(lastFailedNotifyKind({})).toBeNull();
    const payload = { notify: [entry({ status: 'failed', attempts: 3 }), entry({ key: 'notify:42:bestaetigung', kind: 'bestaetigung' as const, status: 'failed', attempts: 3 })] };
    expect(lastFailedNotifyKind(payload)).toBe('bestaetigung');
    const cleared = { notify: [entry({ status: 'failed', attempts: 3 }), entry()] };
    expect(lastFailedNotifyKind(cleared)).toBeNull();
  });

  it('appends without touching other payload fields and caps at 20', () => {
    const payload: Record<string, unknown> = { state: 'bestaetigt', token: 'x' };
    const next = appendNotifyLog(payload, entry());
    expect(next.state).toBe('bestaetigt');
    expect(next.token).toBe('x');
    expect(payload.notify).toBeUndefined();
    let grown: Record<string, unknown> = {};
    for (let index = 0; index < 25; index++) {
      grown = appendNotifyLog(grown, entry({ key: `notify:42:k${index}`, at: `2026-05-13T00:00:${String(index).padStart(2, '0')}Z` }));
    }
    expect((grown.notify as NotifyLogEntry[]).length).toBe(20);
    expect((grown.notify as NotifyLogEntry[])[0]?.key).toBe('notify:42:k5');
  });
});
