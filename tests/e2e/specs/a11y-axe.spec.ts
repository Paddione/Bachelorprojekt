import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Brand-Erkennung env-basiert (S3: keine Domain-Literale im Code).
const PROD_DOMAIN = process.env.PROD_DOMAIN ?? 'mentolder.de';
const isKore = PROD_DOMAIN === 'korczewski.de';

// Kern-Routen je Marke (Override per A11Y_ROUTES=kommagetrennt für Iterationen).
const DEFAULT_ROUTES = isKore ? ['/'] : ['/', '/ueber-mich', '/kontakt', '/coaching'];
const CORE_ROUTES = process.env.A11Y_ROUTES
  ? process.env.A11Y_ROUTES.split(',').map((r) => r.trim()).filter(Boolean)
  : DEFAULT_ROUTES;

const SERIOUS = new Set(['critical', 'serious']);

interface AxeNodeSummary {
  target: string[];
  failureSummary: string;
  html: string;
}

interface AxeViolationSummary {
  id: string;
  impact?: string | null;
  help: string;
  helpUrl: string;
  nodes: AxeNodeSummary[];
}

function describeViolations(violations: AxeViolationSummary[]): string {
  return violations
    .map((v) => {
      const lines = [
        `· ${v.id} (${v.impact ?? 'unknown'}) — ${v.help}`,
        `  ${v.helpUrl}`,
        ...v.nodes.map((n) => `  - ${n.target.join(' ')} :: ${n.failureSummary.replace(/\n/g, ' | ')}`),
      ];
      return lines.join('\n');
    })
    .join('\n');
}

for (const route of CORE_ROUTES) {
  test(`a11y: ${PROD_DOMAIN} ${route} hat 0 critical/serious`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? '')) as AxeViolationSummary[];
    const summary = blocking.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join('\n');
    expect(blocking.length, `${summary}\n\n${describeViolations(blocking)}`).toBe(0);
  });
}
