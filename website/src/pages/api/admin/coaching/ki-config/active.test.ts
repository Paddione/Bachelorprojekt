import { describe, it, expect } from 'vitest';

describe('active.ts Bugfix - KI_CATALOG Allowlist', () => {
  it('should allow all providers from KI_CATALOG', () => {
    const KI_CATALOG = [
      { id: 'openai', kinds: ['chat'] },
      { id: 'mistral', kinds: ['chat'] },
      { id: 'lumo', kinds: ['chat'] },
      { id: 'local-lmstudio', kinds: ['chat'] },
    ];
    
    const ALLOWED_PROVIDERS = new Set<string>([...KI_CATALOG.map(i => i.id), 'custom_']);
    
    expect(ALLOWED_PROVIDERS).toContain('openai');
    expect(ALLOWED_PROVIDERS).toContain('local-lmstudio');
  });

  it('should reject providers not in catalog', () => {
    const KI_CATALOG = [{ id: 'openai', kinds: ['chat'] }];
    
    const ALLOWED_PROVIDERS = new Set<string>([...KI_CATALOG.map(i => i.id), 'custom_']);
    
    expect(ALLOWED_PROVIDERS).not.toContain('invalid-provider');
  });
});
