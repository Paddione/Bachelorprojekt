// Pure parsing + colour helpers shared by every log consumer. No DOM, no I/O —
// fully unit-testable. The colour classes (`log-<level>`) are styled locally by
// each consuming component, so the level→class mapping is the single source of
// truth for "which colour does this line get".

import type { LogEntry, LogLevel, LogSource } from './log-types';

/** Pino numeric levels: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal. */
export function pinoLevelToLevel(n: number): LogLevel {
  if (n >= 50) return 'error'; // error + fatal
  if (n >= 40) return 'warn';
  if (n >= 30) return 'info';
  return 'debug'; // trace + debug
}

function stringToLevel(s: string): LogLevel {
  const l = s.toLowerCase();
  if (l === 'fatal' || l === 'error') return 'error';
  if (l === 'warn' || l === 'warning') return 'warn';
  if (l === 'info') return 'info';
  return 'debug';
}

/**
 * Heuristic level for unstructured text lines. Mirrors the legacy
 * admin/ops/LogsTab behaviour exactly so the refactor is behaviour-preserving.
 */
export function textToLevel(line: string): LogLevel {
  const l = line.toLowerCase();
  if (l.includes('error') || l.includes('fatal') || l.includes('err ')) return 'error';
  if (l.includes('warn')) return 'warn';
  return 'info';
}

export function levelClass(level: LogLevel): string {
  return `log-${level}`;
}

/** Convenience for raw text lines (used by the admin/ops pod-log viewer). */
export function levelClassFromText(line: string): string {
  return levelClass(textToLevel(line));
}

export function levelLabel(level: LogLevel): string {
  return level.toUpperCase();
}

/** Parse one serialised pino JSON line into a LogEntry. Falls back to text. */
export function parsePinoLine(raw: string, source: LogSource = 'server'): LogEntry {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const level =
      typeof o.level === 'number' ? pinoLevelToLevel(o.level)
      : typeof o.level === 'string' ? stringToLevel(o.level)
      : 'info';
    const ts = typeof o.time === 'number' ? o.time : Date.now();
    const message = typeof o.msg === 'string' && o.msg.length > 0 ? o.msg : raw;
    const { level: _l, time: _t, msg: _m, ...meta } = o;
    return { ts, level, source, message, meta };
  } catch {
    return { ts: Date.now(), level: textToLevel(raw), source, message: raw };
  }
}

/**
 * Pod container stdout — the website pod emits pino JSON, other pods emit plain
 * text. Try JSON first (→ real numeric level), otherwise heuristic text level.
 */
export function parsePodLine(raw: string): LogEntry {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return parsePinoLine(trimmed, 'pod');
  return { ts: Date.now(), level: textToLevel(raw), source: 'pod', message: raw };
}
