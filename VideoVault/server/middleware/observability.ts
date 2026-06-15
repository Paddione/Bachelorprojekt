import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger';

// Extend Express Request to include id
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

const REQUEST_ID_HEADER = 'x-request-id';
const CORRELATION_ID_HEADER = 'x-correlation-id';

export function requestId(req: Request, res: Response, next: NextFunction) {
  const incomingId = (
    (req.headers[REQUEST_ID_HEADER] as string) ||
    (req.headers[CORRELATION_ID_HEADER] as string) ||
    ''
  ).trim();
  const id = incomingId || randomUUID();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  res.setHeader('X-Correlation-ID', id);
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime();

  res.on('finish', () => {
    // Skip logging for health checks to reduce log spam
    if (req.originalUrl === '/api/health' || req.path === '/api/health') {
      return;
    }

    const [seconds, nanoseconds] = process.hrtime(start);
    const durationMs = (seconds * 1000 + nanoseconds / 1e6).toFixed(2);

    logger.info('Request finished', {
      requestId: req.id,
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
  });

  next();
}

// Simple metrics
const metrics = {
  requests: { total: 0, errors: 0 },
  responseTimes: [] as number[],
};

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  metrics.requests.total++;
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      metrics.requests.errors++;
    }
  });
  next();
}

export function getMetrics() {
  return {
    ...metrics,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };
}
