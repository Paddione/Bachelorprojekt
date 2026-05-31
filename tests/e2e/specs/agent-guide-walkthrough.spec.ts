/**
 * Agent-Anleitung E2E — dual-mode spec
 *
 * CI mode (default):   headless, data-driven, one test() per goal/section.
 * Film mode (AG_FILM=1): headed, slowMo, video recording, step banners.
 *
 * No login required — PortalSidekick is on the public Layout.astro.
 */
import { test, expect } from '@playwright/test';
import {
  openAgentGuide,
  loadGuideData,
  showFilmBanner,
  removeFilmBanner,
} from '../lib/agent-guide';

const FILM = !!process.env.AG_FILM;
const FILM_PAUSE = 1500; // ms between steps in film mode
const { goals, tools, taxonomy } = loadGuideData();

// ─── Shared: navigation opens the view ──────────────────────────────────────

test('öffnet die Agent-Anleitung und zeigt den Titel', async ({ page }) => {
  await openAgentGuide(page);
  await expect(page.locator('.sk-title')).toContainText('Agent-Anleitung');
});

// ─── Tier legend ─────────────────────────────────────────────────────────────

test('Tier-Legende zeigt alle 4 Gefahrenstufen', async ({ page }) => {
  await openAgentGuide(page);
  const items = page.locator('.ag-legend .ag-legend-item');
  await expect(items).toHaveCount(taxonomy.length);
  for (const tier of taxonomy) {
    await expect(page.locator('.ag-legend')).toContainText(tier.emoji);
    await expect(page.locator('.ag-legend')).toContainText(tier.label_de);
  }
});

// ─── Per-goal assertions ──────────────────────────────────────────────────────

if (!FILM) {
  // CI: one parametrized test per goal
  for (const goal of goals) {
    const tierEntry = taxonomy.find(t => t.id === goal.danger);

    test(`Ziel: ${goal.title_de}`, async ({ page }) => {
      await openAgentGuide(page);

      // Find this goal's card by title
      const card = page.locator('.ag-cards').first().locator('.ag-card').filter({
        has: page.locator('.ag-name', { hasText: goal.title_de }),
      });
      await expect(card).toBeVisible();

      // Title
      await expect(card.locator('.ag-name')).toHaveText(goal.title_de);

      // Tier badge
      if (tierEntry) {
        await expect(card.locator('.ag-tier')).toContainText(tierEntry.emoji);
        await expect(card.locator('.ag-tier')).toContainText(tierEntry.label_de);
      }

      // Flow steps — each tool_name_de appears in the flow list
      const flowList = card.locator('.ag-flow');
      for (const step of goal.flow) {
        await expect(flowList).toContainText(step.tool_name_de);
      }

      // Example prompt
      await expect(card.locator('.ag-prompt-text')).toHaveText(goal.example_prompt_de);

      // Guardrail chips
      for (const guardrail of goal.guardrails) {
        const chip = card.locator('.ag-chip').filter({
          has: page.locator('summary', { hasText: guardrail.name_de }),
        });
        await expect(chip).toBeVisible();
        // Click to expand and check rule text
        await chip.locator('summary').click();
        await expect(chip.locator('.ag-chip-rule')).toContainText(guardrail.rule_de.substring(0, 30));
      }
    });
  }
} else {
  // Film mode: single continuous test with test.step() per goal
  test('Filmable Walkthrough — alle Ziele', async ({ page }) => {
    await openAgentGuide(page);
    await showFilmBanner(page, 'Agent-Anleitung — Start');
    await page.waitForTimeout(FILM_PAUSE);

    for (let i = 0; i < goals.length; i++) {
      const goal = goals[i];
      const tierEntry = taxonomy.find(t => t.id === goal.danger);

      await test.step(`Schritt ${i + 1}/${goals.length} — ${goal.title_de}`, async () => {
        const card = page.locator('.ag-cards').first().locator('.ag-card').filter({
          has: page.locator('.ag-name', { hasText: goal.title_de }),
        });

        await card.scrollIntoViewIfNeeded();
        await showFilmBanner(page, `Schritt ${i + 1}/${goals.length} — ${goal.title_de}`);
        await page.waitForTimeout(FILM_PAUSE);

        await expect(card.locator('.ag-name')).toHaveText(goal.title_de);
        if (tierEntry) {
          await expect(card.locator('.ag-tier')).toContainText(tierEntry.emoji);
        }
        for (const step of goal.flow) {
          await expect(card.locator('.ag-flow')).toContainText(step.tool_name_de);
        }
        await expect(card.locator('.ag-prompt-text')).toHaveText(goal.example_prompt_de);

        await page.waitForTimeout(FILM_PAUSE / 2);
      });
    }

    await showFilmBanner(page, 'Werkzeuge & Agenten — Überblick');
    const firstTool = page.locator('.ag-cards').nth(1).locator('.ag-card').first();
    await firstTool.scrollIntoViewIfNeeded();
    await page.waitForTimeout(FILM_PAUSE);
    await removeFilmBanner(page);
  });
}

// ─── Tools section ────────────────────────────────────────────────────────────

test('Werkzeuge-Sektion: alle Tool-Karten sind vorhanden', async ({ page }) => {
  await openAgentGuide(page);
  const toolsSection = page.locator('.ag-cards').nth(1);
  await expect(toolsSection.locator('.ag-card')).toHaveCount(tools.length);
  for (const tool of tools) {
    const card = page.locator(`#ag-tool-${tool.id}`);
    await expect(card).toBeAttached();
    await expect(card.locator('.ag-name')).toHaveText(tool.name_de);
    await expect(card.locator('.ag-kind')).toHaveText(tool.kind_de);
  }
});

test('Werkzeug-Detail-Akkordeon öffnet und zeigt what_for_de', async ({ page }) => {
  await openAgentGuide(page);
  const tool = tools[0];
  const card = page.locator(`#ag-tool-${tool.id}`);
  await card.scrollIntoViewIfNeeded();
  const detail = card.locator('.ag-detail');
  await detail.locator('summary').click();
  await expect(detail).toContainText(tool.what_for_de.substring(0, 40));
});

test('Tool-Cross-Link scrollt zur Ziel-Karte', async ({ page }) => {
  await openAgentGuide(page);
  // Find first tool with related links
  const toolWithRelated = tools.find(t => t.related.length > 0);
  if (!toolWithRelated) test.skip();

  const card = page.locator(`#ag-tool-${toolWithRelated!.id}`);
  await card.scrollIntoViewIfNeeded();

  const relId = toolWithRelated!.related[0];
  const chip = card.locator('.ag-related-chip').first();
  await expect(chip).toBeVisible();
  await chip.click();

  // Target should scroll into viewport
  const target = page.locator(`#ag-tool-${relId}`);
  await expect(target).toBeInViewport({ timeout: 3_000 });
});

// ─── Copy button (chromium only, needs clipboard permission) ─────────────────

test('Prompt-Kopieren-Button wechselt zu "Kopiert ✓"', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openAgentGuide(page);

  const firstGoal = goals[0];
  const card = page.locator('.ag-cards').first().locator('.ag-card').first();
  await card.scrollIntoViewIfNeeded();

  const copyBtn = card.locator('.ag-copy');
  await expect(copyBtn).toHaveText('Diesen Prompt kopieren');
  await copyBtn.click();
  await expect(copyBtn).toHaveText('Kopiert ✓', { timeout: 2_000 });

  // Verify clipboard content
  const clipText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipText).toBe(firstGoal.example_prompt_de);
});
