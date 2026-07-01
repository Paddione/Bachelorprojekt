import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetCustomerFullById, mockCreateCalendarEvent } = vi.hoisted(() => ({
  mockGetCustomerFullById: vi.fn(),
  mockCreateCalendarEvent: vi.fn(),
}));

vi.mock('../../../website-db', () => ({
  getCustomerFullById: mockGetCustomerFullById,
}));
vi.mock('../../../caldav', () => ({
  createCalendarEvent: mockCreateCalendarEvent,
}));

import './scheduleFollowup';
import { executeAction, describeAction } from '../../actions';

beforeEach(() => {
  mockGetCustomerFullById.mockReset();
  mockCreateCalendarEvent.mockReset();
});

const ctxBase = {
  profile: 'admin' as const,
  userSub: 'admin-sub',
  email: 'admin@example.com',
};

describe('scheduleFollowup describe()', () => {
  it('includes datetime and serviceId in targetLabel/summary when provided', () => {
    const result = describeAction('admin:schedule-followup', { datetime: '2026-07-10T10:00:00Z', serviceId: 'coaching-60' });
    expect(result.targetLabel).toContain('2026-07-10T10:00:00Z');
    expect(result.targetLabel).toContain('coaching-60');
    expect(result.summary).toContain('coaching-60');
  });

  it('falls back to generic label when datetime/serviceId missing', () => {
    const result = describeAction('admin:schedule-followup', {});
    expect(result.targetLabel).toBe('Folgetermin');
    expect(result.summary).not.toContain('für die Leistung');
  });
});

describe('scheduleFollowup handler', () => {
  it('returns ok:false when clientId missing', async () => {
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { datetime: '2026-07-10T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/clientId/);
  });

  it('returns ok:false when datetime missing', async () => {
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/datetime/);
  });

  it('returns ok:false when datetime is unparseable', async () => {
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: 'not-a-date' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Ungültiges Datumsformat/);
  });

  it('returns ok:false when client lookup throws', async () => {
    mockGetCustomerFullById.mockRejectedValue(new Error('db down'));
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: '2026-07-10T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/db down/);
  });

  it('returns ok:false when client not found', async () => {
    mockGetCustomerFullById.mockResolvedValue(null);
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: '2026-07-10T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/nicht gefunden/);
  });

  it('returns ok:false when CalDAV event creation fails (returns falsy)', async () => {
    mockGetCustomerFullById.mockResolvedValue({ id: 'c1', name: 'Max Mustermann', email: 'max@example.com' });
    mockCreateCalendarEvent.mockResolvedValue(null);
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: '2026-07-10T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/CalDAV-Fehler/);
  });

  it('returns ok:false when CalDAV event creation throws', async () => {
    mockGetCustomerFullById.mockResolvedValue({ id: 'c1', name: 'Max Mustermann', email: 'max@example.com' });
    mockCreateCalendarEvent.mockRejectedValue(new Error('caldav timeout'));
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: '2026-07-10T10:00:00Z' },
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Termin-Erstellung fehlgeschlagen/);
    expect(r.message).toMatch(/caldav timeout/);
  });

  it('creates a followup event and returns ok:true (with serviceId)', async () => {
    mockGetCustomerFullById.mockResolvedValue({ id: 'c1', name: 'Max Mustermann', email: 'max@example.com' });
    mockCreateCalendarEvent.mockResolvedValue({ uid: 'uid-123' });
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: '2026-07-10T10:00:00Z', serviceId: 'coaching-60' },
    });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('Max Mustermann');
    expect(r.data).toEqual({ uid: 'uid-123', clientId: 'c1', datetime: '2026-07-10T10:00:00Z', serviceId: 'coaching-60' });
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: 'Folgetermin: coaching-60 mit Max Mustermann',
        attendeeEmail: 'max@example.com',
        attendeeName: 'Max Mustermann',
      })
    );
  });

  it('creates a followup event without serviceId', async () => {
    mockGetCustomerFullById.mockResolvedValue({ id: 'c1', name: 'Max Mustermann', email: 'max@example.com' });
    mockCreateCalendarEvent.mockResolvedValue({ uid: 'uid-456' });
    const r = await executeAction('admin:schedule-followup', {
      ...ctxBase,
      payload: { clientId: 'c1', datetime: '2026-07-10T10:00:00Z' },
    });
    expect(r.ok).toBe(true);
    expect(mockCreateCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ summary: 'Folgetermin mit Max Mustermann' })
    );
  });
});
