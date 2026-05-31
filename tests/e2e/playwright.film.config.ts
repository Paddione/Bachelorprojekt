import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

export default defineConfig({
  ...baseConfig,
  testMatch: ['**/agent-guide-walkthrough.spec.ts'],
  retries: 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    ...baseConfig.use,
    baseURL: websiteURL,
    headless: false,
    launchOptions: {
      ...(baseConfig.use?.launchOptions ?? {}),
      slowMo: 700,
    },
    video: 'on',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'film',
      testMatch: ['**/agent-guide-walkthrough.spec.ts'],
      use: {
        headless: false,
        launchOptions: { slowMo: 700 },
        video: 'on',
        viewport: { width: 1440, height: 900 },
        baseURL: websiteURL,
        ignoreHTTPSErrors: true,
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin',
        permissions: ['clipboard-read', 'clipboard-write'],
      },
    },
  ],
});
