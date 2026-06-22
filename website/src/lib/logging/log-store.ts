// The central log bus: a single capped ring of LogEntry shared by all views.
// A classic Svelte store (not a `.svelte.ts` runes module) so it is reactive in
// runes components via `$logEntries` and unit-testable under plain vitest/node.

import { writable } from 'svelte/store';
import type { LogEntry, LogLevel, LogSource } from './log-types';

export const LOG_CAP = 2000;

export const logEntries = writable<LogEntry[]>([]);

export function addEntry(entry: LogEntry): void {
  logEntries.update((cur) => {
    const next = cur.length >= LOG_CAP ? cur.slice(cur.length - LOG_CAP + 1) : cur.slice();
    next.push(entry);
    return next;
  });
}

export function addEntries(entries: LogEntry[]): void {
  for (const e of entries) addEntry(e);
}

export function clearLog(): void {
  logEntries.set([]);
}

export interface LogFilters {
  /** Levels currently enabled (chip on). An entry shows only if its level is in the set. */
  levels: Set<LogLevel>;
  /** Sources currently enabled. An entry shows only if its source is in the set. */
  sources: Set<LogSource>;
  /** Case-insensitive substring match against the message. Empty = no text filter. */
  text: string;
}

export function filterEntries(entries: LogEntry[], f: LogFilters): LogEntry[] {
  const t = f.text.trim().toLowerCase();
  return entries.filter((e) => {
    if (!f.levels.has(e.level)) return false;
    if (!f.sources.has(e.source)) return false;
    if (t && !e.message.toLowerCase().includes(t)) return false;
    return true;
  });
}
