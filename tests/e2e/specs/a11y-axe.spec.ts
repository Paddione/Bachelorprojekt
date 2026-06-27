import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Brand-Erkennung env-basiert (S3: keine Domain-Literale im Code).
const PROD_DOMAIN = process.env.PROD_DOMAIN ?? 'mentolder.de';
const isKore = PROD_DOMAIN === 'korczewski.de';

// Kern-Routen je Marke.
const CORE_ROUTES = isKore
  ? ['/']
  : ['/', '/ueber-mich', '/kontakt', '/coaching'];

const SERIOUS = new Set(['critical', 'serious']);

for (const route of CORE_ROUTES) {
  test(`a11y: ${PROD_DOMAIN} ${route} hat 0 critical/serious`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? ''));
    const summary = blocking.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`);
    expect(blocking, summary.join('\n')).toHaveLength(0);
  });
}
