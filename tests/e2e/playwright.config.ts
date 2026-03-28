import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.TEST_BASE_URL || 'http://localhost:8065';

export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  retries: 1,
  workers: 1,
  reporter: [
    ['line'],
    ['json', { outputFile: '../results/.tmp-e2e-results.json' }],
  ],
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],
  outputDir: '../results/playwright-traces',
});
