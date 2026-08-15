import { describe, expect, it } from 'vitest';
import { goals, tools, taxonomy, themes, guideMap, glossary } from './agentGuide';
import {
  MIN_QUERY, normalize, buildEntries, matches, filterEntries,
  groupBy, sortCommonFirst, highlight, mapFilterIds, splitGlossaryTerms,
} from './agentGuideSearch';

const ALL = buildEntries(goals, tools);

describe('normalize', () => {
  it('lowercases and folds umlauts so "Ändern" === "aendern"', () => {
    expect(normalize('Ändern')).toBe('aendern');
    expect(normalize('aendern')).toBe('aendern');
    expect(normalize('Ö Ü ß')).toBe('oe ue ss');
  });
  it('strips other diacritics too', () => {
    expect(normalize('café')).toBe('cafe');
  });
});

describe('buildEntries', () => {
  it('produces one entry per goal + tool with a precomputed haystack', () => {
    expect(ALL.length).toBe(goals.length + tools.length);
    for (const e of ALL) {
      expect(e.haystack).toBe(e.haystack.toLowerCase());
      expect(e.domId.startsWith('ag-goal-') || e.domId.startsWith('ag-tool-')).toBe(true);
    }
  });
  it('goal entries use one_liner_de, tool entries use summary_de', () => {
    const goalE = ALL.find(e => e.kind === 'goal')!;
    const toolE = ALL.find(e => e.kind === 'tool')!;
    expect(goalE.one_liner_de).toBeTruthy();
    expect(toolE.one_liner_de).toBeTruthy();
  });
  it('setzt harness nur auf Tool-Entries, laesst es bei Goals undefined', () => {
    const goalE = ALL.find(e => e.kind === 'goal')!;
    const toolE = ALL.find(e => e.id === 'dev-flow-plan')!;
    expect(goalE.harness).toBeUndefined();
    expect(toolE.harness).toBe('claude');
  });
});

describe('matches / filterEntries', () => {
  it('does not filter below MIN_QUERY chars', () => {
    expect(MIN_QUERY).toBe(3);
    expect(filterEntries(ALL, 'da').length).toBe(ALL.length);
    expect(filterEntries(ALL, '').length).toBe(ALL.length);
  });
  it('"daten" matches the Datenbank cards', () => {
    const res = filterEntries(ALL, 'daten');
    expect(res.length).toBeGreaterThanOrEqual(2);
    expect(res.some(e => e.id === 'datenbank-aendern')).toBe(true);
    expect(res.some(e => e.id === 'agent-db')).toBe(true);
  });
  it('umlaut query "aendern" finds the website-text goal (title has "ändern")', () => {
    const res = filterEntries(ALL, 'aendern');
    expect(res.some(e => e.id === 'website-text-aendern')).toBe(true);
  });
  it('alias "passwort" finds the security goal via aliases_de', () => {
    const res = filterEntries(ALL, 'passwort');
    expect(res.some(e => e.id === 'secret-aendern')).toBe(true);
  });
  it('matches() is a pure haystack includes (case/diacritic-insensitive)', () => {
    const sec = ALL.find(e => e.id === 'secret-aendern')!;
    expect(matches(sec, 'PASSWORT')).toBe(true);
    expect(matches(sec, 'zzz-nope')).toBe(false);
  });
});

describe('groupBy', () => {
  it('thema: groups by theme, ordered by themes[].order, with theme meta', () => {
    const groups = groupBy(ALL, 'thema', themes, taxonomy);
    expect(groups.map(g => g.key)).toEqual(themes.map(t => t.id));
    const website = groups.find(g => g.key === 'website')!;
    expect(website.label_de).toBe('Website');
    expect(website.emoji).toBe('🌐');
    expect(website.entries.length).toBe(2);
  });
  it('gefahr: groups by danger in taxonomy order with tier meta', () => {
    const groups = groupBy(ALL, 'gefahr', themes, taxonomy);
    expect(groups.map(g => g.key)).toEqual(['safe', 'caution', 'assisted', 'forbidden']);
    expect(groups.find(g => g.key === 'forbidden')!.color).toMatch(/^#/);
  });
  it('art: groups into Ziel/Fertigkeit/Agent/Aufgabe', () => {
    const groups = groupBy(ALL, 'art', themes, taxonomy);
    expect(groups.map(g => g.key)).toEqual(['ziel', 'skill', 'agent', 'task']);
    expect(groups.find(g => g.key === 'ziel')!.entries.length).toBe(goals.length);
  });
  it('drops empty groups', () => {
    const onlyWebsite = ALL.filter(e => e.theme === 'website');
    const groups = groupBy(onlyWebsite, 'thema', themes, taxonomy);
    expect(groups.length).toBe(1);
    expect(groups[0].key).toBe('website');
  });
});

describe('sortCommonFirst', () => {
  it('puts common entries first, ordered by .order', () => {
    const sorted = sortCommonFirst(ALL);
    const firstCommon = sorted.filter(e => e.common);
    expect(firstCommon.length).toBeGreaterThanOrEqual(4);
    expect(sorted.slice(0, firstCommon.length).every(e => e.common)).toBe(true);
    const orders = firstCommon.map(e => e.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('highlight', () => {
  it('wraps the first raw case-insensitive match', () => {
    expect(highlight('Datenbank ändern', 'daten')).toEqual([
      { text: 'Daten', mark: true },
      { text: 'bank ändern', mark: false },
    ]);
  });
  it('wraps umlaut-normalized matches, mapping back to original characters', () => {
    expect(highlight('Text ändern', 'aendern')).toEqual([
      { text: 'Text ', mark: false },
      { text: 'ändern', mark: true },
    ]);
  });
  it('returns a single unmarked segment below MIN_QUERY or on no match', () => {
    expect(highlight('Hallo', 'ha')).toEqual([{ text: 'Hallo', mark: false }]);
    expect(highlight('Hallo', 'xyz')).toEqual([{ text: 'Hallo', mark: false }]);
  });
});

describe('buildEntries: stages', () => {
  it('carries the stages array onto each entry', () => {
    const e = ALL.find(x => x.id === 'bug-beheben')!;
    expect(Array.isArray(e.stages)).toBe(true);
    expect(e.stages).toContain('plan');
  });
});

describe('mapFilterIds', () => {
  it('returns null for a null filter (no restriction)', () => {
    expect(mapFilterIds(null, guideMap)).toBeNull();
  });
  it('flow filter → the station goalIds+toolIds set', () => {
    const ids = mapFilterIds({ kind: 'flow', id: 'plan' }, guideMap)!;
    const plan = guideMap.flow.find(s => s.id === 'plan')!;
    expect(ids.has(plan.goalIds[0] ?? plan.toolIds[0])).toBe(true);
    expect(ids.has('dienst-status-pruefen')).toBe(false); // live station, not plan
  });
  it('node filter → the territory node relatesTo set', () => {
    const node = guideMap.territory.flatMap(a => a.nodes).find(n => n.relatesTo.length > 0)!;
    const ids = mapFilterIds({ kind: 'node', id: node.slug }, guideMap)!;
    expect(ids.has(node.relatesTo[0])).toBe(true);
  });
  it('unknown id → empty set (filters everything out, never throws)', () => {
    expect(mapFilterIds({ kind: 'flow', id: 'nope' }, guideMap)!.size).toBe(0);
  });
});

describe('splitGlossaryTerms', () => {
  const terms = glossary.map(g => g.term); // includes 'PR', 'CI', 'Deploy', …
  it('splits a known whole-word term into a marked segment', () => {
    const segs = splitGlossaryTerms('Öffne einen PR und warte auf CI.', terms);
    expect(segs.some(s => s.term === 'PR')).toBe(true);
    expect(segs.some(s => s.term === 'CI')).toBe(true);
    expect(segs.map(s => s.text).join('')).toBe('Öffne einen PR und warte auf CI.');
  });
  it('does not match inside a larger word', () => {
    const segs = splitGlossaryTerms('Preisliste', ['PR']);
    expect(segs.every(s => !s.term)).toBe(true);
    expect(segs.map(s => s.text).join('')).toBe('Preisliste');
  });
  it('returns one plain segment when there are no terms', () => {
    expect(splitGlossaryTerms('nichts hier', [])).toEqual([{ text: 'nichts hier' }]);
  });
});
