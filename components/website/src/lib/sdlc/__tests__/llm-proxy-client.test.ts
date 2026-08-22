import { describe, it, expect } from 'vitest';
import { classifyProxyError } from '../llm-proxy-client';

describe('llm-proxy-client: classifyProxyError', () => {
  it('klassifiziert DNS- und Verbindungsfehler als unreachable', () => {
    const dnsErr = new Error('getaddrinfo ENOTFOUND llm-proxy-host');
    const res = classifyProxyError(dnsErr);
    expect(res.kind).toBe('unreachable');
    expect(res.message).toContain('ENOTFOUND');
    expect(res.address).toBeTruthy();
  });

  it('klassifiziert ECONNREFUSED als unreachable', () => {
    const connErr = new Error('connect ECONNREFUSED 127.0.0.1:18235');
    const res = classifyProxyError(connErr);
    expect(res.kind).toBe('unreachable');
    expect(res.message).toContain('ECONNREFUSED');
  });

  it('klassifiziert AbortSignal-Timeout als unreachable', () => {
    const abortErr = new DOMException('The operation was aborted due to timeout', 'AbortError');
    const res = classifyProxyError(abortErr);
    expect(res.kind).toBe('unreachable');
    expect(res.message).toContain('aborted');
  });

  it('klassifiziert HTTP 401 und 403 als unauthorized', () => {
    const res401 = classifyProxyError(new Error('Unauthorized'), 401);
    expect(res401.kind).toBe('unauthorized');

    const res403 = classifyProxyError(new Error('Forbidden'), 403);
    expect(res403.kind).toBe('unauthorized');
  });

  it('klassifiziert HTTP 500 und 502 als error', () => {
    const res500 = classifyProxyError(new Error('Internal Server Error'), 500);
    expect(res500.kind).toBe('error');
    expect(res500.message).toBe('Internal Server Error');
  });
});
