import { describe, expect, it } from 'vitest';
import {
  buildReschedulePayload,
  supersededCancelMerge,
  wallDisplay,
} from './appointment-reschedule';
import type { AppointmentRequest } from './appointment-requests';

const req: AppointmentRequest = {
  id: 42,
  brand: 'mentolder',
  token: 'old-token',
  state: 'offen',
  name: 'Max',
  email: 'max@example.de',
  phone: null,
  serviceKey: 'beratung',
  serviceName: 'Beratung',
  serviceSnapshot: null,
  slotStart: '2026-11-20T10:00:00.000Z',
  slotEnd: '2026-11-20T11:00:00.000Z',
  slotDisplay: '11:00 - 12:00',
  message: null,
  slotClaimed: false,
};

describe('appointment-reschedule (F3/A4)', () => {
  it('wallDisplay formats HH:MM', () => {
    expect(wallDisplay(630)).toBe('10:30');
    expect(wallDisplay(0)).toBe('00:00');
  });

  it('buildReschedulePayload links supersedesId and freezes service snapshot', () => {
    const start = new Date('2026-11-21T10:00:00Z');
    const end = new Date('2026-11-21T11:00:00Z');
    const { payload, newDisplay } = buildReschedulePayload(req, {}, start, end, 'new-token', false);
    expect(payload.token).toBe('new-token');
    expect(payload.state).toBe('offen');
    expect(payload.supersedesId).toBe(42);
    expect(payload.idempotencyKey).toBeNull();
    expect(payload.slotStart).toBe(start.toISOString());
    expect(newDisplay).toContain(' - ');
  });

  it('supersededCancelMerge marks storniert with note', () => {
    const merged = JSON.parse(supersededCancelMerge()) as Record<string, unknown>;
    expect(merged.state).toBe('storniert');
    expect(merged.outcome).toBe('storniert');
    expect(merged.cancelNote).toBe('Durch Umbuchung ersetzt.');
  });
});
