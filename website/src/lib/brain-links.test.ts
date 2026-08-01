import { describe, it, expect } from 'vitest';
import { slugForSource, isIngestedSource, candidateHrefs, labelForSource } from './brain-links';

describe('slugForSource — Regel aus brain-ingest-worklist.sh', () => {
  it('die drei belegten Slug-Paare aus Task 1', () => {
    expect(slugForSource('openspec/specs/sdlc-cockpit.md')).toBe('openspec-specs-sdlc-cockpit');
    expect(slugForSource('CLAUDE.md')).toBe('claude');
    expect(slugForSource('docs/superpowers/references/gotchas-footguns.md')).toBe(
      'docs-superpowers-references-gotchas-footguns'
    );
  });

  it('fuehrender Punkt wird abgeschnitten (Unterstrich-Pfad)', () => {
    expect(slugForSource('.claude/lib/goals.md')).toBe('claude-lib-goals');
  });

  it('Unterstriche und Schraegstriche werden zu Bindestrichen', () => {
    expect(slugForSource('openspec/changes/some_thing.md')).toBe('openspec-changes-some-thing');
  });
});

describe('isIngestedSource — Grenze aus dem Manifest', () => {
  it('ssot-specs und core-docs sind ingestiert', () => {
    expect(isIngestedSource('openspec/specs/sdlc-cockpit.md')).toBe(true);
    expect(isIngestedSource('CLAUDE.md')).toBe(true);
    expect(isIngestedSource('.claude/lib/goals.md')).toBe(true);
  });

  it('weggeprunte Baeume liefern keinen Link', () => {
    expect(isIngestedSource('website/src/pages/index.astro')).toBe(false);
    expect(isIngestedSource('k3d/network-policies.yaml')).toBe(false);
    expect(isIngestedSource('scripts/brain-ingest.sh')).toBe(false);
    expect(isIngestedSource('tests/spec/sdlc-cockpit/k5-epic-canvas.bats')).toBe(false);
  });

  it('einzelnes Pfadsegment-Matching (docs/agent-guide/maps/* nicht erfasst)', () => {
    expect(isIngestedSource('docs/agent-guide/maps/agents-map.md')).toBe(false);
  });
});

describe('candidateHrefs — beide URL-Kandidaten in fester Reihenfolge', () => {
  it('liefert /<slug> zuerst, dann /wiki/<slug>', () => {
    expect(candidateHrefs('claude')).toEqual(['/claude', '/wiki/claude']);
  });
});

describe('labelForSource — Anzeigetext', () => {
  it('Dateiname ohne Endung', () => {
    expect(labelForSource('openspec/specs/sdlc-cockpit.md')).toBe('sdlc-cockpit');
    expect(labelForSource('CLAUDE.md')).toBe('CLAUDE');
  });
});
