import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './specs',
  timeout: 30_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
