// lib/sse.ts — SSE helpers: EventBuffer, gap markers, event formatting
interface SSEEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
  ts: string;
}

class EventBuffer {
  private events: SSEEvent[] = [];
  private nextId = 1;
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  push(event: string, data: Record<string, unknown>): SSEEvent {
    const ev: SSEEvent = {
      id: this.nextId++,
      event,
      data,
      ts: new Date().toISOString(),
    };
    
    if (this.events.length >= this.maxSize) {
      this.events.shift();
    }
    this.events.push(ev);
    return ev;
  }

  getSince(lastEventId: number): { events: SSEEvent[]; gap: boolean } {
    if (this.events.length === 0) return { events: [], gap: false };
    
    const idx = this.events.findIndex(e => e.id > lastEventId);
    if (idx === -1) return { events: [], gap: false };
    
    const gap = idx > 0 && this.events[idx].id > lastEventId + 1;
    return { events: this.events.slice(idx), gap };
  }

  oldestId(): number {
    return this.events[0]?.id ?? this.nextId;
  }
}

function writeSSEEvent(stream: any, ev: SSEEvent): void {
  stream.writeSSE({
    id: String(ev.id),
    event: ev.event,
    data: JSON.stringify(ev.data),
  });
}

function writeGapEvent(stream: any, fromId: number, toId: number): void {
  stream.writeSSE({
    event: 'gap',
    data: JSON.stringify({
      from_id: fromId,
      to_id: toId,
      message: `Events ${fromId}–${toId} missed during disconnect`,
    }),
  });
}

export { EventBuffer, writeSSEEvent, writeGapEvent };
export type { SSEEvent };
