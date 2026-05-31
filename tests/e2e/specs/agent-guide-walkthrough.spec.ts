/**
 * Agent-Anleitung E2E — dual-mode spec (grouped/collapsible/searchable UI).
 * CI mode (default): headless assertions.  Film mode (AG_FILM=1): headed walkthrough.
 * No login required — PortalSidekick is on the public Layout.astro.
 */
import { test, expect } from '@playwright/test';
import { openAgentGuide, expandCardByTitle, loadGuideData, showFilmBanner, removeFilmBanner } from '../lib/agent-guide';

const FILM = !!process.env.AG_FILM;
const FILM_PAUSE = 1500;
const { goals, tools, taxonomy, themes, glossary } = loadGuideData();

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
