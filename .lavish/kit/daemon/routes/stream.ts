// routes/stream.ts — SSE stream handlers for /api/cockpit/stream/*
// Full SSE mechanism; data sources are stubs until p2
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventBuffer, writeSSEEvent, writeGapEvent } from '../lib/sse';

const agentBuffer = new EventBuffer(100);
const factoryBuffer = new EventBuffer(100);

export function agentStreamHandler(c: Context) {
  const lastEventId = parseInt(c.req.header('Last-Event-ID') || '0', 10);
  
  return streamSSE(c, async (stream) => {
    // Replay missed events or mark gap
    const { events, gap } = agentBuffer.getSince(lastEventId);
    
    if (gap) {
      writeGapEvent(stream, lastEventId, events[0]?.id || lastEventId);
    }
    
    for (const ev of events) {
      writeSSEEvent(stream, ev);
    }
    
    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ ts: new Date().toISOString() }) });
    }, 30000);
    
    // Poll agent-lock.sh every 15s (stub — real data in p2)
    const poller = setInterval(async () => {
      // STUB: In p2 durch echten agent-lock.sh-Call ersetzen
      const ev = agentBuffer.push('agent_update', {
        agents: [{ sid: 'stub', label: 'p2-implementation needed', status: 'stub' }],
        fetchedAt: new Date().toISOString(),
      });
      writeSSEEvent(stream, ev);
    }, 15000);
    
    stream.onAbort(() => {
      clearInterval(heartbeat);
      clearInterval(poller);
    });
    
    // Keep stream alive
    await new Promise(() => {}); // never resolves
  });
}

export function factoryStreamHandler(c: Context) {
  const lastEventId = parseInt(c.req.header('Last-Event-ID') || '0', 10);
  
  return streamSSE(c, async (stream) => {
    const { events, gap } = factoryBuffer.getSince(lastEventId);
    if (gap) writeGapEvent(stream, lastEventId, events[0]?.id || lastEventId);
    for (const ev of events) writeSSEEvent(stream, ev);
    
    const poller = setInterval(async () => {
      // STUB: In p2 durch echten factory-mcp fetch ersetzen
      const ev = factoryBuffer.push('factory_tick', {
        last_tick: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
      });
      writeSSEEvent(stream, ev);
    }, 60000);
    
    stream.onAbort(() => clearInterval(poller));
    await new Promise(() => {});
  });
}
