import { defineConfig } from '@playwright/test';
import type { Project } from '@playwright/test';
import baseConfig from './playwright.config';

// WEBSITE_URL drives both the baseURL the sweep navigates and the login host
// the *-setup projects authenticate against. Mirror playwright.film.config.ts:4.
const websiteURL = process.env.WEBSITE_URL || 'http://localhost:4321';

// Per-brand base URLs [T012781]. Solange nur EIN Brand je Lauf gesweept wurde,
// genuegte WEBSITE_URL fuer alle vier Projects. Das Vision-Ziel faehrt beide
// Brands in EINEM Aufruf (drei Worker, drei Modell-Slots) — dann zeigte
// WEBSITE_URL die korczewski-Projects auf den mentolder-Host.
//
// Die Aufteilung spiegelt die, die es bei den Auth-Setups laengst gibt:
// mentolder-auth-setup.spec.ts liest WEBSITE_URL, korczewski-auth-setup.spec.ts
// liest KORCZEWSKI_URL. Hier gilt dieselbe Zuordnung, damit Sweep und Login
// desselben Brands garantiert denselben Host treffen.
const BRAND_URLS = {
  mentolder:  websiteURL,
  korczewski: process.env.KORCZEWSKI_URL || 'https://web.korczewski.de',
} as const;

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

const sweepUse = (
  viewport: { width: number; height: number },
  brand: keyof typeof BRAND_URLS,
) => ({
  viewport,
  baseURL: BRAND_URLS[brand],
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
  // Drei Worker, hart gedeckelt [T012781]. Geerbt wuerde hier baseConfig.workers
  // stehen — aus PLAYWRIGHT_WORKERS mit Vorgabe 4. Vier Worker hiessen bei
  // aktiver Vision-Stufe vier gleichzeitige Anfragen und damit eine mehr, als
  // das Modell Slots hat.
  //
  // Die Zahl ist gemessen, nicht gewaehlt: scripts/llm/measurements/
  // 2026-08-19-gemma12-slots.md misst fuer gemma12-vision bei '-np 3 -kvu'
  // 307-489 tok/s gesamt gegen 255 bei einem Slot; '-np 4' faellt auf 319
  // zurueck, '-np 6' laedt gar nicht erst.
  //
  // Jeder Worker ist ein eigener Prozess, jedes Project ist seriell
  // (visual-sweep.spec.ts: mode 'serial'), jede Route wartet ihren Vision-Aufruf
  // ab. Daraus folgt die Obergrenze direkt: gleichzeitige Anfragen <= Worker = 3.
  // Vier Projects auf drei Workern ist Absicht — drei laufen, das vierte rueckt
  // nach; die Grenze haengt an der Worker-Zahl, nicht an der Project-Zahl.
  workers: 3,
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
      use: sweepUse(DESKTOP, 'mentolder'),
    },
    {
      name: 'visual-sweep-mentolder-mobile',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['mentolder-setup'],
      use: sweepUse(MOBILE, 'mentolder'),
    },
    {
      name: 'visual-sweep-korczewski-desktop',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['korczewski-setup'],
      use: sweepUse(DESKTOP, 'korczewski'),
    },
    {
      name: 'visual-sweep-korczewski-mobile',
      testMatch: ['**/visual-sweep.spec.ts'],
      dependencies: ['korczewski-setup'],
      use: sweepUse(MOBILE, 'korczewski'),
    },
  ],
});
