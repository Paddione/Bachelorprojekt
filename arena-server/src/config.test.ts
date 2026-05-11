import { describe, it, expect } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  it('parses a complete env block', () => {
    const env = {
      PORT: '8090',
      DB_URL: 'postgresql://arena_app:pw@shared-db:5432/website',
      KEYCLOAK_ISSUER_MENTOLDER: 'https://auth.mentolder.de/realms/workspace',
      KEYCLOAK_ISSUER_KORCZEWSKI: 'https://auth.korczewski.de/realms/workspace',
      LOG_LEVEL: 'info',
    };
    const cfg = loadConfig(env);
    expect(cfg.port).toBe(8090);
    expect(cfg.issuers).toHaveLength(2);
  });

  it('throws on missing DB_URL', () => {
    expect(() => loadConfig({ PORT: '8090' } as any)).toThrow(/DB_URL/);
  });
});