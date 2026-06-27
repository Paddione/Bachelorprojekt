import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { archiveBillingPdf } from './billing-archive';

vi.mock('./nextcloud-files', () => ({
  ensureFolder: vi.fn(async () => undefined),
  uploadFile: vi.fn(async () => undefined),
}));

import { ensureFolder, uploadFile } from './nextcloud-files';

const ensureFolderMock = ensureFolder as unknown as ReturnType<typeof vi.fn>;
const uploadFileMock = uploadFile as unknown as ReturnType<typeof vi.fn>;

describe('archiveBillingPdf', () => {
  const ORIGINAL = {
    url: process.env.NEXTCLOUD_URL,
    pass: process.env.NEXTCLOUD_ADMIN_PASS,
  };

  beforeEach(() => {
    ensureFolderMock.mockClear();
    uploadFileMock.mockClear();
  });

  afterEach(() => {
    if (ORIGINAL.url === undefined) delete process.env.NEXTCLOUD_URL;
    else process.env.NEXTCLOUD_URL = ORIGINAL.url;
    if (ORIGINAL.pass === undefined) delete process.env.NEXTCLOUD_ADMIN_PASS;
    else process.env.NEXTCLOUD_ADMIN_PASS = ORIGINAL.pass;
  });

  it('returns null when NEXTCLOUD_URL is not configured', async () => {
    delete process.env.NEXTCLOUD_URL;
    process.env.NEXTCLOUD_ADMIN_PASS = 'x';
    const out = await archiveBillingPdf({
      brand: 'mentolder',
      invoiceNumber: 'R-001',
      filename: 'inv.pdf',
      content: Buffer.from('PDF'),
    });
    expect(out).toBeNull();
    expect(ensureFolderMock).not.toHaveBeenCalled();
  });

  it('returns null when NEXTCLOUD_ADMIN_PASS is not configured', async () => {
    process.env.NEXTCLOUD_URL = 'https://nc.example.com';
    delete process.env.NEXTCLOUD_ADMIN_PASS;
    const out = await archiveBillingPdf({
      brand: 'mentolder',
      invoiceNumber: 'R-001',
      filename: 'inv.pdf',
      content: Buffer.from('PDF'),
    });
    expect(out).toBeNull();
    expect(ensureFolderMock).not.toHaveBeenCalled();
  });

  it('uploads the file under a sanitized folder when configured', async () => {
    process.env.NEXTCLOUD_URL = 'https://nc.example.com';
    process.env.NEXTCLOUD_ADMIN_PASS = 'secret';
    const out = await archiveBillingPdf({
      brand: 'men tolder',
      invoiceNumber: 'R 2026/001',
      filename: 'invoice?.pdf',
      content: Buffer.from('PDF'),
    });
    expect(out).toBe('Billing/men-tolder/R-2026-001/invoice-.pdf');
    expect(ensureFolderMock).toHaveBeenCalledWith('Billing/men-tolder/R-2026-001');
    expect(uploadFileMock).toHaveBeenCalledWith(
      'Billing/men-tolder/R-2026-001/invoice-.pdf',
      Buffer.from('PDF'),
      'application/pdf',
    );
  });

  it('falls back to the literal "file" when the brand collapses to empty', async () => {
    process.env.NEXTCLOUD_URL = 'https://nc.example.com';
    process.env.NEXTCLOUD_ADMIN_PASS = 'secret';
    const out = await archiveBillingPdf({
      brand: '!!!',
      invoiceNumber: 'R-001',
      filename: 'inv.pdf',
      content: Buffer.from('PDF'),
    });
    expect(out).toBe('Billing/file/R-001/inv.pdf');
  });
});
