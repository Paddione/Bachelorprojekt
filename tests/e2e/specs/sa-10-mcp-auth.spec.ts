import { test, expect } from '@playwright/test';

const MCP_STATUS_URL = process.env.MCP_STATUS_URL || 'http://ai.localhost';

test.describe('SA-10: MCP-Endpunkt-Absicherung', () => {

  test('T1: MCP status page accessible (public)', async ({ page }) => {
    // The status page itself is public — it's the MCP endpoints that need auth
    const res = await page.goto(MCP_STATUS_URL);
    expect(res?.status()).toBe(200);
  });

  test('T2: Status page health.json loads', async ({ page }) => {
    const res = await page.goto(`${MCP_STATUS_URL}/health.json`);
    // health.json is served by mcp-status pod — may take a moment to populate
    expect(res?.status()).toBe(200);
    const body = await res?.json();
    expect(typeof body).toBe('object');
  });
});
