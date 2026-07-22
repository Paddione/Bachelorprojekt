import { describe, it, expect, vi, beforeEach } from 'vitest';

const query = vi.fn();
vi.mock('./website-db', () => ({ pool: { query: (...a: unknown[]) => query(...a) } }));

import { createBackend, deleteBackend, LLM_PROXY_KINDS, LLM_PROXY_FIXUPS } from './llm-proxy-db';

beforeEach(() => query.mockReset());

describe('llm-proxy-db CRUD-Whitelist', () => {
  it('kind-Enum enthält genau die drei erlaubten Werte', () => {
    expect([...LLM_PROXY_KINDS].sort()).toEqual(['llamacpp', 'lmstudio', 'openai-remote']);
  });

  it('createBackend lehnt unbekannten kind ab (kein DB-Write)', async () => {
    await expect(createBackend({
      name: 'x', kind: 'evil-kind' as never, base_url: 'http://127.0.0.1:9/v1',
      api_key_env: null, enabled: true, priority: 5, fixups: [], model_aliases: {},
    })).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });

  it('createBackend lehnt unbekannten Fixup ab', async () => {
    await expect(createBackend({
      name: 'x', kind: 'llamacpp', base_url: 'http://127.0.0.1:8093/v1',
      api_key_env: null, enabled: true, priority: 1, fixups: ['nope-fixup'] as never, model_aliases: {},
    })).rejects.toThrow();
  });

  it('createBackend persistiert api_key_env, niemals api_key (Klartext)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 7 }] });
    await createBackend({
      name: 'deepseek', kind: 'openai-remote', base_url: 'https://api.deepseek.com/v1',
      api_key_env: 'DEEPSEEK_API_KEY', enabled: true, priority: 90,
      fixups: [], model_aliases: {},
    });
    const sql = query.mock.calls[0][0] as string;
    expect(sql).toMatch(/api_key_env/);
    expect(sql).not.toMatch(/\bapi_key\b(?!_env)/);
  });

  it('deleteBackend schützt das letzte enabled lokale Backend', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '0' }] }); // 0 weitere enabled lokale Backends
    await expect(deleteBackend(1)).rejects.toThrow(/letzt|last/i);
    // Count-Query schließt die zu löschende id aus
    expect(query.mock.calls[0][1]).toContain(1);
  });

  it('deleteBackend erlaubt Löschen, wenn ein weiteres lokales Backend enabled bleibt', async () => {
    query.mockResolvedValueOnce({ rows: [{ n: '1' }] }); // 1 weiteres bleibt
    query.mockResolvedValueOnce({ rowCount: 1 });
    await expect(deleteBackend(2)).resolves.toBe(true);
  });
});
