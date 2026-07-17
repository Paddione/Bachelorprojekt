import { defineConfig, devices } from '@playwright/test';

const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

export default defineConfig({
  testDir: './specs',
  timeout: 45_000,
  retries: 1,
  workers: process.env.PLAYWRIGHT_WORKERS ? parseInt(process.env.PLAYWRIGHT_WORKERS, 10) : 1,
  // Test-bracketed prod DB purge. Both hooks POST to
  // /api/admin/systemtest/purge-all-test-data with X-Cron-Secret. See
  // ./specs/global-db-cleanup.ts. The Taskfile's `test:e2e` target wraps
  // `playwright test` with curl calls to the same endpoint as
  // defense-in-depth in case Playwright lifecycle crashes skip these hooks.
  globalSetup: require.resolve('./specs/global-db-cleanup.ts'),
  globalTeardown: require.resolve('./specs/global-db-cleanup-teardown.ts'),
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
    launchOptions: {
      args: [
        '--host-resolver-rules=MAP brett.dev.korczewski.de 127.0.0.1, MAP web.dev.korczewski.de 127.0.0.1, MAP auth.localhost 127.0.0.1, MAP files.localhost 127.0.0.1'
      ],
    },
  },

  projects: [
    // ── website: Astro site & backend APIs ───────────────────────
    // Run: playwright test --project=website
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
        '**/fa-28-*.spec.ts',      // Website-Messaging (internes Chat-System)
        '**/fa-poll.spec.ts',      // live poll
        '**/fa-fragebogen.spec.ts',           // consolidated questionnaire E2E
        '**/fa-coaching-drafts.spec.ts',      // coaching drafts auth-gates
        '**/fa-coaching-knowledge.spec.ts',   // knowledge collections CRUD
        '**/fa-coaching-publish.spec.ts',     // coaching publish flow
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
        '**/fa-bug-*.spec.ts',                  // dedicated bug reproductions
        '**/fa-admin-inbox.spec.ts',            // /admin/inbox two-pane rework (spec 2026-05-08)
        '**/fa-admin-inbox-delete.spec.ts',     // Löschen escape hatch (2026-05-09)
        '**/fa-admin-live.spec.ts',  // unified live cockpit
        '**/fa-29-*.spec.ts',                   // Projekt-Cockpit E2E (T000752)
        '**/fa-53-systemtest-failure-loop.spec.ts',  // system-test failure kanban (Task 7)
        '**/fa-54-coaching-sessions.spec.ts',        // coaching session wizard + auth gates (PR #826)
        '**/fa-55-lmstudio-integration.spec.ts',     // LM Studio / local-first LLM generate smoke test
        '**/fa-56-admin-assets.spec.ts',            // central asset management (PR #884)
        '**/fa-57-homepage-hifi-redesign.spec.ts', // Homepage hifi-Redesign Sektionen [T001034]
        '**/fa-41-admin-hub.spec.ts',               // unified admin hub (PR #883)
        '**/fa-43-ticket-widget.spec.ts',           // TicketWidgetBar showEdit fix + portal widget regression
        '**/fa-44-platform-health-integrity.spec.ts', // Platform Hub health API — single-cluster probe + Collabora namespace fix
        '**/wissensquellen.spec.ts',                 // knowledge collections CRUD + web_crawl ingest (PR #830)
        '**/fa-admin-db-crud-*.spec.ts',             // DB-object CRUD via web UI: projekte, followups, clients, shortcuts
        '**/agent-guide-walkthrough.spec.ts',        // in-app Agent-Anleitung E2E (public, no auth)
        '**/fa-m3-*.spec.ts',                        // M3 onboarding flow
        '**/fa-admin-backup-ops.spec.ts',            // admin backup ops auth guards
        '**/fa-50-*.spec.ts',                        // request correlation / X-Request-ID (T000964)
        '**/fa-51-*.spec.ts',                        // sidekick navigation + grilling/mediaviewer views (T000965)
        '**/a11y-axe.spec.ts',                       // axe-core a11y-Scan der Kern-Routen (G-FE01, T001206)
        '**/coaching-studio-empty-customer.spec.ts', // coaching-studio Workspace-Crash bei leerem CUSTOMERS (T001656)
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── mentolder-setup: seeds mentolder website auth state ─────────
    {
      name: 'mentolder-setup',
      testMatch: '**/mentolder-auth-setup.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
      },
    },

    // ── mentolder: Authenticated mentolder tests ─────────────────────────
    // Run: playwright test --project=mentolder
    {
      name: 'mentolder',
      dependencies: ['mentolder-setup'],
      testMatch: [
        '**/fa-48-*.spec.ts',
        '**/fa-49-*.spec.ts',             // /admin/factory-observability OTel dashboard (admin-gated)
        '**/fa-46-*.spec.ts',
        '**/fa-45-*.spec.ts',
        '**/fa-42-*.spec.ts',             // platform asset inventory (admin-gated)
        '**/fa-content-hub-price-ssot.spec.ts',
        '**/fa-content-hub-editability.spec.ts',
        '**/fa-content-hub-legal-ssot.spec.ts',
        '**/fa-content-hub-editor.spec.ts',
        '**/fa-content-hub-versioning.spec.ts',
        '**/fa-content-hub-service-consolidation.spec.ts',
        '**/fa-factory-injection.spec.ts', // /dev-status inject form smoke (admin-gated) [factory-injection]
        '**/fa-factory-floor.spec.ts',     // /dev-status hall render (admin-gated)
        '**/fa-kommissionierung.spec.ts',  // /dev-status Kommissionierung column (admin-gated)
        '**/fa-planning-office.spec.ts',   // /admin/planungsbuero CRUD/rank/DoR (admin-gated)
        '**/dev-status-tabs.spec.ts',      // FA-UNIF-01..08 — unified tabs, redirect, mobile (admin-gated)
        '**/fa-admin-knowledge-model-selection.spec.ts', // embedding model selection (admin-gated)
        '**/fa-mobile-factory.spec.ts',           // FA-MOBILE-01..06 mobile factory parity (admin-gated)
        '**/sa-21-*.spec.ts',             // admin Aktionen tab (admin-gated)
        '**/factory-qs-abnahme.spec.ts',  // QS-Abnahme-Flow /dev-status (T000730)
      ],
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
        storageState: '.auth/mentolder-website-admin.json',
      },
    },

    // ── services: Infrastructure & supporting services ───────────
    // Run: playwright test --project=services
    {
      name: 'services',
      testMatch: [
        '**/fa-03-*.spec.ts',    // Nextcloud Talk / video
        '**/fa-12-*.spec.ts',    // Claude Code AI Assistant / MCP infrastructure
        '**/fa-13-*.spec.ts',    // Dokumentations-Service (Docsify)
        '**/fa-18-*.spec.ts',    // transcription service (cluster-internal URL)
        '**/fa-23-*.spec.ts',    // Vaultwarden
        '**/fa-24-*.spec.ts',    // Whiteboard
        '**/fa-25-*.spec.ts',    // Mailpit
        '**/fa-27-*.spec.ts',    // Systemisches Brett service
        // brett-mayhem now lives in its own authenticated project (brett-mentolder)
        '**/fa-30-einvoice.spec.ts', // E-Rechnung / XRechnung (einvoice-sidecar)
        '**/fa-32-*.spec.ts',    // LLM-Router bge-m3 Embeddings
        '**/fa-33-*.spec.ts',    // LLM-Router voyage-multilingual-2
        '**/fa-34-*.spec.ts',    // LLM-Router strict-fail (kein silent fallback)
        '**/fa-35-*.spec.ts',    // LLM MixedEmbeddingModelError
        '**/fa-36-*.spec.ts',    // Rerank-Endpunkt
        '**/fa-37-*.spec.ts',    // workspace-chat Roundtrip
        '**/fa-livekit.spec.ts', // LiveKit / Livestream auth-gating
        '**/sa-01-*.spec.ts',    // Transportverschlüsselung (TLS + security headers)
        '**/sa-02-*.spec.ts',    // Authentication (wrong password → Keycloak error)
        '**/sa-03-*.spec.ts',    // Passwörter (Hash, Policy, kein Klartext)
        '**/sa-04-*.spec.ts',    // Session-Timeout (DSGVO-konform)
        '**/sa-05-*.spec.ts',    // Audit-Log (Login- und Admin-Events)
        '**/sa-07-*.spec.ts',    // Backup (pg_dump, PVCs)
        '**/sa-08-*.spec.ts',    // SSO integration browser flow
        '**/sa-10-*.spec.ts',    // MCP-Endpunkt-Absicherung (ForwardAuth)
        '**/sa-11-*.spec.ts',    // Arena non-admin 403
        '**/sa-12-*.spec.ts',    // Korczewski-Realm JWT-Akzeptanz
        '**/sa-13-*.spec.ts',    // Untrusted JWT abgelehnt
        '**/nfa-01-*.spec.ts',   // Datenschutz / DSGVO
        '**/nfa-02-*.spec.ts',   // Performance / Antwortzeiten
        '**/nfa-03-*.spec.ts',   // Verfügbarkeit und Neustart-Resilienz
        '**/nfa-04-*.spec.ts',   // Skalierbarkeit
        '**/nfa-05-*.spec.ts',   // usability / mobile
        '**/nfa-06-*.spec.ts',   // Website Neustart-Resilienz
        '**/nfa-07-*.spec.ts',   // Open-Source-Lizenz
        '**/nfa-08-*.spec.ts',   // Produktions-Deployment (Hetzner/k3s)
        '**/nfa-09-*.spec.ts',   // Statisches DNS (kein DDNS)
        '**/nfa-10-*.spec.ts',   // Arena Health-Endpoint Performance
        '**/nfa-11-*.spec.ts',   // GPU-VRAM nach Modell-Rotation
        '**/nfa-12-*.spec.ts',   // Brainstorm-Tunnel ConfigMap-Persistenz
        '**/nfa-13-*.spec.ts',   // Unified-fleet korczewski deploy GATE (red until Phase 2b)
        '**/nfa-infra-health-sweep.spec.ts', // Service health sweep (all 17 services)
        '**/sa-15-*.spec.ts',    // Cross-cluster health verification
        '**/ak-03-*.spec.ts',    // Technische Machbarkeit
        '**/ak-04-*.spec.ts',    // Prototyp-Betrieb
        '**/fa-content-hub-concurrency.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── brett-mentolder-setup: seeds mentolder brett auth state ─────
    {
      name: 'brett-mentolder-setup',
      testMatch: '**/brett-mentolder-auth-setup.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
      },
    },

    // ── brett-mentolder: Mayhem 1v3 AI mode (authenticated) ─────────
    // Run: playwright test --project=brett-mentolder
    {
      name: 'brett-mentolder',
      dependencies: ['brett-mentolder-setup'],
      testMatch: [
        '**/brett-mannequin.spec.ts',  // mannequin focus
        '**/brett-roles.spec.ts',      // C7 role enforcement (opens its own contexts)
        '**/brett-share-link.spec.ts', // T000608 public view-only share link
        '**/brett-session-lifecycle.spec.ts', // session-active/round-phases/kick/handoff (opens its own contexts)
        '**/brett-hidden-figures.spec.ts',    // E9 verdecktes Arbeiten — role-filter security test (opens its own contexts)
        '**/brett-moderation.spec.ts',        // spotlight/dim/freeze (opens its own contexts)
        '**/brett-undo-redo.spec.ts',         // session_undo/session_redo (opens its own contexts)
        '**/brett-ground-annotations.spec.ts',// anchors/zones/lines incl. leiter-only gate (opens its own contexts)
        '**/brett-figure-ownership.spec.ts',  // figure_type_set/admin_assign_figure/lobby settings (opens its own contexts)
      ],
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
        storageState: '.auth/mentolder-brett.json',
      },
    },

    // ── korczewski-setup: seeds auth state for korczewski tests ─────
    // Runs before `korczewski` via the `dependencies` field.
    // Performs real OIDC login and writes .auth/korczewski-*.json.
    {
      name: 'korczewski-setup',
      testMatch: '**/korczewski-auth-setup.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
      },
    },

    // ── korczewski: Korczewski-brand & cross-cluster specs ───────
    // Run: playwright test --project=korczewski
    {
      name: 'korczewski',
      dependencies: ['korczewski-setup'],
      testMatch: [
        '**/korczewski-home.spec.ts',  // Kore brand homepage
        '**/brett-art.spec.ts',        // Brett art-library (canvas sprites)
        '**/fa-47-brett-figure-pack-assets.spec.ts', // figure-pack assets served (T000527/T000522)
        '**/dashboard-art.spec.ts',    // Dashboard art-library tab (web.korczewski.de/admin)
        '**/fa-content-hub-legal-ssot.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        ignoreHTTPSErrors: true,
      },
    },

    // ── smoke: Cross-service integration tests ──────────────────
    // Run: playwright test --project=smoke
    {
      name: 'smoke',
      testMatch: [
        '**/integration-smoke.spec.ts',
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── ios: iPhone WebKit (Safari) simulation ───────────────────
    // Run: playwright test --project=ios
    // Requires: playwright install webkit
    {
      name: 'ios',
      testMatch: ['**/fa-03-*.spec.ts', '**/fa-ios-*.spec.ts'],
      use: {
        ...devices['iPhone 15'],
        baseURL: websiteURL,
      },
    },

    // ── android: Pixel 5 Chromium (mobile, touch, 393×851) ───────
    // Run: playwright test --project=android
    // Covers Brett mobile layout + tap-target compliance.
    {
      name: 'android',
      dependencies: ['brett-mentolder-setup'],
      testMatch: [
        '**/brett-mobile.spec.ts',
      ],
      use: {
        ...devices['Pixel 5'],
        ignoreHTTPSErrors: true,
      },
    },

    // ── systemtest: cycle fan-out (12 system-test packages) ──────
    // Each spec walks one System-Test template via the
    // QuestionnaireWizard. The runner is headed-friendly so the
    // operator can watch and take over for steps marked with
    // agent_notes (real signatures, threshold crossings, etc.).
    //
    // Fan-out: run three specs concurrently, one per package, e.g.
    //   E2E_ADMIN_PASS=… playwright test --project=systemtest \
    //     --headed -g "System-Test 4" &
    //   E2E_ADMIN_PASS=… playwright test --project=systemtest \
    //     --headed -g "System-Test 5" &
    //   E2E_ADMIN_PASS=… playwright test --project=systemtest \
    //     --headed -g "System-Test 6" &
    {
      name: 'systemtest',
      testMatch: ['**/systemtest-*.spec.ts'],
      timeout: 300_000,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: websiteURL,
      },
    },

    // ── unit: pure-function tests in tests/e2e/lib/*.test.ts ─────
    // Run: playwright test --project=unit
    {
      name: 'unit',
      testDir: './lib',
      testMatch: ['*.test.ts'],
      use: {},
    },
  ],

  outputDir: '../results/playwright-traces',
});
