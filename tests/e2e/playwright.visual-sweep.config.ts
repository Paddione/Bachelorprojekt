import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';
import baseConfig from './playwright.config';

// WEBSITE_URL drives both the baseURL the sweep navigates and the login host
// the *-setup projects authenticate against. Mirror playwright.film.config.ts:4.
const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

// The visual sweep is a read-only screenshot pass. Like the film config
// (playwright.film.config.ts:12-13) it must NOT inherit baseConfig's
// globalSetup/globalTeardown — those bracket every run with a prod-DB purge
// (POST /api/admin/systemtest/purge-all-test-data). A screenshot sweep must
// never purge production data.
const GLOBAL_SETUP = undefined;
const GLOBAL_TEARDOWN = undefined;

// Only the two website-auth setups are relevant to the sweep. The brett
// setup (brett-mentolder-setup) seeds game auth state the sweep never
// touches, so we whitelist by name rather than a broad
// .endsWith('-setup') filter (which would pull all four).
const WEBSITE_SETUP_NAMES = ['mentolder-setup', 'korczewski-setup'];

const baseProjects = (baseConfig.projects ?? []) as Project[];
const setupProjects: Project[] = baseProjects.filter(
  (p) => typeof p.name === 'string' && WEBSITE_SETUP_NAMES.includes(p.name),
);

const DESKTOP = { width: 1440, height: 900 } as const;
const MOBILE = { width: 390, height: 844 } as const;

const sweepUse = (viewport: { width: number; height: number }) => ({
  viewport,
  baseURL: websiteURL,
  ignoreHTTPSErrors: true,
});

export default defineConfig({
  ...baseConfig,
  globalSetup: GLOBAL_SETUP,
  globalTeardown: GLOBAL_TEARDOWN,
  // A read-only screenshot sweep is a single long serial test; retrying the whole
  // ~4-min pass on a soft failure (e.g. one route flagged) just doubles wall-clock
  // and re-captures everything. Mirror playwright.film.config.ts (retries: 0).
  retries: 0,
  testMatch: ['**/visual-sweep.spec.ts'],
  use: {
    ...baseConfig.use,
    baseURL: websiteURL,
    ignoreHTTPSErrors: true,
  },
  projects: [
    // Re-declare the two website-auth setups so the sweep projects can depend
    // on them (mints .auth/*-website-{admin,user}.json storage states).
    ...setupProjects,
    {
      name: 'visual-sweep-mentolder-desktop',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['mentolder-setup'],
      use: sweepUse(DESKTOP),
    },
    {
      name: 'visual-sweep-mentolder-mobile',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['mentolder-setup'],
      use: sweepUse(MOBILE),
    },
    {
      name: 'visual-sweep-korczewski-desktop',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['korczewski-setup'],
      use: sweepUse(DESKTOP),
    },
    {
      name: 'visual-sweep-korczewski-mobile',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['korczewski-setup'],
      use: sweepUse(MOBILE),
    },
  ],
});
