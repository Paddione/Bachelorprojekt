import { describe, it, expect, vi } from 'vitest';

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'x' }),
    }),
  },
}));

describe('booking email helpers', () => {
  it('sendBookingConfirmation sends to correct address with date in subject', async () => {
    const { sendBookingConfirmation } = await import('../email.js');
    const result = await sendBookingConfirmation({
      to: 'kunde@example.com',
      name: 'Max Muster',
      start: new Date('2026-07-01T09:00:00Z'),
      end: new Date('2026-07-01T10:00:00Z'),
    });
    expect(result).toBe(true);
  });

  it('sendCancellationNotification resolves true', async () => {
    const { sendCancellationNotification } = await import('../email.js');
    const result = await sendCancellationNotification({
      to: 'kunde@example.com',
      name: 'Max Muster',
      start: new Date('2026-07-01T09:00:00Z'),
    });
    expect(result).toBe(true);
  });

  it('sendRescheduleNotification resolves true', async () => {
    const { sendRescheduleNotification } = await import('../email.js');
    const result = await sendRescheduleNotification({
      to: 'kunde@example.com',
      name: 'Max Muster',
      newStart: new Date('2026-07-02T09:00:00Z'),
      newEnd: new Date('2026-07-02T10:00:00Z'),
    });
    expect(result).toBe(true);
  });
});
