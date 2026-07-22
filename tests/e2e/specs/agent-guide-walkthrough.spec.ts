/**
 * Agent-Anleitung E2E — dual-mode spec (grouped/collapsible/searchable UI).
 * CI mode (default): headless assertions.  Film mode (AG_FILM=1): headed walkthrough.
 * No login required — PortalSidekick is on the public Layout.astro.
 */
import { test, expect } from '@playwright/test';
import { openAgentGuide, expandCardByTitle, loadGuideData, ensureMapOpen, showFilmBanner, removeFilmBanner } from '../lib/agent-guide';

const FILM = !!process.env.AG_FILM;
const FILM_PAUSE = 1500;
const ADMIN_PASS = process.env.E2E_ADMIN_PASS;
const { goals, tools, taxonomy, themes, glossary, map } = loadGuideData();

test.beforeEach(() => {
  test.skip(!ADMIN_PASS, 'E2E_ADMIN_PASS not set — PortalSidekick only on authenticated layouts');
});

test('öffnet die Agent-Anleitung und zeigt den Titel', async ({ page }) => {
  await openAgentGuide(page);
  await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung');
});

test('zeigt alle 7 Themen-Gruppen, Karten standardmäßig eingeklappt', async ({ page }) => {
  await openAgentGuide(page);
  await expect(page.locator('.ag-group')).toHaveCount(themes.length);
  // Exactly one card head per goal + tool (the Häufig shelf renders chips, not cards).
  const heads = page.locator('.ag-card-head');
  await expect(heads).toHaveCount(goals.length + tools.length);
  for (let i = 0; i < 5; i++) {
    await expect(heads.nth(i)).toHaveAttribute('aria-expanded', 'false');
  }
});

test('eine Karte lässt sich aus- und wieder einklappen', async ({ page }) => {
  await openAgentGuide(page);
  const card = await expandCardByTitle(page, goals[0].title_de);
  await expect(card.locator('.ag-prompt-text')).toBeVisible();
  await card.locator('.ag-card-head').click();
  await expect(card.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'false');
});

test('Suche ab 3 Zeichen filtert, öffnet Treffer und zeigt einen Zähler', async ({ page }) => {
  await openAgentGuide(page);
  const input = page.locator('.ag-search-input');
  await input.fill('daten');
  // Datenbank cards visible, count shown
  await expect(page.locator('.ag-search-count')).toContainText('Treffer');
  await expect(page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: 'Datenbank' }) }).first()).toBeVisible();
  await expect(page.locator('.ag-hl').first()).toBeVisible();   // highlight present
});

test('Umlaut-Suche: "aendern" findet die Website-Text-Karte', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-search-input').fill('aendern');
  await expect(page.locator('.ag-name', { hasText: 'ändern' }).first()).toBeVisible();
});

test('Alias-Suche: "passwort" findet die Sicherheits-Karte', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-search-input').fill('passwort');
  await expect(page.locator('.ag-name', { hasText: 'Passwort' }).first()).toBeVisible();
});

test('Achsen-Umschalter auf "Gefahr" zeigt Tier-Gruppen', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-axis-btn', { hasText: 'Gefahr' }).click();
  // group headers now carry tier labels
  await expect(page.locator('.ag-group-label', { hasText: 'Niemals allein' })).toBeVisible();
});

test('Tier-Filter auf 🔴 zeigt nur Forbidden-Karten', async ({ page }) => {
  await openAgentGuide(page);
  const forbiddenTier = taxonomy.find(t => t.id === 'forbidden')!;
  await page.locator('.ag-tier-toggle', { hasText: forbiddenTier.label_de }).click();
  // Expand the first forbidden goal and assert the red-stop panel
  const forbiddenGoal = goals.find(g => g.danger === 'forbidden')!;
  const card = await expandCardByTitle(page, forbiddenGoal.title_de);
  await expect(card.locator('.ag-redstop')).toBeVisible();
  await expect(card.locator('.ag-redstop-who')).toContainText('Patrick');
  await expect(card.locator('.ag-copy')).toContainText('Rücksprache');
});

test('Cross-Link: Flow-Schritt springt zur Werkzeug-Karte und öffnet sie', async ({ page }) => {
  await openAgentGuide(page);
  // bug-beheben → first flow step is dev-flow-plan
  const goal = goals.find(g => g.id === 'bug-beheben')!;
  const card = await expandCardByTitle(page, goal.title_de);
  await card.locator('.ag-flow-jump').first().click();
  const target = page.locator('#ag-tool-' + goal.flow[0].tool);
  await expect(target).toBeInViewport({ timeout: 3_000 });
  await expect(target.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'true');
});

test('Begriffe-Glossar lässt sich öffnen und ist durchsuchbar', async ({ page }) => {
  await openAgentGuide(page);
  await page.locator('.ag-group-head', { hasText: 'Begriffe kurz erklärt' }).click();
  await expect(page.locator('.ag-glossary-row').first()).toBeVisible();
  await expect(page.locator('.ag-glossary-row')).toHaveCount(glossary.length);
});

test('Prompt-Kopieren-Button wechselt zu "Kopiert ✓"', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAgentGuide(page);
  const card = await expandCardByTitle(page, goals[0].title_de);
  const copyBtn = card.locator('.ag-copy');
  await copyBtn.click();
  await expect(copyBtn).toHaveText('Kopiert ✓', { timeout: 2_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(goals[0].example_prompt_de);
});

test('Schnellstart-Shelf kopiert den Init-Prompt eines Skills', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAgentGuide(page);
  const sp = tools.find(t => t.id === 'superpowers')!;
  const chip = page.locator('.ag-quickstart-chip').filter({ hasText: sp.name_de });
  await chip.click();
  await expect(chip.locator('.ag-quickstart-action')).toHaveText('Kopiert ✓', { timeout: 2_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sp.init_prompt_de);
});

test('Harness-Badge: opencode-Tool zeigt Badge, both-Tool nicht', async ({ page }) => {
  await openAgentGuide(page);
  const oc = tools.find(t => t.id === 'opencode-flow-plan')!;
  const both = tools.find(t => t.id === 'agent-website')!;
  const ocCard = page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: oc.name_de }) }).first();
  await expect(ocCard.locator('.ag-harness-badge')).toHaveText('opencode');
  const bothCard = page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: both.name_de }) }).first();
  await expect(bothCard.locator('.ag-harness-badge')).toHaveCount(0);
});

test('Harness-Filter auf "opencode" versteckt Claude-Tools, laesst Ziele + both', async ({ page }) => {
  await openAgentGuide(page);
  const claudeTool = tools.find(t => t.id === 'dev-flow-plan')!;
  const ocTool = tools.find(t => t.id === 'opencode-flow-plan')!;
  const bothTool = tools.find(t => t.id === 'agent-website')!;
  await page.locator('.ag-harness-toggle', { hasText: 'opencode' }).click();
  await expect(page.locator('.ag-name', { hasText: claudeTool.name_de })).toHaveCount(0);
  await expect(page.locator('.ag-name', { hasText: ocTool.name_de }).first()).toBeVisible();
  await expect(page.locator('.ag-name', { hasText: bothTool.name_de }).first()).toBeVisible();
  // mindestens eine Ziel-Karte bleibt sichtbar
  await expect(page.locator('.ag-name', { hasText: goals[0].title_de }).first()).toBeVisible();
});

test('Init-Prompt-Label: opencode-Skill zeigt "In opencode einfügen"', async ({ page }) => {
  await openAgentGuide(page);
  const oc = tools.find(t => t.id === 'opencode-flow-plan')!;
  const card = await expandCardByTitle(page, oc.name_de);
  await expect(card.locator('.ag-prompt-init')).toContainText('In opencode einfügen');
  await expect(card.locator('.ag-prompt-init')).not.toContainText('In Claude Code einfügen');
});

test('Init-Prompt-Label: Claude-Skill behaelt "In Claude Code einfügen"', async ({ page }) => {
  await openAgentGuide(page);
  const cl = tools.find(t => t.id === 'dev-flow-plan')!;
  const card = await expandCardByTitle(page, cl.name_de);
  await expect(card.locator('.ag-prompt-init')).toContainText('In Claude Code einfügen');
});

test('Init-Prompt-Label: both-Tool zeigt harness-neutrales "Prompt einfügen"', async ({ page }) => {
  await openAgentGuide(page);
  const both = tools.find(t => t.id === 'agent-website')!;
  const card = await expandCardByTitle(page, both.name_de);
  await expect(card.locator('.ag-prompt-init')).toContainText('Prompt einfügen');
});

if (FILM) {
  test('Filmable Walkthrough — gruppiert, suchen, Stopp-Karte', async ({ page }) => {
    await openAgentGuide(page);
    await showFilmBanner(page, 'Agent-Anleitung — 7 Themengruppen');
    await page.waitForTimeout(FILM_PAUSE);

    await showFilmBanner(page, 'Eine Karte ausklappen');
    await expandCardByTitle(page, goals[0].title_de);
    await page.waitForTimeout(FILM_PAUSE);

    await showFilmBanner(page, 'Suchen: „daten"');
    await page.locator('.ag-search-input').fill('daten');
    await page.waitForTimeout(FILM_PAUSE);
    await page.locator('.ag-search-input').fill('');

    await showFilmBanner(page, 'Umschalten auf „Gefahr"');
    await page.locator('.ag-axis-btn', { hasText: 'Gefahr' }).click();
    await page.waitForTimeout(FILM_PAUSE);

    await showFilmBanner(page, 'Rote Stopp-Karte');
    const forbiddenGoal = goals.find(g => g.danger === 'forbidden')!;
    const card = await expandCardByTitle(page, forbiddenGoal.title_de);
    await card.locator('.ag-redstop').scrollIntoViewIfNeeded();
    await page.waitForTimeout(FILM_PAUSE);
    await removeFilmBanner(page);
  });
}

test('Mental-Model-Karte zeigt Fluss-Band und Gebietskarte', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  await expect(page.locator('.ag-flow-station')).toHaveCount(map.flow.length);
  await expect(page.locator('.ag-terr-node').first()).toBeVisible();
});

test('Klick auf eine Fluss-Station filtert den Katalog', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  const plan = map.flow.find(s => s.id === 'plan')!;
  await page.locator('.ag-flow-station', { hasText: plan.label_de }).click();
  await expect(page.locator('.ag-mapfilter-chip')).toBeVisible();
  // a known plan goal card is present, an unrelated live goal is not
  await expect(page.locator('.ag-name', { hasText: 'Fehler beheben' })).toBeVisible();
  await expect(page.locator('.ag-name', { hasText: 'Dienste laufen' })).toHaveCount(0);
});

test('Klick auf einen Baustein filtert auf seine verknüpften Karten', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  const node = map.territory.flatMap(a => a.nodes).find(n => n.relatesTo.length > 0)!;
  await page.locator('.ag-terr-node', { hasText: node.name }).first().click();
  await expect(page.locator('.ag-mapfilter-chip')).toBeVisible();
  await expect(page.locator('.ag-card-head')).toHaveCount(node.relatesTo.length);
});

test('Konzept-Zeile + Glossar-Tooltip auf einer Ziel-Karte', async ({ page }) => {
  await openAgentGuide(page);
  const conceptGoal = goals.find(g => g.concept_de)!;
  const card = await expandCardByTitle(page, conceptGoal.title_de);
  await expect(card.locator('.ag-concept')).toBeVisible();
  const gloss = card.locator('.ag-gloss').first();
  if (await gloss.count()) {
    await gloss.click();
    await expect(card.locator('.ag-gloss-pop').first()).toBeVisible();
  }
});

test('Karte einklappen bleibt nach Reload erhalten', async ({ page }) => {
  await openAgentGuide(page);
  await ensureMapOpen(page);
  await page.locator('.ag-map-toggle').click();                    // collapse
  await expect(page.locator('.ag-map')).toHaveCount(0);
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  // re-open drawer + guide after reload, then assert the map stayed collapsed
  await openAgentGuide(page);
  await expect(page.locator('.ag-map-toggle')).toHaveAttribute('aria-expanded', 'false');
});
