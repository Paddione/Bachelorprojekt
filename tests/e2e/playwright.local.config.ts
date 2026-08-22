import { defineConfig, devices } from '@playwright/test';

const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

export default defineConfig({
  testDir: './specs',
  timeout: 10_000,
  retries: 0,
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10) : 4,
  reporter: [['line']],
  use: {
    baseURL: websiteURL,
    ignoreHTTPSErrors: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    // ── website: public & admin website tests ────────────────────
    // Run: WEBSITE_URL=http://localhost:4321 npx playwright test --config playwright.local.config.ts
    // Only includes tests that work against a local dev server.
    // For authenticated or cluster-internal tests, use the main config.
    {
      name: 'website',
      testMatch: [
        '**/fa-01-*.spec.ts',
        '**/fa-04-*.spec.ts',
        '**/fa-05-*.spec.ts',
        '**/fa-10-*.spec.ts',
        '**/fa-14-*.spec.ts',
        '**/fa-15-*.spec.ts',
        '**/fa-16-*.spec.ts',
        '**/fa-17-*.spec.ts',
        '**/fa-20-*.spec.ts',
        '**/fa-21-*.spec.ts',
        '**/fa-26-*.spec.ts',
        '**/fa-28-*.spec.ts',
        '**/fa-public-pages.spec.ts',
        '**/fa-admin-live.spec.ts',
        '**/fa-admin-crm.spec.ts',
        '**/fa-admin-settings.spec.ts',
        '**/fa-admin-inbox.spec.ts',
        '**/fa-admin-inbox-delete.spec.ts',
        '**/fa-admin-inhalte.spec.ts',
        '**/fa-admin-billing-system.spec.ts',
        '**/fa-admin-tickets.spec.ts',
        '**/fa-admin-monitoring.spec.ts',
        '**/fa-admin-newsletter.spec.ts',
        '**/fa-41-admin-hub.spec.ts',
        '**/fa-44-platform-health-integrity.spec.ts',
        '**/fa-57-homepage-hifi-redesign.spec.ts',
        '**/fa-50-*.spec.ts',
        '**/fa-51-*.spec.ts',
        '**/agent-guide-walkthrough.spec.ts',
        '**/a11y-axe.spec.ts',
        '**/fa-54-coaching-sessions.spec.ts',
        '**/fa-55-lmstudio-integration.spec.ts',
        '**/fa-56-admin-assets.spec.ts',
        '**/fa-poll.spec.ts',
        '**/fa-slot-widget.spec.ts',
        '**/fa-client-portal.spec.ts',
        '**/fa-meeting-history.spec.ts',
        '**/fa-document-signing.spec.ts',
        '**/wissensquellen.spec.ts',
        // T013329: fa-bug-t000368 (guardSdlc) läuft in sdlc-local, nicht hier.
        '**/integration-smoke.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── mentolder-setup: seeds mentolder website auth state ─────────
    // T013329 F3/D2: Vorbild für sdlc-local — dieselben Specs liefen im
    // Nightly im Projekt `mentolder` mit derselben Auth-Kette.
    {
      name: 'mentolder-setup',
      testMatch: '**/mentolder-auth-setup.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
      },
    },

    // ── sdlc-local: SDLC-Cockpit-Specs (guardSdlc) ───────────────────
    // T013329 F3/D2: Die SDLC-Routen sind im Prod-Build absichtlich entfernt,
    // gegen prod skippt der Guard immer (~79 Tests). Lokal gegen eine Dev-
    // Instanz mit SDLC-Build sind die Specs wertvoll und laufen hier.
    // Run: npx playwright test --config playwright.local.config.ts --project=sdlc-local
    {
      name: 'sdlc-local',
      dependencies: ['mentolder-setup'],
      testMatch: [
        '**/dev-status-tabs.spec.ts',
        '**/fa-42-platform-assets.spec.ts',
        '**/fa-43-ticket-widget.spec.ts',
        '**/fa-48-factory-devflow.spec.ts',
        '**/fa-49-factory-observability.spec.ts',
        '**/fa-53-systemtest-failure-loop.spec.ts',
        '**/fa-58-admin-cockpit.spec.ts',
        '**/fa-bug-t000368.spec.ts',
        '**/fa-factory-floor.spec.ts',
        '**/fa-factory-injection.spec.ts',
        '**/fa-kommissionierung.spec.ts',
        '**/fa-mobile-factory.spec.ts',
        '**/fa-planning-office.spec.ts',
        '**/sa-21-admin-actions.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
        storageState: '.auth/mentolder-website-admin.json',
      },
    },

    // ── llm-local: LLM-Router & GPU-Host-Specs ───────────────────────
    // T013329 F5/D4: Der Router sitzt auf dem GPU-Host im wg-mesh — von einem
    // GitHub-Runner unerreichbar (Netzwerk, kein Auth). Die Specs skippen
    // selbständig ohne LLM_HOST_IP/LLM_ROUTER_URL und laufen lokal im Mesh.
    // Run: npx playwright test --config playwright.local.config.ts --project=llm-local
    {
      name: 'llm-local',
      testMatch: [
        '**/fa-32-*.spec.ts',    // LLM-Router bge-m3 Embeddings
        '**/fa-33-*.spec.ts',    // LLM-Router voyage-multilingual-2
        '**/fa-34-*.spec.ts',    // LLM-Router strict-fail (kein silent fallback)
        '**/fa-36-*.spec.ts',    // Rerank-Endpunkt
        '**/fa-37-*.spec.ts',    // workspace-chat Roundtrip
        '**/nfa-11-*.spec.ts',   // GPU-VRAM nach Modell-Rotation
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },
  ],
  outputDir: '../results/playwright-traces',
});
