import data from './agent-guide.generated.json';

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

interface GlossaryEntry {
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
}

interface Component {
  slug: string;
  kind: string;
  name: string;
  emoji: string;
  summary_de: string;
  sensitivity: string;
  url: string;
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

interface TerritoryNode {
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

export const taxonomy: TierEntry[] = data.taxonomy as TierEntry[];
export const themes: Theme[] = (data.themes ?? []) as Theme[];
export const glossary: GlossaryEntry[] = (data.glossary ?? []) as GlossaryEntry[];
export const goals: Goal[] = data.goals as Goal[];
export const tools: Tool[] = data.tools as Tool[];
export const components: Record<string, Component> = data.components as unknown as Record<string, Component>;
export const guideMap: MapData = (data.map ?? { flow: [], territory: [] }) as MapData;

/** Single resolver over taxonomy[]; the conveniences below are derived from it. */
export function tierFor(id: string): { emoji: string; label: string; color: string; meaning: string } | undefined {
  const t = taxonomy.find(x => x.id === id);
  if (!t) return undefined;
  return { emoji: t.emoji, label: t.label_de, color: t.color, meaning: t.meaning_de };
}

export function tierColor(id: string): string {
  return tierFor(id)?.color ?? '#888888';
}

export function tierEmoji(id: string): string {
  return tierFor(id)?.emoji ?? '⚪';
}

export function tierLabel(id: string): string {
  return tierFor(id)?.label ?? id;
}

export function componentBySlug(slug: string): Component | undefined {
  return components[slug];
}

interface LegendRow {
  id: string;
  emoji: string;
  label: string;
  meaning: string;
  color: string;
}

/**
 * The danger-tier legend, derived from the taxonomy, that makes the map's
 * colour/emoji coding comprehensible (🟢 sicher / 🟡 Vorsicht / 🟠 heikel /
 * 🔴 kritisch). Used by GuideMap's visible, collapsible legend and its
 * screen-reader text. Returns one row per tier, in taxonomy order.
 */
export function tierLegend(): LegendRow[] {
  return taxonomy.map((t) => ({
    id: t.id,
    emoji: t.emoji,
    // The label_de already embeds the emoji (e.g. "🟢 Sicher"); strip a leading
    // emoji + space so the row reads "<dot emoji> <plain label>" without a dupe.
    label: t.label_de.replace(/^\s*\p{Extended_Pictographic}️?\s*/u, '').trim() || t.label_de,
    meaning: t.meaning_de,
    color: t.color,
  }));
}

