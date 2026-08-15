import { describe, it, expect, vi, beforeEach } from 'vitest';

const persistError = vi.fn();
vi.mock('./logging/error-log-store', () => ({
  persistError: (...a: unknown[]) => persistError(...a),
}));

import { logger, createRequestLogger } from './logger';

describe('logger', () => {
  beforeEach(() => {
    persistError.mockReset();
  });

  it('root logger carries the website service base field', () => {
    expect(logger.bindings()).toMatchObject({ service: 'website' });
  });

  it('createRequestLogger attaches request context as child bindings', () => {
    const child = createRequestLogger({ requestId: 'req-abc', method: 'POST', path: '/api/x' });
    expect(child.bindings()).toMatchObject({
      service: 'website',
      requestId: 'req-abc',
      method: 'POST',
      path: '/api/x',
    });
  });

  it('should persist error lines via error-log-store', async () => {
    await new Promise((resolve) => {
      logger.error({ foo: 1 }, 'test error message');
      setTimeout(resolve, 50);
    });

    expect(persistError).toHaveBeenCalled();
  });

  it('should not persist info lines', async () => {
    await new Promise((resolve) => {
      logger.info('this is an info message');
      setTimeout(resolve, 50);
    });

    expect(persistError).not.toHaveBeenCalled();
  });
});
