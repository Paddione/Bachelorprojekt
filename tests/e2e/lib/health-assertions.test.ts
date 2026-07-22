// tests/e2e/lib/health-assertions.test.ts
//
// Unit tests for the health-assertions library.
// Uses Playwright's built-in test runner with a mock APIRequestContext.

import { test, expect } from '@playwright/test';
import type { APIRequestContext, APIResponse, TestInfo } from '@playwright/test';
import {
  assertReachable,
  assertAuthenticatedReachable,
  assertHealth,
} from './health-assertions';

// ── Mock helpers ───────────────────────────────────────────────────────────

function mockResponse(status: number, body: string = ''): APIResponse {
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    text: async () => body,
    json: async () => JSON.parse(body || '{}'),
    headers: () => ({}),
    url: () => 'https://test.local',
    headersArray: () => [],
    body: async () => Buffer.from(body),
  } as unknown as APIResponse;
}

function mockRequest(handler: (url: string) => APIResponse): APIRequestContext {
  return {
    get: async (url: string) => handler(url),
    post: async () => mockResponse(200),
    put: async () => mockResponse(200),
    delete: async () => mockResponse(200),
    patch: async () => mockResponse(200),
    head: async () => mockResponse(200),
    fetch: async () => mockResponse(200),
    storageState: async () => ({}),
  } as unknown as APIRequestContext;
}

function mockRequestThatThrows(error: Error): APIRequestContext {
  return {
    get: async () => { throw error; },
  } as unknown as APIRequestContext;
}

interface MockTestInfo {
  fixme: (cond: boolean, reason: string) => void;
}

function createMockTestInfo(): { mock: TestInfo; getCalls: () => Array<{ cond: boolean; reason: string }> } {
  const calls: Array<{ cond: boolean; reason: string }> = [];
  const mock = {
    fixme: (cond: boolean, reason: string) => {
      calls.push({ cond, reason });
    }
  } as unknown as TestInfo;
  return {
    mock,
    getCalls: () => calls,
  };
}

// ── assertReachable ────────────────────────────────────────────────────────

test.describe('assertReachable', () => {
  // T002068: Isolate PROD_DOMAIN — Dev-Mode tests must not accidentally run
  // in Prod mode when the env var is set by the runner.
  let savedProdDomain: string | undefined;

  test.beforeEach(() => {
    savedProdDomain = process.env.PROD_DOMAIN;
    delete process.env.PROD_DOMAIN;
  });

  test.afterEach(() => {
    if (savedProdDomain !== undefined) process.env.PROD_DOMAIN = savedProdDomain;
    else delete process.env.PROD_DOMAIN;
  });

  test('200 → returns response', async () => {
    const request = mockRequest(() => mockResponse(200, 'ok'));
    const res = await assertReachable(request, 'https://ok.local');
    expect(res.status()).toBe(200);
  });

  test('acceptableStatuses [200,302] → 302 passes', async () => {
    const request = mockRequest(() => mockResponse(302, ''));
    const res = await assertReachable(request, 'https://redirect.local', {
      acceptableStatuses: [200, 302],
    });
    expect(res.status()).toBe(302);
  });

  test('unexpected status → throws in production', async () => {
    const oldDomain = process.env.PROD_DOMAIN;
    process.env.PROD_DOMAIN = 'example.com';
    try {
      const request = mockRequest(() => mockResponse(503, 'unavailable'));
      await assertReachable(request, 'https://down.local');
      // Should not reach here
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E HEALTH CHECK FAILED [prod]');
      expect(err.message).toContain('unavailable');
    } finally {
      if (oldDomain) process.env.PROD_DOMAIN = oldDomain;
      else delete process.env.PROD_DOMAIN;
    }
  });

  test('allow404AsNotDeployed: 404 → fixme', async () => {
    const request = mockRequest(() => mockResponse(404, ''));
    const { mock: mockTestInfo, getCalls } = createMockTestInfo();
    try {
      await assertReachable(request, 'https://not-deployed.local', {
        allow404AsNotDeployed: true,
      }, mockTestInfo);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('__PLAYWRIGHT_FIXME__');
      const calls = getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].cond).toBe(true);
      expect(calls[0].reason).toContain('service not deployed (404)');
    }
  });

  test('allow404AsNotDeployed: 404 in prod → hard fail', async () => {
    const oldDomain = process.env.PROD_DOMAIN;
    process.env.PROD_DOMAIN = 'example.com';
    try {
      const request = mockRequest(() => mockResponse(404, ''));
      await assertReachable(request, 'https://not-deployed.local', {
        allow404AsNotDeployed: true,
      });
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E HEALTH CHECK FAILED [prod]');
    } finally {
      if (oldDomain) process.env.PROD_DOMAIN = oldDomain;
      else delete process.env.PROD_DOMAIN;
    }
  });

  test('network error → fixme in dev', async () => {
    const request = mockRequestThatThrows(new Error('ECONNREFUSED'));
    const { mock: mockTestInfo, getCalls } = createMockTestInfo();
    try {
      await assertReachable(request, 'https://crash.local', {}, mockTestInfo);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('__PLAYWRIGHT_FIXME__');
      expect(err.message).toContain('ECONNREFUSED');
      const calls = getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].cond).toBe(true);
    }
  });

  test('network error → hard fail in prod', async () => {
    const oldDomain = process.env.PROD_DOMAIN;
    process.env.PROD_DOMAIN = 'example.com';
    try {
      const request = mockRequestThatThrows(new Error('ECONNREFUSED'));
      await assertReachable(request, 'https://crash.local');
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E HEALTH CHECK FAILED [prod]');
    } finally {
      if (oldDomain) process.env.PROD_DOMAIN = oldDomain;
      else delete process.env.PROD_DOMAIN;
    }
  });
});

// ── assertAuthenticatedReachable ────────────────────────────────────────────

test.describe('assertAuthenticatedReachable', () => {
  let savedProdDomain: string | undefined;

  test.beforeEach(() => {
    savedProdDomain = process.env.PROD_DOMAIN;
    delete process.env.PROD_DOMAIN;
  });

  test.afterEach(() => {
    if (savedProdDomain !== undefined) process.env.PROD_DOMAIN = savedProdDomain;
    else delete process.env.PROD_DOMAIN;
  });

  test('without E2E_ADMIN_PASS → fixme/fail', async () => {
    const oldPass = process.env.E2E_ADMIN_PASS;
    delete process.env.E2E_ADMIN_PASS;
    const { mock: mockTestInfo, getCalls } = createMockTestInfo();
    try {
      const request = mockRequest(() => mockResponse(200, 'ok'));
      await assertAuthenticatedReachable(request, 'https://admin.local', {}, mockTestInfo);
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('E2E_ADMIN_PASS not set');
      const calls = getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].cond).toBe(true);
    } finally {
      if (oldPass) process.env.E2E_ADMIN_PASS = oldPass;
    }
  });

  test('with E2E_ADMIN_PASS → calls assertReachable', async () => {
    const oldPass = process.env.E2E_ADMIN_PASS;
    process.env.E2E_ADMIN_PASS = 'test123';
    try {
      const request = mockRequest(() => mockResponse(200, 'ok'));
      const res = await assertAuthenticatedReachable(request, 'https://admin.local');
      expect(res.status()).toBe(200);
    } finally {
      if (oldPass) process.env.E2E_ADMIN_PASS = oldPass;
      else delete process.env.E2E_ADMIN_PASS;
    }
  });
});

// ── assertHealth ────────────────────────────────────────────────────────────

test.describe('assertHealth', () => {
  let savedProdDomain: string | undefined;

  test.beforeEach(() => {
    savedProdDomain = process.env.PROD_DOMAIN;
    delete process.env.PROD_DOMAIN;
  });

  test.afterEach(() => {
    if (savedProdDomain !== undefined) process.env.PROD_DOMAIN = savedProdDomain;
    else delete process.env.PROD_DOMAIN;
  });

  test('passing health check → resolves', async () => {
    const request = mockRequest(() => mockResponse(200, '{"installed":true}'));
    await assertHealth(
      request,
      'https://files.local/status.php',
      async (res) => {
        const body = await res.json();
        return { ok: body.installed === true };
      },
      {},
      undefined
    );
    // Should not throw
  });

  test('failing health check → fails', async () => {
    const request = mockRequest(() => mockResponse(200, '{"installed":false}'));
    const { mock: mockTestInfo, getCalls } = createMockTestInfo();
    try {
      await assertHealth(
        request,
        'https://files.local/status.php',
        async (res) => {
          const body = await res.json();
          return { ok: body.installed === true, reason: 'maintenance mode' };
        },
        {},
        mockTestInfo
      );
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain('maintenance mode');
      const calls = getCalls();
      expect(calls.length).toBe(1);
      expect(calls[0].cond).toBe(true);
    }
  });
});
