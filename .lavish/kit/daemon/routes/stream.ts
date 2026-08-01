// routes/stream.ts — Real SSE data sources (p2)
import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { EventBuffer, writeSSEEvent, writeGapEvent } from '../lib/sse';
import { getAgentSessions } from '../sources/agent-lock';
import { getFactoryStatus } from '../sources/factory-mcp';

const agentBuffer = new EventBuffer(100);
const factoryBuffer = new EventBuffer(100);

export function agentStreamHandler(c: Context) {
  const lastEventId = parseInt(c.req.header('Last-Event-ID') || '0', 10);
  return streamSSE(c, async (stream) => {
    const { events, gap } = agentBuffer.getSince(lastEventId);
    if (gap) writeGapEvent(stream, lastEventId, events[0]?.id || lastEventId);
    for (const ev of events) writeSSEEvent(stream, ev);
    const heartbeat = setInterval(() => { stream.writeSSE({ event: 'heartbeat', data: JSON.stringify({ts:new Date().toISOString()}) }); }, 30000);
    const poller = setInterval(async () => {
      try {
        const agents = await getAgentSessions();
        const ev = agentBuffer.push('agent_update', { agents, fetchedAt: new Date().toISOString() });
        writeSSEEvent(stream, ev);
      } catch (e: any) { stream.writeSSE({ event: 'error', data: JSON.stringify({error: e.message}) }); }
    }, 15000);
    stream.onAbort(() => { clearInterval(heartbeat); clearInterval(poller); });
    await new Promise(() => {});
  });
}

export function factoryStreamHandler(c: Context) {
  const lastEventId = parseInt(c.req.header('Last-Event-ID') || '0', 10);
  return streamSSE(c, async (stream) => {
    const { events, gap } = factoryBuffer.getSince(lastEventId);
    if (gap) writeGapEvent(stream, lastEventId, events[0]?.id || lastEventId);
    for (const ev of events) writeSSEEvent(stream, ev);
    const poller = setInterval(async () => {
      try {
        const status = await getFactoryStatus();
        const ev = factoryBuffer.push('factory_tick', { ...status, fetchedAt: new Date().toISOString() });
        writeSSEEvent(stream, ev);
      } catch (e: any) { stream.writeSSE({ event: 'error', data: JSON.stringify({error: e.message}) }); }
    }, 60000);
    stream.onAbort(() => clearInterval(poller));
    await new Promise(() => {});
  });
}
