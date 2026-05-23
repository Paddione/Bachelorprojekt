import { test, expect } from '@playwright/test';

const BASE = process.env.WEBSITE_URL || 'http://localhost:4321';

test.describe('NFA-01: Datenschutz / DSGVO', () => {
  test('T4-website: Website lädt keine externen Tracking-Scripts', async ({ page }) => {
    const externalRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('facebook') ||
        url.includes('tracking') ||
        url.includes('analytics.js') ||
        url.includes('gtag')
      ) {
        externalRequests.push(url);
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    expect(externalRequests).toHaveLength(0);
  });

  test('T4-website: Keine Google Fonts von externen Servern geladen', async ({ page }) => {
    const gFontRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
        gFontRequests.push(url);
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    expect(gFontRequests).toHaveLength(0);
  });

  test('T4-website: Keine Amazon/Azure/GCP-Requests vom Browser', async ({ page }) => {
    const cloudRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (
        url.includes('amazonaws.com') ||
        url.includes('azurecr.io') ||
        url.includes('mcr.microsoft.com') ||
        url.includes('gcr.io')
      ) {
        cloudRequests.push(url);
      }
    });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    expect(cloudRequests).toHaveLength(0);
  });

  test.skip(true, 'T1-T3: Container-Image-Prüfungen, Storage-Backends und Telemetrie erfordern kubectl-Zugriff');
});
