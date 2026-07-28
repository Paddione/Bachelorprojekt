const BASE = process.env.WEBSITE_URL ?? 'http://localhost:4321';

export function markerHeaders(): Record<string, string> | undefined {
  const s = process.env.CRON_SECRET;
  return s ? { 'X-E2E-Test': '1', 'X-Cron-Secret': s } : undefined;
}

export function markerAvailable(): boolean {
  return !!process.env.CRON_SECRET;
}

// createTestBugReport removed in T002330 — the /api/bug-report endpoint no longer exists.
