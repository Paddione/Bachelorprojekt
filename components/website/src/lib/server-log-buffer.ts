// In-process ring buffer that mirrors recent server logs for live streaming to
// the admin logging widget. The pino logger writes every line here (in addition
// to stdout → Promtail/Loki) via a multistream destination. A module-level
// singleton: one buffer per Node process, shared by the SSE endpoint.

import { parsePinoLine } from './logging/log-format';
import type { LogEntry } from './logging/log-types';

const CAP = 500;

class ServerLogBuffer {
  private ring: LogEntry[] = [];
  private subscribers = new Set<(e: LogEntry) => void>();

  /** Accept a serialised pino JSON line (the multistream destination calls this). */
  pushRaw(raw: string): void {
    const line = raw.trim();
    if (!line) return;
    this.push(parsePinoLine(line, 'server'));
  }

  push(entry: LogEntry): void {
    this.ring.push(entry);
    if (this.ring.length > CAP) this.ring.splice(0, this.ring.length - CAP);
    for (const fn of this.subscribers) {
      // A failing subscriber must never break the logging path.
      try { fn(entry); } catch { /* ignore */ }
    }
  }

  /** Snapshot of buffered entries (oldest → newest). */
  backlog(): LogEntry[] {
    return this.ring.slice();
  }

  /** Subscribe to new entries; returns an unsubscribe function. */
  subscribe(fn: (e: LogEntry) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /** Test helper — drop all buffered entries and subscribers. */
  reset(): void {
    this.ring = [];
    this.subscribers.clear();
  }
}

export const serverLogBuffer = new ServerLogBuffer();
export const SERVER_LOG_CAP = CAP;
