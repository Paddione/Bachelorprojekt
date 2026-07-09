import type { Goal, Tool, Theme, TierEntry, MapData } from './agentGuide';

export type Axis = 'thema' | 'gefahr' | 'art';
export const MIN_QUERY = 3;

export interface GuideEntry {
  id: string;
  domId: string;            // 'ag-goal-…' | 'ag-tool-…'
  kind: 'goal' | 'tool';
  title_de: string;         // goal.title_de | tool.name_de
  one_liner_de: string;     // goal.one_liner_de | tool.summary_de
  danger: string;
  theme: string;
  art: 'ziel' | 'skill' | 'agent' | 'task';
  artLabel: string;         // 'Ziel' | 'Fertigkeit' | 'Agent' | 'Aufgabe'
  common: boolean;
  order: number;
  aliases_de: string[];
  stages: string[];
  harness?: 'claude' | 'opencode' | 'both';
  haystack: string;         // normalized
  goal?: Goal;
  tool?: Tool;
  related?: Record<string, { label: string; kind: string; danger: string; domId: string }>;
}

export interface Group {
  key: string;
  label_de: string;
  emoji?: string;
  color?: string;
  order: number;
  entries: GuideEntry[];
}

export interface Segment { text: string; mark: boolean; }

const ART_LABEL: Record<string, string> = {
  ziel: 'Ziel', skill: 'Fertigkeit', agent: 'Agent', task: 'Aufgabe',
};
const ART_ORDER = ['ziel', 'skill', 'agent', 'task'];

/** Lowercase + fold German umlauts + strip remaining diacritics. */
export function normalize(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

function goalHaystack(g: Goal): string {
  const parts = [
    g.title_de, g.one_liner_de, g.when_de,
    ...(g.flow ?? []).flatMap(f => [f.tool_name_de, f.note_de]),
    ...(g.guardrails ?? []).flatMap(gr => [gr.name_de, gr.rule_de]),
    ...(g.aliases_de ?? []),
  ];
  return normalize(parts.join('   '));
}

function toolHaystack(t: Tool): string {
  const parts = [
    t.name_de, t.summary_de, t.what_for_de, t.kind_de,
    ...(t.guardrails ?? []).flatMap(gr => [gr.name_de, gr.rule_de]),
    ...(t.aliases_de ?? []),
  ];
  return normalize(parts.join('   '));
}

export function buildEntries(goals: Goal[], tools: Tool[]): GuideEntry[] {
  const goalEntries: GuideEntry[] = goals.map(g => ({
    id: g.id, domId: `ag-goal-${g.id}`, kind: 'goal',
    title_de: g.title_de, one_liner_de: g.one_liner_de,
    danger: g.danger, theme: g.theme,
    art: 'ziel', artLabel: ART_LABEL.ziel,
    common: g.common, order: g.order, aliases_de: g.aliases_de ?? [],
    stages: g.stages ?? [],
    haystack: goalHaystack(g), goal: g,
  }));
  const toolEntries: GuideEntry[] = tools.map(t => {
    const art = (t.kind === 'skill' || t.kind === 'agent' || t.kind === 'task') ? t.kind : 'task';
    return {
      id: t.id, domId: `ag-tool-${t.id}`, kind: 'tool',
      title_de: t.name_de, one_liner_de: t.summary_de,
      danger: t.danger, theme: t.theme,
      art, artLabel: ART_LABEL[art] ?? t.kind_de,
      common: t.common, order: t.order, aliases_de: t.aliases_de ?? [],
      stages: t.stages ?? [],
      harness: t.harness,
      haystack: toolHaystack(t), tool: t,
    };
  });
  return [...goalEntries, ...toolEntries];
}

export function matches(entry: GuideEntry, query: string): boolean {
  const q = normalize(query.trim());
  return q.length > 0 && entry.haystack.includes(q);
}

/** Gate: below MIN_QUERY chars, return everything; otherwise keep matches. */
export function filterEntries(entries: GuideEntry[], query: string): GuideEntry[] {
  if (query.trim().length < MIN_QUERY) return entries;
  return entries.filter(e => matches(e, query));
}

export function groupBy(
  entries: GuideEntry[], axis: Axis, themes: Theme[], taxonomy: TierEntry[],
): Group[] {
  const buckets = new Map<string, GuideEntry[]>();
  const push = (key: string, e: GuideEntry) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  };

  if (axis === 'thema') {
    for (const e of entries) push(e.theme, e);
    return themes
      .filter(t => buckets.has(t.id))
      .map(t => ({ key: t.id, label_de: t.label_de, emoji: t.emoji, color: t.accent, order: t.order, entries: buckets.get(t.id)! }))
      .concat(
        buckets.has('allgemein')
          ? [{ key: 'allgemein', label_de: 'Allgemein', emoji: '•', color: '#888888', order: 999, entries: buckets.get('allgemein')! }]
          : [],
      );
  }

  if (axis === 'gefahr') {
    for (const e of entries) push(e.danger, e);
    return taxonomy
      .filter(t => buckets.has(t.id))
      .map((t, i) => ({ key: t.id, label_de: t.label_de, emoji: t.emoji, color: t.color, order: i, entries: buckets.get(t.id)! }));
  }

  // axis === 'art'
  for (const e of entries) push(e.art, e);
  return ART_ORDER
    .filter(k => buckets.has(k))
    .map((k, i) => ({ key: k, label_de: ART_LABEL[k], order: i, entries: buckets.get(k)! }));
}

/** Common entries first (by .order), then the rest in original order. */
export function sortCommonFirst(entries: GuideEntry[]): GuideEntry[] {
  const common = entries.filter(e => e.common).sort((a, b) => a.order - b.order);
  const rest = entries.filter(e => !e.common);
  return [...common, ...rest];
}

/** Wrap the first match of `query` in a marked segment. Matching is umlaut/diacritic
 *  insensitive: normalize both sides, find the match in normalized space, then map the
 *  start/end back to ORIGINAL character offsets (ä→"ae" changes length, so keep a
 *  normalized-index → original-index table and always cut on whole original chars). */
export function highlight(text: string, query: string): Segment[] {
  const q = normalize(query.trim());
  if (q.length < MIN_QUERY) return [{ text, mark: false }];
  let norm = '';
  const map: number[] = [];                       // map[i] = original index of normalized char i
  for (let oi = 0; oi < text.length; oi++) {
    const n = normalize(text[oi]);
    for (let k = 0; k < n.length; k++) { norm += n[k]; map.push(oi); }
  }
  const idx = norm.indexOf(q);
  if (idx === -1) return [{ text, mark: false }];
  const startOrig = map[idx];
  const endOrig = map[idx + q.length - 1] + 1;    // include the whole last original char
  return [
    { text: text.slice(0, startOrig), mark: false },
    { text: text.slice(startOrig, endOrig), mark: true },
    { text: text.slice(endOrig), mark: false },
  ].filter(s => s.text.length > 0);
}

export type MapFilter = { kind: 'flow' | 'node'; id: string } | null;

/** Resolve a map selection to the set of entry ids it permits, or null = no restriction. */
export function mapFilterIds(filter: MapFilter, map: MapData): Set<string> | null {
  if (!filter) return null;
  if (filter.kind === 'flow') {
    const s = map.flow.find(f => f.id === filter.id);
    return new Set([...(s?.goalIds ?? []), ...(s?.toolIds ?? [])]);
  }
  const node = map.territory.flatMap(a => a.nodes).find(n => n.slug === filter.id);
  return new Set(node?.relatesTo ?? []);
}

export interface GlossSegment { text: string; term?: string; }

/** Split `text` into segments, marking the first whole-word occurrence of each glossary
 *  term (longest term first). Whole-word = bounded by non-word chars; case-insensitive. */
export function splitGlossaryTerms(text: string, terms: string[]): GlossSegment[] {
  const wanted = [...terms].filter(Boolean).sort((a, b) => b.length - a.length);
  const used = new Set<string>();
  let segs: GlossSegment[] = [{ text }];
  for (const term of wanted) {
    const next: GlossSegment[] = [];
    for (const seg of segs) {
      if (seg.term || used.has(term)) { next.push(seg); continue; }
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=[^\\p{L}\\p{N}]|$)`, 'iu');
      const m = re.exec(seg.text);
      if (!m) { next.push(seg); continue; }
      const start = m.index + m[1].length;
      const end = start + m[2].length;
      if (seg.text.slice(0, start)) next.push({ text: seg.text.slice(0, start) });
      next.push({ text: seg.text.slice(start, end), term });
      if (seg.text.slice(end)) next.push({ text: seg.text.slice(end) });
      used.add(term);
    }
    segs = next;
  }
  return segs.length ? segs : [{ text }];
}
