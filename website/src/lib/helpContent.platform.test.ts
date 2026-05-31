import { describe, expect, it } from 'vitest';
import { helpContent } from './helpContent';
import { components } from './agentGuide';

describe('helpContent.admin.platform', () => {
  it('exists with a non-empty title and description', () => {
    const p = helpContent.admin.platform;
    expect(p).toBeTruthy();
    expect(p.title).toBe('Plattform Hub');
    expect(p.description.length).toBeGreaterThan(0);
  });

  it('has NON-EMPTY actions (the §5.2 fallback guarantee — fixes the blank drawer)', () => {
    const p = helpContent.admin.platform;
    expect(p.actions.length).toBeGreaterThan(0);
    expect(p.actions.length).toBeLessThanOrEqual(8);
  });

  it('derives each action from a real component (emoji + name + summary)', () => {
    const p = helpContent.admin.platform;
    const names = Object.values(components).map(c => c.name);
    for (const action of p.actions) {
      expect(names.some(n => action.includes(n)),
        `action "${action}" must contain a known component name`).toBe(true);
    }
  });

  it('ships exactly one hand-authored guide pointing at the Agent-Anleitung view', () => {
    const p = helpContent.admin.platform;
    expect(p.guides.length).toBe(1);
    expect(p.guides[0].steps.join(' ')).toContain('Agent-Anleitung');
  });
});
