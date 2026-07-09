import { type Page, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface TierEntry {
  id: string;
  label_de: string;
  emoji: string;
  meaning_de: string;
  color: string;
}

export interface GuardrailChip {
  id: string;
  name_de: string;
  rule_de: string;
  why_de: string;
}

export interface GoalFlowStep {
  tool: string;
  tool_name_de: string;
  note_de: string;
}

export interface LinkRef {
  label_de: string;
  url: string;
}

export interface Theme {
  id: string;
  label_de: string;
  emoji: string;
  order: number;
  accent: string;
  blurb_de: string;
}

export interface GlossaryEntry {
  term: string;
  def_de: string;
}

export interface Goal {
  id: string;
  title_de: string;
  when_de: string;
  danger: string;
  flow: GoalFlowStep[];
  example_prompt_de: string;
  guardrails: GuardrailChip[];
  related: string[];
  links: LinkRef[];
  theme: string;
  one_liner_de: string;
  aliases_de: string[];
  common: boolean;
  order: number;
  stages: string[];
  concept_de?: string;
  escalate_to_de?: string;
}

export interface Tool {
  id: string;
  name_de: string;
  kind: string;
  kind_de: string;
  summary_de: string;
  what_for_de: string;
  how_to_start_de: string;
  what_could_go_wrong_de: string;
  danger: string;
  guardrails: GuardrailChip[];
  related: string[];
  links: LinkRef[];
  theme: string;
  aliases_de: string[];
  common: boolean;
  order: number;
  stages: string[];
  escalate_to_de?: string;
  init_prompt_de?: string;
  harness?: 'claude' | 'opencode' | 'both';
}

export interface FlowStation {
  id: string;
  label_de: string;
  emoji: string;
  danger: string;
  order: number;
  blurb_de: string;
  goalIds: string[];
  toolIds: string[];
}

export interface TerritoryNode {
  slug: string;
  name: string;
  emoji: string;
  sensitivity: string;
  theme: string | null;
  accent: string;
  relatesTo: string[];
}

export interface TerritoryArea {
  id: string;
  label_de: string;
  order: number;
  nodes: TerritoryNode[];
}

export interface MapData {
  flow: FlowStation[];
  territory: TerritoryArea[];
}

export interface GuideData {
  goals: Goal[];
  tools: Tool[];
  taxonomy: TierEntry[];
  themes: Theme[];
  glossary: GlossaryEntry[];
  map: MapData;
}

export function loadGuideData(): GuideData {
  const jsonPath = path.join(__dirname, '../../../website/src/lib/agent-guide.generated.json');
  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  return {
    goals: raw.goals as Goal[],
    tools: raw.tools as Tool[],
    taxonomy: raw.taxonomy as TierEntry[],
    themes: raw.themes as Theme[],
    glossary: raw.glossary as GlossaryEntry[],
    map: (raw.map ?? { flow: [], territory: [] }) as MapData,
  };
}

/** Clicks a collapsed card's header (by visible title) to expand it; returns the card locator. */
export async function expandCardByTitle(page: Page, title: string) {
  const card = page.locator('.ag-card').filter({ has: page.locator('.ag-name', { hasText: title }) }).first();
  await card.locator('.ag-card-head').click();
  await expect(card.locator('.ag-card-head')).toHaveAttribute('aria-expanded', 'true');
  return card;
}


/** Navigates to the homepage, dismisses cookie consent, opens the PortalSidekick,
 *  and navigates to the Agent-Anleitung view. Returns the `.ag-body` locator. */
export async function openAgentGuide(page: Page) {
  // Pre-set cookie consent so the banner doesn't block the FAB
  await page.addInitScript(() => {
    localStorage.setItem('cookie_consent_v1', 'all');
  });

  await page.goto('/');
  // Wait for Astro/Svelte hydration — networkidle ensures client:load components have hydrated
  await page.waitForLoadState('networkidle');

  const fab = page.locator('button.fab');
  await expect(fab).toBeVisible({ timeout: 30_000 });

  // Click and poll for the drawer to open (guards against rare pre-hydration click)
  await fab.click();
  const skHome = page.locator('.sk-home');
  if (!(await skHome.isVisible())) {
    await fab.click();
  }
  await expect(skHome).toBeVisible({ timeout: 30_000 });

  // The nav row is button.sk-row — role="listitem" on a <button> isn't matched by getByRole in all browsers
  const agentGuideRow = page.locator('button.sk-row').filter({ hasText: 'Agent-Anleitung' });
  await expect(agentGuideRow).toBeVisible({ timeout: 30_000 });
  await agentGuideRow.click();

  const body = page.locator('.ag-body');
  await expect(body).toBeVisible({ timeout: 30_000 });
  return body;
}

/** Ensures the mental-model map is expanded; returns the .ag-map locator. */
export async function ensureMapOpen(page: Page) {
  const toggle = page.locator('.ag-map-toggle');
  if (await toggle.count()) {
    const open = await toggle.getAttribute('aria-expanded');
    if (open !== 'true') await toggle.click();
  }
  const map = page.locator('.ag-map');
  await expect(map).toBeVisible({ timeout: 30_000 });
  return map;
}

/** Injects a fixed-position film banner into the page (removed after next step). */
export async function showFilmBanner(page: Page, text: string) {
  await page.evaluate((t) => {
    const existing = document.getElementById('__ag-film-banner__');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = '__ag-film-banner__';
    el.style.cssText = [
      'position:fixed', 'top:16px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(20,20,20,0.92)', 'color:#f0c040', 'font-size:15px',
      'font-weight:600', 'padding:8px 20px', 'border-radius:6px',
      'z-index:99999', 'letter-spacing:0.3px', 'pointer-events:none',
    ].join(';');
    el.textContent = t;
    document.body.appendChild(el);
  }, text);
}

export async function removeFilmBanner(page: Page) {
  await page.evaluate(() => {
    document.getElementById('__ag-film-banner__')?.remove();
  });
}
