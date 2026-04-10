import { defineConfig, devices } from '@playwright/test';

const mmURL     = process.env.TEST_BASE_URL || 'http://localhost:8065';
const websiteURL = process.env.WEBSITE_URL  || 'http://localhost:4321';

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
    baseURL: mmURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },

  projects: [
    // ── Setup (logs in, stores session — required by chat + auth) ──
    {
      name: 'setup',
      testMatch: /global-setup\.ts/,
    },

    // ── chat: Mattermost core UI ─────────────────────────────────
    // Run: npx playwright test --project=chat
    {
      name: 'chat',
      testMatch: [
        '**/fa-01-*.spec.ts', // messaging
        '**/fa-02-*.spec.ts', // channels
        '**/fa-04-*.spec.ts', // file upload
        '**/fa-06-*.spec.ts', // notifications
        '**/fa-07-*.spec.ts', // search
        '**/fa-08-*.spec.ts', // status
        '**/fa-09-*.spec.ts', // billing bot (MM side)
        '**/fa-11-*.spec.ts', // guest access
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: mmURL,
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ── auth: Authentication & SSO flows ────────────────────────
    // Run: npx playwright test --project=auth
    {
      name: 'auth',
      testMatch: [
        '**/fa-05-*.spec.ts', // user mgmt / SSO admin
        '**/sa-02-*.spec.ts', // wrong-password, lockout
        '**/sa-08-*.spec.ts', // cross-service SSO browser
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: mmURL,
      },
      dependencies: ['setup'],
    },

    // ── website: Astro site & backend APIs ───────────────────────
    // Run: npx playwright test --project=website
    {
      name: 'website',
      testMatch: [
        '**/fa-10-*.spec.ts', // website structure & contact form
        '**/fa-14-*.spec.ts', // registration flow
        '**/fa-15-*.spec.ts', // OIDC login
        '**/fa-16-*.spec.ts', // calendar / booking
        '**/fa-17-*.spec.ts', // meeting lifecycle
        '**/fa-18-*.spec.ts', // transcription upload
        '**/fa-19-*.spec.ts', // Outline knowledge base
        '**/fa-20-*.spec.ts', // meeting finalization
        '**/fa-21-*.spec.ts', // service catalog & billing
        '**/fa-slot-widget.spec.ts', // slot widget
        '**/fa-client-portal.spec.ts', // client portal auth-gate
        '**/fa-meeting-history.spec.ts', // meeting history & release
        '**/fa-document-signing.spec.ts', // document signing flow
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
      // no dependency on setup — doesn't need MM session
    },

    // ── services: Infrastructure & supporting services ───────────
    // Run: npx playwright test --project=services
    {
      name: 'services',
      testMatch: [
        '**/fa-03-*.spec.ts',  // Nextcloud Talk / video
        '**/fa-12-*.spec.ts',  // Claude Code / MCP status
        '**/fa-13-*.spec.ts',  // docs
        '**/fa-23-*.spec.ts',  // Vaultwarden
        '**/fa-24-*.spec.ts',  // Whiteboard
        '**/fa-25-*.spec.ts',  // Mailpit
        '**/sa-10-*.spec.ts',  // MCP endpoint auth
        '**/nfa-05-*.spec.ts', // usability / mobile
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: mmURL,
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // ── smoke: Cross-service integration tests ──────────────────
    // Run: npx playwright test --project=smoke
    {
      name: 'smoke',
      testMatch: ['**/integration-smoke.spec.ts'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: mmURL,
      },
      // no dependency on setup — handles its own auth
    },
  ],

  outputDir: '../results/playwright-traces',
});
