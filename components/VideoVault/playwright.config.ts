import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Load Playwright-specific environment variables
dotenv.config({ path: 'env/.env-playwright' });

const BASE_URL = process.env.BASE_URL || 'http://localhost:5100';
const SKIP_WEB_SERVER = !!process.env.PW_SKIP_WEB_SERVER;
const E2E_MSW = process.env.VITE_E2E_MSW;

export default defineConfig({
  testDir: './e2e/playwright',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // Add a bit more retry to smooth out animation/timing related flakiness
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  // Ensure all artifacts are written to a local, writable folder
  outputDir: 'test-results/pw-local',
  reporter: [
    ['list'],
    // Keep HTML report outside of outputDir to avoid folder clash warning
    ['html', { outputFolder: 'test-results/pw-local-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/pw-local/junit.xml' }],
    ['json', { outputFile: 'test-results/pw-local/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Allow disabling the internal webServer when running against a Compose service
  webServer: SKIP_WEB_SERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NODE_ENV: 'development',
          PORT: '5100',
          // Allow optionally enabling MSW in the browser for e2e
          ...(E2E_MSW ? { VITE_E2E_MSW: E2E_MSW } : {}),
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
