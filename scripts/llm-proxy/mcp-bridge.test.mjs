// scripts/llm-proxy/mcp-bridge.test.mjs
// Vitest tests for the MCP bridge module.
// Uses mocked child_process.spawn, fs, and readline.createInterface.
// Run: npx vitest run scripts/llm-proxy/mcp-bridge.test.mjs

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock setup (hoisted before module evaluation) ────────────────────────────
// These vi.fn() mocks are NOT tracked by clearAllMocks/restoreAllMocks in
// vitest 4 — they are plain mock functions created inside vi.hoisted.
// We must manually reset call history in beforeEach.

const mockState = vi.hoisted(() => {
  const rlInstances = [];
  return {
    spawn: vi.fn(),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    createInterface: vi.fn(() => {
      const rl = { on: vi.fn(), close: vi.fn() };
      rlInstances.push(rl);
      return rl;
    }),
    getRlInstances: () => rlInstances,
  };
});

vi.mock('node:child_process', () => ({ spawn: mockState.spawn }));
vi.mock('node:fs', () => ({ existsSync: mockState.existsSync, readFileSync: mockState.readFileSync }));
vi.mock('node:readline', () => ({ createInterface: mockState.createInterface }));

// ── Module under test ─────────────────────────────────────────────────────────

import { initBridge, handleMcp, stopBridge } from './mcp-bridge.mjs';

// ── Test data ─────────────────────────────────────────────────────────────────

const SINGLE_CONFIG = {
  servers: {
    'ticket-mcp': {
      command: 'ticket-mcp-go',
      args: [],
      env: { TICKET_MCP_REPO_ROOT: '/tmp/test' },
      cwd: '/tmp/test',
      enabled: true,
      bearerTokenEnv: null,
    },
  },
};

const THREE_CONFIG = {
  servers: {
    'ticket-mcp': {
      command: 'ticket-mcp-go',
      args: [],
      env: { TICKET_MCP_REPO_ROOT: '/tmp/test' },
      cwd: '/tmp/test',
      enabled: true,
      bearerTokenEnv: null,
    },
    'mcp-task-runner': {
      command: 'mcp-task-runner',
      args: ['--taskfile', '/tmp/Taskfile.yml'],
      env: {},
      cwd: '/tmp/test',
      enabled: true,
      bearerTokenEnv: null,
    },
    'codebase-memory-mcp': {
      command: 'codebase-memory-mcp',
      args: [],
      env: {},
      cwd: '/tmp/test',
      enabled: true,
      bearerTokenEnv: 'MCP_BRIDGE_TOKEN',
    },
    'disabled-server': {
      command: 'npx',
      args: ['-y', 'some-package'],
      env: {},
      cwd: '/tmp/test',
      enabled: false,
      bearerTokenEnv: null,
    },
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockChildProc() {
  const handlers = {};
  return {
    stdin: { write: vi.fn(), writable: true, end: vi.fn() },
    stdout: {},
    stderr: { on: vi.fn() },
    kill: vi.fn(),
    killed: false,
    on: vi.fn((evt, cb) => { handlers[evt] = cb; }),
    emit: function (evt, ...args) {
      if (handlers[evt]) handlers[evt](...args);
    },
    _handlers: handlers,
  };
}

function lineHandlerFrom(rlMock) {
  const calls = rlMock.on.mock.calls;
  for (const [evt, fn] of calls) {
    if (evt === 'line') return fn;
  }
  return null;
}

function mockReq(headers, body) {
  return {
    headers: headers || {},
    on: vi.fn((evt, cb) => {
      if (evt === 'data' && body) setTimeout(() => cb(body), 0);
      if (evt === 'end' && body) setTimeout(() => cb(), 5);
    }),
  };
}

function mockRes() {
  return { writeHead: vi.fn(), end: vi.fn(), write: vi.fn(), on: vi.fn() };
}

/** Set fs mock to return a config JSON before each test. */
function useConfig(cfg) {
  mockState.existsSync.mockReturnValue(true);
  mockState.readFileSync.mockReturnValue(JSON.stringify(cfg));
}

/** Set fs mock to return the single-server config. */
function useSingleConfig() {
  useConfig(SINGLE_CONFIG);
}

/** Set fs mock to return the three-server config. */
function useThreeConfig() {
  useConfig(THREE_CONFIG);
}

/** Spawn one mock child proc (for single-server config). */
function spawnOne() {
  const p = mockChildProc();
  mockState.spawn.mockReturnValueOnce(p);
  return p;
}

/** Spawn N mock child procs (for three-server config). */
function spawnThree() {
  return [
    mockChildProc(),
    mockChildProc(),
    mockChildProc(),
  ].map((p) => {
    mockState.spawn.mockReturnValueOnce(p);
    return p;
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('mcp-bridge', () => {
  beforeEach(() => {
    // Manual reset only what vitest's clearAllMocks does NOT touch:
    // mockFn.mockClear() resets calls/instances/results but NOT returnValues.
    // Since our mocks are created inside vi.hoisted(), they may not be in
    // vitest's registry — so we do manual mockClear + reset return values.
    mockState.spawn.mockClear();
    mockState.existsSync.mockClear();
    mockState.readFileSync.mockClear();
    mockState.createInterface.mockClear();
    mockState.getRlInstances().length = 0;
    delete process.env.MCP_BRIDGE_TOKEN;
  });

  afterEach(async () => {
    await stopBridge();
  });

  // ── Config loading ───────────────────────────────────────────────────────

  it('starts only enabled servers', async () => {
    useThreeConfig();
    spawnThree();

    await initBridge();

    expect(mockState.spawn).toHaveBeenCalledTimes(3);
    expect(mockState.spawn).toHaveBeenNthCalledWith(1, 'ticket-mcp-go', [],
      expect.objectContaining({ cwd: '/tmp/test' }));
    expect(mockState.spawn).toHaveBeenNthCalledWith(2, 'mcp-task-runner',
      ['--taskfile', '/tmp/Taskfile.yml'],
      expect.objectContaining({ cwd: '/tmp/test' }));

    const commands = mockState.spawn.mock.calls.map((c) => c[0]);
    expect(commands).not.toContain('npx');
  });

  it('handles missing config gracefully', async () => {
    mockState.existsSync.mockReturnValue(false);

    await expect(initBridge()).resolves.toBeUndefined();
    expect(mockState.spawn).not.toHaveBeenCalled();
  });

  it('handles malformed config gracefully', async () => {
    mockState.existsSync.mockReturnValue(true);
    mockState.readFileSync.mockReturnValue('not-json');

    await expect(initBridge()).resolves.toBeUndefined();
    expect(mockState.spawn).not.toHaveBeenCalled();
  });

  // ── GET: SSE stream setup ─────────────────────────────────────────────────

  it('GET /mcp/<name> sets up SSE stream with session_id', async () => {
    useSingleConfig();
    spawnOne();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({}, null), res, 'ticket-mcp', 'GET');

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({
      'content-type': 'text/event-stream',
    }));
    const writeArg = res.write.mock.calls[0][0];
    expect(writeArg).toContain('event: session_id');
    expect(writeArg).toContain('sessionId');
  });

  it('GET for unknown server returns 404', async () => {
    useSingleConfig();
    spawnOne();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({}, null), res, 'nonexistent', 'GET');

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  it('GET for disabled server returns 404', async () => {
    useThreeConfig();
    spawnThree();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({}, null), res, 'disabled-server', 'GET');

    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  // ── POST: JSON-RPC dispatch ───────────────────────────────────────────────

  it('POST /mcp/<name> writes JSON-RPC to stdin and returns 200 with the child response (streamable_http)', async () => {
    useSingleConfig();
    const proc = spawnOne();
    await initBridge();

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const res = mockRes();
    handleMcp(mockReq({}, body), res, 'ticket-mcp', 'POST');

    await vi.waitFor(() => {
      expect(proc.stdin.write).toHaveBeenCalledWith(body + '\n');
    });

    // Simulate the child's response arriving on stdout → delivered on the POST
    const childReply = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
    lineHandlerFrom(mockState.getRlInstances()[0])(childReply);

    await vi.waitFor(() => {
      expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    });
    expect(res.end).toHaveBeenCalledWith(childReply);
  });

  it('POST with a notification (no id) returns 202 without body', async () => {
    useSingleConfig();
    const proc = spawnOne();
    await initBridge();

    const body = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
    const res = mockRes();
    handleMcp(mockReq({}, body), res, 'ticket-mcp', 'POST');

    await vi.waitFor(() => {
      expect(proc.stdin.write).toHaveBeenCalledWith(body + '\n');
    });
    expect(res.writeHead).toHaveBeenCalledWith(202, expect.any(Object));
    expect(res.end).toHaveBeenCalledWith();
  });

  it('POST with invalid JSON returns 400', async () => {
    useSingleConfig();
    spawnOne();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({}, 'not-json'), res, 'ticket-mcp', 'POST');

    await vi.waitFor(() => expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object)));
  });

  it('POST with missing jsonrpc/method returns 400', async () => {
    useSingleConfig();
    spawnOne();
    await initBridge();

    const body = JSON.stringify({ id: 1 });
    const res = mockRes();
    handleMcp(mockReq({}, body), res, 'ticket-mcp', 'POST');

    await vi.waitFor(() => expect(res.writeHead).toHaveBeenCalledWith(400, expect.any(Object)));
  });

  it('POST with killed process returns 503', async () => {
    useSingleConfig();
    const proc = spawnOne();
    await initBridge();

    // Mark killed WITHOUT emitting exit (entry stays in map)
    proc.killed = true;

    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const res = mockRes();
    handleMcp(mockReq({}, body), res, 'ticket-mcp', 'POST');

    // Entry exists in servers map, but proc.killed → 503
    expect(res.writeHead).toHaveBeenCalledWith(503, expect.any(Object));
  });

  // ── stdout → SSE broadcast ───────────────────────────────────────────────

  it('broadcasts stdout lines to all connected SSE sessions', async () => {
    useSingleConfig();
    spawnOne();
    await initBridge();

    const rlMock = mockState.getRlInstances()[0];
    expect(rlMock).toBeTruthy();

    const res1 = mockRes();
    const res2 = mockRes();
    handleMcp(mockReq({}, null), res1, 'ticket-mcp', 'GET');
    handleMcp(mockReq({}, null), res2, 'ticket-mcp', 'GET');

    const response = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { tools: [] } });
    const lineHandler = lineHandlerFrom(rlMock);
    expect(lineHandler).toBeTruthy();
    lineHandler(response);

    expect(res1.write).toHaveBeenCalledWith(expect.stringContaining('event: message'));
    expect(res1.write).toHaveBeenCalledWith(expect.stringContaining(response));
    expect(res2.write).toHaveBeenCalledWith(expect.stringContaining('event: message'));
    expect(res2.write).toHaveBeenCalledWith(expect.stringContaining(response));
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('rejects GET without bearer token when configured', async () => {
    process.env.MCP_BRIDGE_TOKEN = 'secret-123';
    SINGLE_CONFIG.servers['ticket-mcp'].bearerTokenEnv = 'MCP_BRIDGE_TOKEN';
    useSingleConfig();
    spawnOne();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({}, null), res, 'ticket-mcp', 'GET');

    expect(res.writeHead).toHaveBeenCalledWith(401, expect.any(Object));
  });

  it('accepts GET with valid bearer token', async () => {
    process.env.MCP_BRIDGE_TOKEN = 'secret-123';
    SINGLE_CONFIG.servers['ticket-mcp'].bearerTokenEnv = 'MCP_BRIDGE_TOKEN';
    useSingleConfig();
    spawnOne();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({ authorization: 'Bearer secret-123' }, null), res, 'ticket-mcp', 'GET');

    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
  });

  // ── Process restart ───────────────────────────────────────────────────────

  it('restarts a server when the child process exits', async () => {
    useSingleConfig();
    const proc1 = mockChildProc();
    mockState.spawn.mockReturnValue(proc1); // persistent return value
    await initBridge();

    proc1.emit('exit', 1, null);

    // Wait for restart timer (1s in the module)
    await new Promise((r) => setTimeout(r, 1100));

    expect(mockState.spawn).toHaveBeenCalledTimes(2);
    expect(mockState.spawn).toHaveBeenNthCalledWith(2, 'ticket-mcp-go', [],
      expect.objectContaining({ cwd: '/tmp/test' }));
  });

  // ── StopBridge ────────────────────────────────────────────────────────────

  it('stopBridge kills processes and server becomes unavailable', async () => {
    useSingleConfig();
    const proc = spawnOne();
    await initBridge();

    handleMcp(mockReq({}, null), mockRes(), 'ticket-mcp', 'GET');
    await stopBridge();

    expect(proc.kill).toHaveBeenCalled();

    const res = mockRes();
    handleMcp(mockReq({}, null), res, 'ticket-mcp', 'GET');
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.any(Object));
  });

  // ── Method not allowed ─────────────────────────────────────────────────────

  it('returns 405 for unsupported HTTP methods', async () => {
    useSingleConfig();
    spawnOne();
    await initBridge();

    const res = mockRes();
    handleMcp(mockReq({}, null), res, 'ticket-mcp', 'PUT');

    expect(res.writeHead).toHaveBeenCalledWith(405, expect.any(Object));
  });
});
