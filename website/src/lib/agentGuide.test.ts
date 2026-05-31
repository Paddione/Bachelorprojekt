import { describe, expect, it } from 'vitest';
import {
  goals, tools, taxonomy, components,
  tierFor, tierColor, tierEmoji, tierLabel, componentBySlug,
} from './agentGuide';

describe('agentGuide typed re-export', () => {
  it('exposes goals/tools/taxonomy/components from the generated JSON', () => {
    expect(Array.isArray(goals)).toBe(true);
    expect(Array.isArray(tools)).toBe(true);
    expect(Array.isArray(taxonomy)).toBe(true);
    expect(taxonomy.length).toBe(4);
    expect(typeof components).toBe('object');
    expect(Array.isArray(components)).toBe(false); // keyed by slug, not a list
  });

  it('tierFor resolves a taxonomy id to {emoji,label,color,meaning}', () => {
    const t = tierFor('safe');
    expect(t).toBeTruthy();
    expect(t!.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(t!.emoji).toBeTruthy();
    expect(t!.label).toBeTruthy();
    expect(t!.meaning).toBeTruthy();
  });

  it('every danger id referenced by a goal or tool exists in taxonomy (no dangling ids)', () => {
    const referenced = new Set<string>([
      ...goals.map(g => g.danger),
      ...tools.map(t => t.danger),
    ]);
    const tierIds = new Set(taxonomy.map(t => t.id));
    for (const id of referenced) {
      // Membership check — NOT a hex check — so a dangling id cannot hide
      // behind the tierColor('#888888') fallback.
      expect(tierIds.has(id), `tier "${id}" must exist in taxonomy`).toBe(true);
      expect(tierColor(id), `tierColor(${id})`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tierEmoji(id), `tierEmoji(${id})`).toBeTruthy();
      expect(tierLabel(id), `tierLabel(${id})`).toBeTruthy();
    }
  });

  it('componentBySlug returns the component for a known slug and undefined otherwise', () => {
    const someSlug = Object.keys(components)[0];
    expect(componentBySlug(someSlug)?.slug).toBe(someSlug);
    expect(componentBySlug('definitely-not-a-real-slug')).toBeUndefined();
  });
});
