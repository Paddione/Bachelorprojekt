#!/usr/bin/env node
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import routes from '../../tests/e2e/lib/public-routes.json' with { type: 'json' };

const bases = {
  korczewski: process.env.HG_KORCZEWSKI_URL || 'https://web.korczewski.de',
  massage: process.env.HG_MASSAGE_URL || 'https://massage.korczewski.de',
};
const output = process.argv[2];
if (!output) throw new Error('usage: runtime-browser-audit.mjs <output.json>');
const runs = [];
const browser = await chromium.launch({ headless: true });
// [T900810] @axe-core/playwright 4.x verweigert analyze() auf Pages, die direkt am
// Browser haengen ("Please use browser.newContext()") — Pages kommen aus einem
// expliziten Context (eine Instanz fuer alle Routen genuegt).
const context = await browser.newContext();
try {
  for (const [brand, paths] of Object.entries(routes)) {
    for (const route of paths) {
      const page = await context.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const resp = await page.goto(new URL(route, bases[brand]).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const status = resp?.status() ?? 0;
      if (status !== 200) {
        // Auth-/Fehler-Wall (z. B. oauth2-proxy 401 auf massage): kein bewertbares
        // Seiten-HTML — als skip mit Grund erfassen statt Wall-Artefakte als
        // Site-Verstoesse zu zaehlen. Basis (brand/route) bleibt erhalten.
        runs.push({ brand, route, status, skipped: `http-${status}`, violations: [] });
      } else {
        const result = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        runs.push({ brand, route, status, violations: result.violations.map(({ id, impact }) => ({ id, impact })) });
      }
      await page.close();
    }
  }
  await fs.writeFile(output, JSON.stringify({ runs }));
} finally {
  await context.close();
  await browser.close();
}
