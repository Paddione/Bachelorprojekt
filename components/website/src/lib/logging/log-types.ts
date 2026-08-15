// Shared log model used by the central logging bus: the Sidekick logging widget
// and the admin/ops LogsTab both normalise their sources onto LogEntry.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogSource = 'server' | 'browser' | 'pod';

export interface LogEntry {
  /** Epoch milliseconds. */
  ts: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  /** Structured residue (pino bindings, error stacks, …). */
  meta?: Record<string, unknown>;
}
