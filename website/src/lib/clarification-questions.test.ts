import { describe, it, expect } from 'vitest';
import { deriveSections, buildCommentBody } from './clarification-questions';
import type { OfficeItem } from './planning-office';

function item(partial: Partial<OfficeItem>): OfficeItem {
  return {
    extId: 'T000571', title: 'X', valueProp: null, priority: 'mittel',
    effort: null, areas: [], dependsOn: [], rank: null,
    readiness: {}, dorScore: 0, isNextCandidate: false, pinned: false,
    createdAt: '', updatedAt: '', ...partial,
  };
}

describe('deriveSections', () => {
  it('returns no sections when all DoR flags are true', () => {
    const sections = deriveSections(item({
      readiness: { spec_skizziert: true, offene_fragen_geklaert: true, abhaengigkeiten_klar: true, aufwand_geschaetzt: true },
    }));
    expect(sections).toEqual([]);
  });

  it('adds a dependency section with two fields when abhaengigkeiten_klar is false', () => {
    const sections = deriveSections(item({ readiness: { abhaengigkeiten_klar: false } }));
    const dep = sections.find((s) => s.dorFlag === 'abhaengigkeiten_klar');
    expect(dep).toBeTruthy();
    expect(dep!.fields).toHaveLength(2);
    expect(dep!.fields[0].type).toBe('text');
    expect(dep!.fields[1].type).toBe('radio');
  });

  it('adds a spec section with two textarea fields when spec_skizziert is false', () => {
    const sections = deriveSections(item({ readiness: { spec_skizziert: false } }));
    const spec = sections.find((s) => s.dorFlag === 'spec_skizziert');
    expect(spec!.fields).toHaveLength(2);
    expect(spec!.fields.every((f) => f.type === 'text')).toBe(true);
  });

  it('adds one open-questions section per area when offene_fragen_geklaert is false', () => {
    const sections = deriveSections(item({
      readiness: { offene_fragen_geklaert: false },
      areas: ['brett', 'website'],
    }));
    const open = sections.filter((s) => s.dorFlag === 'offene_fragen_geklaert');
    expect(open).toHaveLength(2);
    expect(open[0].title).toContain('brett');
  });

  it('falls back to a generic open-questions section when no areas are set', () => {
    const sections = deriveSections(item({ readiness: { offene_fragen_geklaert: false }, areas: [] }));
    const open = sections.filter((s) => s.dorFlag === 'offene_fragen_geklaert');
    expect(open).toHaveLength(1);
    expect(open[0].fields.length).toBeGreaterThan(0);
  });

  it('adds an effort radio when aufwand_geschaetzt is false', () => {
    const sections = deriveSections(item({ readiness: { aufwand_geschaetzt: false } }));
    const eff = sections.find((s) => s.dorFlag === 'aufwand_geschaetzt');
    expect(eff!.fields).toHaveLength(1);
    expect(eff!.fields[0].type).toBe('radio');
    expect(eff!.fields[0].options).toEqual(['klein', 'mittel', 'gross']);
  });

  it('treats undefined flags as not-ready (shows the section)', () => {
    const sections = deriveSections(item({ readiness: {} }));
    expect(sections.length).toBeGreaterThan(0);
  });
});

describe('buildCommentBody', () => {
  it('renders a markdown table from answers using field labels', () => {
    const body = buildCommentBody(
      { abhaengigkeiten: 'T000573', externe_abh: 'keine', brett_rollen: ['leiter', 'teilnehmer'] },
      { abhaengigkeiten: 'Welche Tickets müssen vorher fertig sein?', externe_abh: 'Externe Dienste nötig?', brett_rollen: 'Betroffene Rollen?' },
      '2026-06-10',
    );
    expect(body).toContain('## Klärungsrunde 2026-06-10');
    expect(body).toContain('| Welche Tickets müssen vorher fertig sein? | T000573 |');
    expect(body).toContain('| Betroffene Rollen? | leiter, teilnehmer |');
  });

  it('skips empty answers', () => {
    const body = buildCommentBody({ a: '', b: [] as string[], c: 'x' }, { a: 'A?', b: 'B?', c: 'C?' }, '2026-06-10');
    expect(body).not.toContain('A?');
    expect(body).not.toContain('B?');
    expect(body).toContain('| C? | x |');
  });
});
