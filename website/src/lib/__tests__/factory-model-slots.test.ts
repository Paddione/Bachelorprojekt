import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readAllSlots, writeSlot, isPhase } from '../factory-model-slots';

const mockQuery = vi.fn();
vi.mock('../db-pool', () => ({
  pool: {
    query: (...args: unknown[]) => mockQuery(...args),
  },
}));

describe('factory-model-slots', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('isPhase', () => {
    it('accepts valid phases', () => {
      expect(isPhase('scout')).toBe(true);
      expect(isPhase('plan')).toBe(true);
      expect(isPhase('implement')).toBe(true);
      expect(isPhase('verify')).toBe(true);
      expect(isPhase('deploy')).toBe(true);
    });

    it('rejects invalid phases', () => {
      expect(isPhase('design')).toBe(false);
      expect(isPhase('invalid')).toBe(false);
      expect(isPhase(null)).toBe(false);
    });
  });

  describe('readAllSlots', () => {
    it('maps rows to ModelSlot[] (snake -> camel)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { phase: 'implement', provider: 'lmstudio', model_id: 'qwen3-14b@q4_k_m', base_url: 'http://127.0.0.1:1234/v1' }
        ]
      });
      const result = await readAllSlots();
      expect(result).toEqual([
        { phase: 'implement', provider: 'lmstudio', modelId: 'qwen3-14b@q4_k_m', baseUrl: 'http://127.0.0.1:1234/v1' }
      ]);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT phase, provider, model_id, base_url FROM tickets.factory_model_slots'));
    });
  });

  describe('writeSlot', () => {
    it('issues ON CONFLICT (phase) upsert', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await writeSlot('implement', 'lmstudio', 'qwen3-14b@q4_k_m', 'http://127.0.0.1:1234/v1', 'admin');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (phase) DO UPDATE'),
        ['implement', 'lmstudio', 'qwen3-14b@q4_k_m', 'http://127.0.0.1:1234/v1', 'admin']
      );
    });
  });
});
