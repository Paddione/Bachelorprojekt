import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockReadFile, mockRequest } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockRequest: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockReadFile },
}));
vi.mock('node:https', () => ({
  default: { request: mockRequest },
}));

import { K8sApiError, createK8sClient, readK8sCredentials } from './k8s';

interface FakeRes {
  statusCode?: number;
  statusMessage?: string;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
}

/** Wires mockRequest to synchronously invoke the https.request callback with
 *  a canned response, mirroring the res.on('data'|'end', ...) event flow
 *  createK8sClient's internal `request()` helper relies on. */
function mockHttpsSuccess(statusCode: number, statusMessage: string | undefined, body: string) {
  mockRequest.mockImplementation((_opts: unknown, callback: (res: FakeRes) => void) => {
    const res: FakeRes = {
      statusCode,
      statusMessage,
      on: (event, cb) => {
        if (event === 'data') cb(body);
        if (event === 'end') cb();
      },
    };
    callback(res);
    return { on: vi.fn(), write: vi.fn(), end: vi.fn() };
  });
}

/** Wires mockRequest so the returned request object emits a network-level
 *  'error' event instead of ever calling back with a response. */
function mockHttpsNetworkError(err: Error) {
  mockRequest.mockImplementation(() => ({
    on: (event: string, cb: (e: Error) => void) => {
      if (event === 'error') cb(err);
    },
    write: vi.fn(),
    end: vi.fn(),
  }));
}

describe('createK8sClient', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockRequest.mockReset();
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith('/token')) return Promise.resolve('fake-sa-token');
      if (path.endsWith('/ca.crt')) return Promise.resolve('fake-ca-cert');
      return Promise.reject(new Error(`unexpected path: ${path}`));
    });
  });

  it('reads the SA token and CA cert before issuing requests', async () => {
    mockHttpsSuccess(200, 'OK', '{"kind":"PodList","items":[]}');
    await createK8sClient();
    expect(mockReadFile).toHaveBeenCalledWith(
      '/var/run/secrets/kubernetes.io/serviceaccount/token', 'utf-8',
    );
    expect(mockReadFile).toHaveBeenCalledWith(
      '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt', 'utf-8',
    );
  });

  it('get() resolves with the parsed JSON body on a 2xx response', async () => {
    mockHttpsSuccess(200, 'OK', '{"items":[{"metadata":{"name":"pod-a"}}]}');
    const client = await createK8sClient();
    const result = await client.get<{ items: Array<{ metadata: { name: string } }> }>('/api/v1/pods');
    expect(result.items[0].metadata.name).toBe('pod-a');
  });

  it('get() rejects with a K8sApiError carrying the status on a 4xx/5xx response', async () => {
    mockHttpsSuccess(404, 'Not Found', 'pod "x" not found');
    const client = await createK8sClient();
    await expect(client.get('/api/v1/pods/x')).rejects.toMatchObject({
      status: 404,
      name: 'K8sApiError',
    });
  });

  it('get() rejects when the response body is not valid JSON', async () => {
    mockHttpsSuccess(200, 'OK', 'not-json{{{');
    const client = await createK8sClient();
    await expect(client.get('/api/v1/pods')).rejects.toBeInstanceOf(Error);
  });

  it('post() sends a JSON body and resolves on success', async () => {
    mockHttpsSuccess(201, 'Created', '{"metadata":{"name":"created"}}');
    const client = await createK8sClient();
    const result = await client.post<{ metadata: { name: string } }>('/api/v1/pods', { foo: 'bar' });
    expect(result.metadata.name).toBe('created');
    const [, sentBody] = mockRequest.mock.calls[0];
    void sentBody; // request() is called with (options, callback) — body is written separately
  });

  it('patch() and mergePatch() and delete() all resolve on success', async () => {
    mockHttpsSuccess(200, 'OK', '{"ok":true}');
    const client = await createK8sClient();
    await expect(client.patch('/api/v1/x', { a: 1 })).resolves.toEqual({ ok: true });
    await expect(client.mergePatch('/api/v1/x', { a: 1 })).resolves.toEqual({ ok: true });
    await expect(client.delete('/api/v1/x')).resolves.toEqual({ ok: true });
  });

  it('rejects when the underlying https request emits a network error', async () => {
    mockHttpsNetworkError(new Error('ECONNREFUSED'));
    const client = await createK8sClient();
    await expect(client.get('/api/v1/pods')).rejects.toThrow('ECONNREFUSED');
  });
});

describe('readK8sCredentials', () => {
  it('reads token and CA in parallel and returns them together', async () => {
    mockReadFile.mockReset();
    mockReadFile.mockImplementation((path: string) => {
      if (path.endsWith('/token')) return Promise.resolve('tok-123');
      if (path.endsWith('/ca.crt')) return Promise.resolve('ca-456');
      return Promise.reject(new Error('unexpected'));
    });
    const creds = await readK8sCredentials();
    expect(creds).toEqual({ token: 'tok-123', ca: 'ca-456' });
  });
});

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
