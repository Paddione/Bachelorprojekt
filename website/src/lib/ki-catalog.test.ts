import { describe, it, expect } from 'vitest';
import { KI_CATALOG } from './ki-catalog';

describe('KI_CATALOG', () => {
  it('contains at least one entry', () => {
    expect(KI_CATALOG.length).toBeGreaterThan(0);
  });

  it('has a unique id per interface', () => {
    const ids = KI_CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every entry has a non-empty label and at least one kind', () => {
    for (const c of KI_CATALOG) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.kinds.length).toBeGreaterThan(0);
    }
  });

  it('the custom entry permits free-text overrides', () => {
    const custom = KI_CATALOG.find((c) => c.custom);
    expect(custom).toBeDefined();
  });

  it('anthropic exposes claude-sonnet-4-6 as a suggested model', () => {
    const anthropic = KI_CATALOG.find((c) => c.id === 'anthropic');
    expect(anthropic).toBeDefined();
    expect(anthropic?.suggestedModels.some((m) => m.id === 'claude-sonnet-4-6')).toBe(true);
  });
});
