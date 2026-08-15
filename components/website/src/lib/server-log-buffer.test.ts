import { describe, it, expect, beforeEach } from 'vitest';
import { serverLogBuffer, SERVER_LOG_CAP } from './server-log-buffer';
import type { LogEntry } from './logging/log-types';

describe('serverLogBuffer', () => {
  beforeEach(() => serverLogBuffer.reset());

  it('parses pushed pino lines into structured entries', () => {
    serverLogBuffer.pushRaw(JSON.stringify({ level: 50, time: 5, msg: 'request.end', statusCode: 500 }));
    const [e] = serverLogBuffer.backlog();
    expect(e).toMatchObject({ level: 'error', source: 'server', message: 'request.end', ts: 5 });
  });

  it('ignores blank lines', () => {
    serverLogBuffer.pushRaw('   ');
    expect(serverLogBuffer.backlog()).toHaveLength(0);
  });

  it('enforces the cap', () => {
    for (let i = 0; i < SERVER_LOG_CAP + 10; i++) {
      serverLogBuffer.pushRaw(JSON.stringify({ level: 30, time: i, msg: `m${i}` }));
    }
    const cur = serverLogBuffer.backlog();
    expect(cur.length).toBe(SERVER_LOG_CAP);
    expect(cur[cur.length - 1].message).toBe(`m${SERVER_LOG_CAP + 9}`);
  });

  it('notifies subscribers and stops after unsubscribe', () => {
    const seen: LogEntry[] = [];
    const off = serverLogBuffer.subscribe((e) => seen.push(e));
    serverLogBuffer.pushRaw(JSON.stringify({ level: 30, time: 1, msg: 'a' }));
    off();
    serverLogBuffer.pushRaw(JSON.stringify({ level: 30, time: 2, msg: 'b' }));
    expect(seen.map((e) => e.message)).toEqual(['a']);
  });

  it('does not let a throwing subscriber break logging', () => {
    serverLogBuffer.subscribe(() => { throw new Error('bad subscriber'); });
    expect(() => serverLogBuffer.pushRaw(JSON.stringify({ level: 30, time: 1, msg: 'ok' }))).not.toThrow();
    expect(serverLogBuffer.backlog()).toHaveLength(1);
  });
});
