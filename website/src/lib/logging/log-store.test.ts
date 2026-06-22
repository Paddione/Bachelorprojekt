import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { logEntries, addEntry, addEntries, clearLog, filterEntries, LOG_CAP, type LogFilters } from './log-store';
import type { LogEntry, LogLevel, LogSource } from './log-types';

function entry(over: Partial<LogEntry> = {}): LogEntry {
  return { ts: 1, level: 'info', source: 'server', message: 'm', ...over };
}

const allFilters = (over: Partial<LogFilters> = {}): LogFilters => ({
  levels: new Set<LogLevel>(['debug', 'info', 'warn', 'error']),
  sources: new Set<LogSource>(['server', 'browser', 'pod']),
  text: '',
  ...over,
});

describe('log store', () => {
  beforeEach(() => clearLog());

  it('appends entries', () => {
    addEntry(entry({ message: 'a' }));
    addEntry(entry({ message: 'b' }));
    expect(get(logEntries).map((e) => e.message)).toEqual(['a', 'b']);
  });

  it('enforces the ring cap, dropping oldest', () => {
    addEntries(Array.from({ length: LOG_CAP + 3 }, (_, i) => entry({ message: `m${i}` })));
    const cur = get(logEntries);
    expect(cur.length).toBe(LOG_CAP);
    expect(cur[0].message).toBe('m3'); // first three dropped
    expect(cur[cur.length - 1].message).toBe(`m${LOG_CAP + 2}`);
  });

  it('clearLog empties the store', () => {
    addEntry(entry());
    clearLog();
    expect(get(logEntries)).toEqual([]);
  });
});

describe('filterEntries', () => {
  const entries: LogEntry[] = [
    entry({ level: 'info', source: 'server', message: 'server info hello' }),
    entry({ level: 'error', source: 'browser', message: 'browser boom' }),
    entry({ level: 'warn', source: 'pod', message: 'pod careful' }),
  ];

  it('filters by level set', () => {
    const out = filterEntries(entries, allFilters({ levels: new Set<LogLevel>(['error']) }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toBe('browser boom');
  });

  it('filters by source set', () => {
    const out = filterEntries(entries, allFilters({ sources: new Set<LogSource>(['pod']) }));
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('pod');
  });

  it('filters by case-insensitive text', () => {
    const out = filterEntries(entries, allFilters({ text: 'HELLO' }));
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('hello');
  });

  it('combines all three filters (AND)', () => {
    const out = filterEntries(entries, allFilters({
      levels: new Set<LogLevel>(['info', 'warn']),
      sources: new Set<LogSource>(['server']),
      text: 'info',
    }));
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe('server');
  });

  it('returns nothing when all chips are off', () => {
    expect(filterEntries(entries, allFilters({ levels: new Set() }))).toHaveLength(0);
  });
});
