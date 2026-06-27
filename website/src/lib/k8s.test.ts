import { describe, it, expect } from 'vitest';
import { K8sApiError } from './k8s';

describe('K8sApiError', () => {
  it('carries the HTTP status, statusMessage, and body in the message', () => {
    const e = new K8sApiError(404, 'Not Found', 'pod "foo" not found');
    expect(e.status).toBe(404);
    expect(e.name).toBe('K8sApiError');
    expect(e.message).toContain('404');
    expect(e.message).toContain('Not Found');
    expect(e.message).toContain('pod "foo" not found');
  });

  it('tolerates an undefined statusMessage', () => {
    const e = new K8sApiError(500, undefined, 'kaboom');
    expect(e.status).toBe(500);
    expect(e.message).toContain('500');
    expect(e.message).toContain('kaboom');
  });

  it('is an instance of Error', () => {
    expect(new K8sApiError(403, 'Forbidden', '')).toBeInstanceOf(Error);
  });
});
