import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// mentolder-web-smoke (Staffel B, D4): reduzierte GUI-Abdeckung für die
// React-SPA auf `react.mentolder.de` (live, öffentlich, kein Auth).
// Kernrouten aus App.tsx — kein /leistungen/:slug, kein /admin, kein Catch-all.
// Das Kontaktformular wird nur gerendert, nie abgesendet (read-only).
const BASE = 'https://react.mentolder.de';

const ROUTES = ['/', '/leistungen', '/kontakt', '/impressum', '/barrierefreiheit'];

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

test.describe('mentolder-web-smoke: Kernrouten rendern + axe', { tag: ['@website', '@smoke'] }, () => {
  for (const path of ROUTES) {
    test(`${path} rendert 200 ohne Platzhalter/Overflow`, async ({ page }) => {
      test.setTimeout(30_000);
      const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${path} HTTP-Status`).toBe(200);

      const bodyText = await page.evaluate(() => document.body.innerText);
      const bad = [...new Set([...bodyText.matchAll(/\b(undefined|NaN|\[object Object\])\b/g)].map((m) => m[0]))];
      expect(bad, 'Platzhalter-Texte im Inhalt').toEqual([]);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, 'horizontaler Overflow (Desktop)').toBeLessThanOrEqual(0);
    });

    test(`axe: ${path} hat 0 critical/serious`, async ({ page }) => {
      test.setTimeout(30_000);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter((v) => SERIOUS.has(v.impact ?? '')) as AxeViolationSummary[];
      const summary = blocking.map((v) => `${v.id} (${v.impact}) x${v.nodes.length}`).join('\n');
      expect(blocking.length, `${summary}\n\n${describeViolations(blocking)}`).toBe(0);
    });
  }
});
