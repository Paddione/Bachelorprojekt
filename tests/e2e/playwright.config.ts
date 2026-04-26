import { defineConfig, devices } from '@playwright/test';

const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

export default defineConfig({
  testDir: './specs',
  timeout: 45_000,
  retries: 1,
  workers: 1,
  reporter: [
    ['line'],
    ['json', { outputFile: '../results/.tmp-e2e-results.json' }],
  ],
  use: {
    baseURL: websiteURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },

  projects: [
    // ── website: Astro site & backend APIs ───────────────────────
    // Run: npx playwright test --project=website
    {
      name: 'website',
      testMatch: [
        '**/fa-01-*.spec.ts',      // portal messaging (auth-gating)
        '**/fa-04-*.spec.ts',      // project file attachments (auth-gating)
        '**/fa-05-*.spec.ts',      // user management (admin endpoints + registration)
        '**/fa-07-*.spec.ts',      // website API & content discoverability
        '**/fa-09-*.spec.ts',      // service catalog
        '**/fa-10-*.spec.ts',      // website structure & contact form
        '**/fa-14-*.spec.ts',      // registration flow
        '**/fa-15-*.spec.ts',      // OIDC login
        '**/fa-16-*.spec.ts',      // calendar / booking
        '**/fa-17-*.spec.ts',      // meeting lifecycle
        '**/fa-18-*.spec.ts',      // transcription upload
        '**/fa-20-*.spec.ts',      // meeting finalization
        '**/fa-21-*.spec.ts',      // service catalog & billing
        '**/fa-26-*.spec.ts',      // bug report form
        '**/fa-poll.spec.ts',      // live poll
        '**/fa-questionnaire.spec.ts', // Fragebögen
        '**/fa-slot-widget.spec.ts',   // slot widget
        '**/fa-client-portal.spec.ts', // client portal auth-gate
        '**/fa-meeting-history.spec.ts',  // meeting history & release
        '**/fa-document-signing.spec.ts', // document signing flow
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── services: Infrastructure & supporting services ───────────
    // Run: npx playwright test --project=services
    {
      name: 'services',
      testMatch: [
        '**/fa-03-*.spec.ts',  // Nextcloud Talk / video
        '**/fa-23-*.spec.ts',  // Vaultwarden
        '**/fa-24-*.spec.ts',  // Whiteboard
        '**/fa-25-*.spec.ts',  // Mailpit
        '**/sa-08-*.spec.ts',  // SSO integration browser flow
        '**/nfa-05-*.spec.ts', // usability / mobile
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── smoke: Cross-service integration tests ──────────────────
    // Run: npx playwright test --project=smoke
    {
      name: 'smoke',
      testMatch: ['**/integration-smoke.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },
  ],

  outputDir: '../results/playwright-traces',
});
