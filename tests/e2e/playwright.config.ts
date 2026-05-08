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
    ['junit', { outputFile: '../results/junit.xml' }],
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
        '**/fa-20-*.spec.ts',      // meeting finalization
        '**/fa-21-*.spec.ts',      // service catalog & billing
        '**/fa-26-*.spec.ts',      // bug report form
        '**/fa-poll.spec.ts',      // live poll
        '**/fa-questionnaire.spec.ts', // Fragebögen
        '**/fa-slot-widget.spec.ts',   // slot widget
        '**/fa-client-portal.spec.ts', // client portal auth-gate
        '**/fa-meeting-history.spec.ts',  // meeting history & release
        '**/fa-document-signing.spec.ts', // document signing flow
        '**/fa-admin-monitoring.spec.ts',       // admin monitoring page auth
        '**/fa-admin-newsletter.spec.ts',       // admin newsletter page auth
        '**/fa-admin-backup-settings.spec.ts',  // admin backup settings auth
        '**/fa-public-pages.spec.ts',           // public static & legal pages
        '**/fa-admin-inhalte.spec.ts',          // unified content editor + legacy stubs
        '**/fa-admin-billing-system.spec.ts',   // native SEPA billing, EÜR, UStVA
        '**/fa-admin-crm.spec.ts',              // CRM: termine, followups, projekte, rooms, meetings
        '**/fa-admin-settings.spec.ts',         // settings: email, rechnungen, branding, benachrichtigungen
        '**/fa-bugs-notifications.spec.ts',     // bug-report → admin resolve → reporter email (FA-bug-notify)
        '**/fa-admin-tickets.spec.ts',          // unified admin /admin/tickets index + detail (PR4/5)
        '**/fa-admin-inbox.spec.ts',            // /admin/inbox two-pane rework (spec 2026-05-08)
        '**/fa-admin-live.spec.ts',  // unified live cockpit
        '**/fa-30-systemtest-failure-loop.spec.ts',  // system-test failure kanban (Task 7)
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
        '**/fa-03-*.spec.ts',    // Nextcloud Talk / video
        '**/fa-18-*.spec.ts',    // transcription service (cluster-internal URL)
        '**/fa-23-*.spec.ts',    // Vaultwarden
        '**/fa-24-*.spec.ts',    // Whiteboard
        '**/fa-25-*.spec.ts',    // Mailpit
        '**/fa-27-*.spec.ts',    // Systemisches Brett service
        '**/fa-29-*.spec.ts',    // Requirements Tracking UI
        '**/fa-livekit.spec.ts', // LiveKit / Livestream auth-gating
        '**/sa-02-*.spec.ts',    // Authentication (wrong password → Keycloak error)
        '**/sa-08-*.spec.ts',    // SSO integration browser flow
        '**/nfa-05-*.spec.ts',   // usability / mobile
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── korczewski: Korczewski-brand & cross-cluster specs ───────
    // Run: npx playwright test --project=korczewski
    {
      name: 'korczewski',
      testMatch: [
        '**/korczewski-home.spec.ts',  // Kore brand homepage
        '**/brett-art.spec.ts',        // Brett art-library (canvas sprites)
        '**/dashboard-art.spec.ts',    // Dashboard art-library tab
      ],
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
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

    // ── ios: iPhone WebKit (Safari) simulation ───────────────────
    // Run: npx playwright test --project=ios
    // Requires: npx playwright install webkit
    {
      name: 'ios',
      testMatch: ['**/fa-03-*.spec.ts', '**/fa-ios-*.spec.ts'],
      use: {
        ...devices['iPhone 15'],
        baseURL: websiteURL,
      },
    },
  ],

  outputDir: '../results/playwright-traces',
});
