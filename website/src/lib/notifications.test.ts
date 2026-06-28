import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAdminNotification } from './notifications';
import * as loggerModule from './logger';

vi.mock('./website-db', () => ({
  getSiteSetting: vi.fn(),
}));

vi.mock('./email', () => ({
  sendEmail: vi.fn(),
}));

import { getSiteSetting } from './website-db';
import { sendEmail } from './email';

const mockGet = getSiteSetting as unknown as ReturnType<typeof vi.fn>;
const mockSend = sendEmail as unknown as ReturnType<typeof vi.fn>;

describe('sendAdminNotification', () => {
  const ORIGINAL_BRAND = process.env.BRAND;
  const ORIGINAL_CONTACT = process.env.CONTACT_EMAIL;

  beforeEach(() => {
    mockGet.mockReset();
    mockSend.mockReset();
    delete process.env.BRAND;
    delete process.env.CONTACT_EMAIL;
  });

  afterEach(() => {
    if (ORIGINAL_BRAND === undefined) delete process.env.BRAND;
    else process.env.BRAND = ORIGINAL_BRAND;
    if (ORIGINAL_CONTACT === undefined) delete process.env.CONTACT_EMAIL;
    else process.env.CONTACT_EMAIL = ORIGINAL_CONTACT;
  });

  it('returns silently when no notification email and no CONTACT_EMAIL fallback are set', async () => {
    mockGet.mockResolvedValue(undefined);
    await sendAdminNotification({ type: 'contact', subject: 'x', text: 'y' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('uses the configured notification_email for the recipient', async () => {
    mockGet.mockImplementation(async (_brand: string, key: string) => {
      if (key === 'notification_email') return 'admin@example.com';
      if (key.startsWith('notify_')) return 'true';
      return undefined;
    });
    mockSend.mockResolvedValue(true);
    await sendAdminNotification({ type: 'contact', subject: 'New ticket', text: 'Hello' });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com', subject: 'New ticket' }),
    );
  });

  it('skips the email when the per-type toggle is "false"', async () => {
    mockGet.mockImplementation(async (_brand: string, key: string) => {
      if (key === 'notification_email') return 'admin@example.com';
      if (key === 'notify_followup') return 'false';
      return undefined;
    });
    await sendAdminNotification({ type: 'followup', subject: 'x', text: 'y' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('treats "true" (and missing) per-type toggle as enabled', async () => {
    mockGet.mockImplementation(async (_brand: string, key: string) => {
      if (key === 'notification_email') return 'admin@example.com';
      if (key === 'notify_registration') return 'true';
      return undefined;
    });
    mockSend.mockResolvedValue(true);
    await sendAdminNotification({ type: 'registration', subject: 'x', text: 'y' });
    expect(mockSend).toHaveBeenCalled();
  });

  it('falls back to TYPE_DEFAULTS ("true" for most types) when toggle is missing', async () => {
    mockGet.mockImplementation(async (_brand: string, key: string) => {
      if (key === 'notification_email') return 'admin@example.com';
      if (key === 'notify_booking') return null;
      return undefined;
    });
    mockSend.mockResolvedValue(true);
    await sendAdminNotification({ type: 'booking', subject: 'x', text: 'y' });
    expect(mockSend).toHaveBeenCalled();
  });

  it('warns but does not throw when sendEmail returns false', async () => {
    mockGet.mockImplementation(async (_brand: string, key: string) => {
      if (key === 'notification_email') return 'admin@example.com';
      if (key.startsWith('notify_')) return 'true';
      return undefined;
    });
    mockSend.mockResolvedValue(false);
    const warnSpy = vi.spyOn(loggerModule.logger, 'warn').mockReturnValue(undefined as any);
    try {
      await expect(
        sendAdminNotification({ type: 'contact', subject: 'x', text: 'y' }),
      ).resolves.toBeUndefined();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
