#!/usr/bin/env node
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import routes from '../../tests/e2e/lib/public-routes.json' with { type: 'json' };

const bases = {
  mentolder: process.env.HG_MENTOLDER_URL || 'https://web.mentolder.de',
  korczewski: process.env.HG_KORCZEWSKI_URL || 'https://web.korczewski.de',
};
const output = process.argv[2];
if (!output) throw new Error('usage: runtime-browser-audit.mjs <output.json>');
const runs = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const [brand, paths] of Object.entries(routes)) {
    for (const route of paths) {
      const page = await browser.newPage();
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(new URL(route, bases[brand]).href, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      runs.push({ brand, route, violations: result.violations.map(({ id, impact }) => ({ id, impact })) });
      await page.close();
    }
  }
  await fs.writeFile(output, JSON.stringify({ runs }));
} finally {
  await browser.close();
}
