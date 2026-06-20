import { describe, it, expect } from 'vitest';
import { logger, createRequestLogger } from './logger';

describe('logger', () => {
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
});
