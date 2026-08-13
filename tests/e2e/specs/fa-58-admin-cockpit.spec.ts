// tests/e2e/specs/fa-58-admin-cockpit.spec.ts
// FA-58: Admin-Menü, SDLC Cockpit & Git-Flows (Factory-Pipeline).
// Verifiziert gegen die Live-Umgebung (WEBSITE_URL):
//   - Admin-Sidebar: Kern-Navigation, Werkstatt-Akkordeon, aktive Zustände,
//     externer Systembrett-Link, Sidebar-Collapse.
//   - SDLC Cockpit (/admin/cockpit): Header, Panels, Pipeline-Tabs,
//     Route-Aliase (/admin/pipeline, /admin/tickets), Auth-Gating.
//   - Git-Flows: Factory-Floor (Stationen, QS-Abnahme, Versand), Planung,
//     Analytics, Steuerung, Parallel sowie /admin/repohealth.
// Läuft im `mentolder`-Projekt (admin-authentifiziert, storageState).
// Hinweis: Die K3-Layout-Engine verschiebt Panels zur Laufzeit zwischen Rail
// und Workspace — Assertions prüfen deshalb Titel/Buttons pro Panel, nicht die
// statische Rail/Card-Zuordnung aus cockpit.astro.
import { test, expect } from '@playwright/test';

const BASE = (process.env.WEBSITE_URL ?? 'https://web.mentolder.de').replace(/\/$/, '');

const NAV_LINKS: Array<[string, string]> = [
  ['Dashboard', '/admin'],
  ['Cockpit', '/admin/cockpit'],
  ['Postfach', '/admin/inbox'],
  ['Klienten', '/admin/clients'],
  ['Sessions', '/admin/coaching/sessions'],
  ['Fakturierung', '/admin/rechnungen'],
  ['Repo Health', '/admin/repohealth'],
  ['Einstellungen', '/admin/einstellungen/benachrichtigungen'],
];

const WERKSTATT_ITEMS: Array<[string, string]> = [
  ['Content Hub', '/admin/inhalte'],
  ['Wissensbasis', '/admin/wissen'],
  ['Assets', '/admin/assets'],
  ['3D Generator', '/admin/asset-generation'],
  ['App-Katalog', '/admin/app-catalog'],
  ['KI-Konfig.', '/admin/ki-konfiguration'],
  ['Prompts', '/admin/prompts'],
  ['Systemtest', '/admin/systemtest/board'],
  ['Content-DB', '/admin/content-db'],
];

const COCKPIT_PANEL_TITLES = [
  'Tickets',
  'Agents',
  'CI/CD',
  'Factory',
  'Modelle',
  'Audit-Log',
  'Alle Tickets',
  'Agenten im Detail',
  'Factory-Log (Strom)',
  'Audit-Log (Strom)',
  'Terminal',
];

const PIPELINE_TABS = ['Floor', 'Planung', 'Analytics', 'Kosten', 'Steuerung', 'Abhängigkeiten', 'Parallel'];

test.describe('FA-58: Admin-Menü & SDLC Cockpit', { tag: ['@admin', '@factory'] }, () => {
  // Live-Server unter 4 Workern: großzügiges Timeout statt Default 45s.
  test.describe.configure({ timeout: 120_000 });

  // ── Admin-Menü (Sidebar) ─────────────────────────────────────────
  test('T1: Sidebar rendert alle Kern-Navigationseinträge', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    const nav = page.locator('#admin-sidebar nav');
    await expect(nav).toBeVisible();
    for (const [label, href] of NAV_LINKS) {
      const link = nav.locator(`a[href="${href}"]`);
      await expect(link).toHaveCount(1);
      await expect(link).toContainText(label);
    }
  });

  test('T2: Werkstatt-Akkordeon enthält alle 9 Einträge und toggelt', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    const toggle = page.locator('#werkstatt-toggle');
    const items = page.locator('#werkstatt-items');
    await expect(toggle).toBeVisible();
    // Auf /admin (Dashboard) ist kein Werkstatt-Eintrag aktiv → initial kollabiert.
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    for (const [label, href] of WERKSTATT_ITEMS) {
      await expect(items.locator(`a[href="${href}"]`)).toContainText(label);
    }
    await expect(items.locator('a.sidebar-nav-item')).toHaveCount(WERKSTATT_ITEMS.length);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(items).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(items).not.toBeVisible();
  });

  test('T3: Aktiver Nav-Zustand folgt der Route', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    const nav = page.locator('#admin-sidebar nav');
    await expect(nav.locator('a[href="/admin"]')).toHaveClass(/is-active/);
    await expect(nav.locator('a[href="/admin/cockpit"]')).not.toHaveClass(/is-active/);
    await page.goto(`${BASE}/admin/cockpit`);
    await expect(nav.locator('a[href="/admin/cockpit"]')).toHaveClass(/is-active/);
  });

  test('T4: Systembrett-Link ist extern (brett.mentolder.de, noopener)', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    const link = page.locator('#admin-sidebar nav a[href*="brett.mentolder.de"]');
    await expect(link).toContainText('Systembrett');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('T5: Sidebar-Collapse-Button toggelt die Sidebar', async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    const collapseBtn = page.getByRole('button', { name: /Sidebar einklappen/ });
    await expect(collapseBtn).toBeVisible();
    await collapseBtn.click();
    await expect(page.locator('html')).toHaveClass(/sidebar-collapsed/);
    await page.getByRole('button', { name: /Sidebar ausklappen/ }).click();
    await expect(page.locator('html')).not.toHaveClass(/sidebar-collapsed/);
  });

  // ── SDLC Cockpit ────────────────────────────────────────────────
  test('T6: Cockpit-Header rendert Titel, Brand und Fixtures-Status', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`);
    await expect(page.getByRole('heading', { name: 'SDLC Cockpit' })).toBeVisible();
    await expect(page.locator('.cockpit-header [data-brand="mentolder"]')).toHaveText('mentolder');
    await expect(page.locator('.cockpit-status')).toContainText('Fixtures');
    for (const group of ['Laufende Epics', 'Was Aufmerksamkeit braucht', 'Aktive Agenten', 'Modell-Server']) {
      await expect(page.locator('.cockpit-rail-group', { hasText: group })).toBeVisible();
    }
  });

  test('T7: Alle Cockpit-Panel-Titel rendern (Rail- und Card-Panels)', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`);
    const layout = page.locator('.cockpit-layout');
    await expect(layout).toBeVisible();
    // K3-Layout-Engine verschiebt Panels zur Laufzeit; Titel werden dabei kurz
    // versteckt/neu angehängt. Exakter Titel + DOM-Präsenz statt Sichtbarkeit.
    const exact = (title: string) =>
      new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    for (const title of COCKPIT_PANEL_TITLES) {
      await expect(
        layout.locator('.panel__title', { hasText: exact(title) }).first(),
      ).toHaveCount(1, { timeout: 30_000 });
    }
  });

  test('T8: Cockpit-Panels haben Refresh- und Vollbild-Aktionen', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`);
    const layout = page.locator('.cockpit-layout');
    // Status-Panels bieten eine Aktualisieren-/Neu-laden-Aktion.
    const refreshCount = await layout.locator('button', { hasText: /Aktualisieren|Neu laden/ }).count();
    expect(refreshCount).toBeGreaterThanOrEqual(4);
    // Terminal-Panel hat eine Vollbild-Aktion.
    const terminal = layout.locator('.panel', { hasText: 'Terminal' }).first();
    await expect(terminal.locator('button', { hasText: 'Vollbild' })).toBeVisible();
  });

  test('T9: Pipeline-Panel rendert alle 7 Tabs', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`);
    const panel = page.locator('#panel-pipeline');
    await expect(panel).toBeVisible();
    for (const label of PIPELINE_TABS) {
      await expect(panel.locator('.tabs__tab', { hasText: label })).toBeVisible();
    }
  });

  test('T10: Tab-Wechsel aktualisiert URL (?tab=planung) ohne Reload', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`, { waitUntil: 'domcontentloaded' });
    // Auf Hydration warten: aktiver Tab zeigt den SSR-Initialwert.
    await expect(page.locator('.tabs__tab--active')).toContainText('Floor');
    await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
    await expect(page).toHaveURL(/tab=planung/);
    await expect(page.locator('.tabs__tab--active')).toContainText('Planung');
  });

  test('T11: /sdlc/cockpit rendert das SDLC Cockpit (Pipeline-Slot)', async ({ page }) => {
    await page.goto(`${BASE}/sdlc/cockpit`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'SDLC Cockpit' })).toBeVisible();
    await expect(page.locator('#panel-pipeline')).toBeVisible();
  });

  test('T12: /admin/tickets rendert das SDLC Cockpit (Route-Alias)', async ({ page }) => {
    await page.goto(`${BASE}/admin/tickets`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'SDLC Cockpit' })).toBeVisible();
    await expect(page.locator('#panel-pipeline')).toBeVisible();
  });

  test('T13: Planung-Tab ist über die Tab-Leiste erreichbar (client-seitig)', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.tabs__tab--active')).toContainText('Floor');
    await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
    await expect(page).toHaveURL(/tab=planung/);
    await expect(page.locator('[data-testid="pb-root"]')).toBeVisible({ timeout: 30_000 });
  });

  test('T20: /admin/cockpit erfordert Authentifizierung', async ({ playwright }) => {
    const unauth = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const res = await unauth.get(`${BASE}/admin/cockpit`, { maxRedirects: 0 });
      expect([302, 401, 403]).toContain(res.status());
    } finally {
      await unauth.dispose();
    }
  });

  // ── Git-Flows / Factory-Pipeline ────────────────────────────────
  test('T14: Floor-Tab zeigt Stationen, QS-Abnahme, Versand und Live-Statistiken', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit?tab=factory`);
    for (const stat of ['Kill-Switch', 'Slots', 'Daily-Cap']) {
      await expect(page.locator('body')).toContainText(stat);
    }
    for (const heading of ['Kommissionierung', 'Laderampe', 'QS-Abnahme', 'Versand']) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
    const stationCount = await page.getByText(/Station frei/i).count();
    expect(stationCount).toBeGreaterThanOrEqual(2);
  });

  test('T15: Planung-Tab rendert das Planungsbüro mit Stats-Bar', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit`, { waitUntil: 'domcontentloaded' });
    await page.locator('.tabs__tab', { hasText: 'Planung' }).click();
    await expect(page).toHaveURL(/tab=planung/);
    await expect(page.locator('[data-testid="pb-root"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-testid="pb-stats-bar"]')).toBeVisible();
    await expect(page.getByText(/planning|ready|blocked/i)).toBeVisible();
  });

  test('T16: Analytics-Tab rendert Fenster-Filter, KPI-Grid und Charts', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit?tab=analytics`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.analytics-tab-wrap')).toBeVisible();
    await expect(page.locator('.kpi-grid').first()).toBeVisible();
  });

  test('T17: Steuerung-Tab rendert Control-Panel und Modell-Slots', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit?tab=control`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.control-panel')).toBeVisible();
  });

  test('T18: Parallel-Tab rendert Parallel-Status (Gang-Tickets, Slots belegt)', async ({ page }) => {
    await page.goto(`${BASE}/admin/cockpit?tab=parallel`, { waitUntil: 'domcontentloaded' });
    const panel = page.locator('.parallel-tab-wrap');
    await expect(panel).toBeVisible();
    await expect(page.locator('.parallel-stat__label', { hasText: 'Gang-Tickets' })).toBeVisible();
    await expect(page.locator('.parallel-stat__label', { hasText: 'Slots belegt' })).toBeVisible();
    await expect(page.locator('button', { hasText: /Force next tick/ })).toBeVisible();
  });

  test('T19: /admin/repohealth rendert das Repo-Health-Dashboard', async ({ page }) => {
    await page.goto(`${BASE}/admin/repohealth`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Repo Health Dashboard' })).toBeVisible();
    await expect(page.locator('.goal-name').first()).toBeVisible();
  });
});
