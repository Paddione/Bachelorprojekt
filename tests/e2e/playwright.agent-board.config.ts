import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  timeout: 15_000,
  retries: 0,
  reporter: [['line']],
  use: {
    baseURL: process.env.AGENT_BOARD_URL || 'http://localhost:4321',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'agent-board',
      testMatch: '**/agent-board-frontends.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
