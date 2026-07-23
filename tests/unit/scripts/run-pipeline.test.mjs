import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('run-pipeline session reuse', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test('session loss triggers fresh spawn fallback', async () => {
    vi.doMock('child_process', () => ({
      spawnSync: vi.fn()
        .mockImplementationOnce(() => {
          const err = new Error('session lost');
          err.code = 'ETIMEDOUT';
          return { error: err, stdout: '', stderr: '' };
        })
        .mockImplementationOnce(() => ({
          error: null,
          stdout: JSON.stringify({ result: 'ok', session_id: 'new-session-123' }),
          stderr: '',
        })),
      execFileSync: vi.fn().mockReturnValue('{}'),
    }));

    const { runClaudeSubagent } = await import('../../../scripts/factory/run-pipeline.mjs');
    const result = runClaudeSubagent('test prompt', 'test-label', 'lost-session-456');
    expect(result).toBeDefined();
    expect(result.sessionId).toBe('new-session-123');
    expect(result.output).toBeDefined();
  });

  test('fresh spawn without sessionId works', async () => {
    vi.doMock('child_process', () => ({
      spawnSync: vi.fn().mockReturnValue({
        error: null,
        stdout: JSON.stringify({ answer: '42' }),
        stderr: '',
      }),
      execFileSync: vi.fn().mockReturnValue('{}'),
    }));

    const { runClaudeSubagent } = await import('../../../scripts/factory/run-pipeline.mjs');
    const result = runClaudeSubagent('test prompt', 'test-label');
    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
  });
});
