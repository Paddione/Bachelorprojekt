const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';

export function markerHeaders(): Record<string, string> | undefined {
  const s = process.env.CRON_SECRET;
  return s ? { 'X-E2E-Test': '1', 'X-Cron-Secret': s } : undefined;
}

export function markerAvailable(): boolean {
  return !!process.env.CRON_SECRET;
}

export async function createTestBugReport(
  request: import('@playwright/test').APIRequestContext,
  fields: { description: string; email: string; category: string; url?: string },
): Promise<{ ticketId: string }> {
  const headers = markerHeaders();
  if (!headers) throw new Error('createTestBugReport ohne CRON_SECRET — Aufrufer muss vorher markerAvailable() skippen');
  const res = await request.post(`${BASE}/api/bug-report`, {
    headers,
    multipart: { url: '/', ...fields },
  });
  if (!res.ok()) throw new Error(`bug-report create failed: ${res.status()}`);
  const body = await res.json() as { success: boolean; ticketId: string };
  return { ticketId: body.ticketId };
}
