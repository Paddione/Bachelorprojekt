import { ensureFolder, uploadFile } from './nextcloud-files';

function safeSegment(v: string): string {
  return v.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
}

export async function archiveBillingPdf(params: {
  brand: string;
  invoiceNumber: string;
  filename: string;
  content: Buffer;
}): Promise<string | null> {
  if (!process.env.NEXTCLOUD_URL || !process.env.NEXTCLOUD_ADMIN_PASS) return null;
  const folder = `Billing/${safeSegment(params.brand)}/${safeSegment(params.invoiceNumber)}`;
  const path = `${folder}/${safeSegment(params.filename)}`;
  await ensureFolder(folder);
  await uploadFile(path, params.content, 'application/pdf');
  return path;
}
