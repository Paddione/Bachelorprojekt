import { Router, Request, Response } from 'express';

export interface GpuEvent {
  id: number;
  timestamp: string;
  type: string;
  data: any;
}

export class GpuEventBuffer {
  private events: GpuEvent[] = [];
  private nextId = 1;
  private maxEvents: number;

  constructor(maxEvents = 500) {
    this.maxEvents = maxEvents;
  }

  push(type: string, data: any): GpuEvent {
    const event: GpuEvent = {
      id: this.nextId++,
      timestamp: new Date().toISOString(),
      type,
      data,
    };
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    return event;
  }

  getSince(lastId: number): GpuEvent[] {
    return this.events.filter((e) => e.id > lastId);
  }
}

export const globalGpuEventBuffer = new GpuEventBuffer();

export function makeGpuRouter(unslothStudioUrl = 'http://127.0.0.1:8888'): Router {
  const r = Router();

  r.get('/gpu/status', async (_req: Request, res: Response) => {
    try {
      const resp = await fetch(`${unslothStudioUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) {
        res.status(resp.status).json({ status: 'degraded', code: resp.status });
        return;
      }
      const data = await resp.json();
      res.json({ status: 'healthy', upstream: data });
    } catch (e: any) {
      res.status(503).json({ status: 'unavailable', error: e.message });
    }
  });

  r.post('/gpu/jobs', async (req: Request, res: Response) => {
    const payload = req.body ?? {};
    try {
      const resp = await fetch(`${unslothStudioUrl}/api/inference/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
      const data = await resp.json().catch(() => ({}));
      globalGpuEventBuffer.push('job_dispatched', { payload, result: data });
      res.status(resp.status).json(data);
    } catch (e: any) {
      res.status(502).json({ error: 'gpu_dispatch_failed', detail: e.message });
    }
  });

  r.post('/gpu/cancel', async (req: Request, res: Response) => {
    const { jobId } = req.body ?? {};
    try {
      const resp = await fetch(`${unslothStudioUrl}/api/inference/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
      });
      const data = await resp.json().catch(() => ({}));
      globalGpuEventBuffer.push('job_cancelled', { jobId });
      res.status(resp.status).json(data);
    } catch (e: any) {
      res.status(502).json({ error: 'gpu_cancel_failed', detail: e.message });
    }
  });

  r.get('/gpu/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const lastEventId = parseInt(req.header('Last-Event-ID') ?? '0', 10);
    const missed = globalGpuEventBuffer.getSince(lastEventId);
    for (const evt of missed) {
      res.write(`id: ${evt.id}\nevent: ${evt.type}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    }

    const interval = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
    });
  });

  return r;
}
