import { Request, Response } from 'express';
import { logger } from '../lib/logger';
import { db } from '../db';
import { clientErrors } from '@shared/schema';
import { desc, eq, and, sql, gte, lte, type SQL } from 'drizzle-orm';
import { clientErrorReportSchema, type ClientErrorReport } from '@shared/errors';
import { getMetrics } from '../middleware/observability';

// Report client-side errors
export async function reportError(req: Request, res: Response) {
  try {
    const parsed = clientErrorReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Missing required fields: errorId, message, code',
        issues: parsed.error.issues,
      });
    }
    const errorReport: ClientErrorReport = parsed.data;

    // Validate required fields
    if (!errorReport.errorId || !errorReport.message || !errorReport.code) {
      return res.status(400).json({
        error: 'Missing required fields: errorId, message, code',
      });
    }

    // Add request context
    const requestContext = {
      ...errorReport.context,
      requestId: req.headers['x-request-id'] || req.ip,
      ip: req.ip,
      userAgent: errorReport.userAgent || req.headers['user-agent'],
      url: errorReport.url,
      errorId: errorReport.errorId,
      clientTimestamp: errorReport.timestamp,
      severity: errorReport.severity,
    };

    // Log the client error
    logger.logClientError(new Error(errorReport.message), requestContext);

    // Persist the error in DB
    if (db) {
      try {
        await db.insert(clientErrors).values({
          errorId: errorReport.errorId,
          message: errorReport.message,
          code: errorReport.code,
          severity: errorReport.severity,
          context: errorReport.context ?? null,
          userAgent: errorReport.userAgent || req.headers['user-agent'] || null,
          url: errorReport.url || null,
          stack: errorReport.stack || null,
          requestId: String(requestContext.requestId || ''),
          ip: req.ip,
        });
      } catch (e) {
        logger.warn('Failed to persist client error', { error: (e as Error).message });
      }
    }

    // For critical errors, also log as high priority
    if (errorReport.severity === 'critical') {
      logger.logSecurityEvent('Critical client error reported', requestContext);
    }

    res.status(200).json({
      success: true,
      errorId: errorReport.errorId,
      message: 'Error reported successfully',
    });
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({
      error: 'Failed to report error',
      message: (error as Error).message,
    });
  }
}

// Get error statistics (for admin/debugging)
export async function getErrorStats(req: Request, res: Response) {
  try {
    // Simple stats from client_errors table when DB is configured
    if (!db)
      return res.json({
        configured: false,
        message: 'Error statistics not available without database',
      });
    const r = await db.execute<{ count: number }>(
      sql`select count(*)::int as count from ${clientErrors}`,
    );
    const count = (r.rows as Array<{ count: number }>)[0]?.count ?? 0;
    res.json({ configured: true, count });
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({ error: 'Failed to get error statistics' });
  }
}

// Admin: list client errors with simple pagination
export async function listClientErrors(req: Request, res: Response) {
  try {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100'), 10) || 100, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const code = req.query.code ? String(req.query.code) : undefined;
    const severity = req.query.severity ? String(req.query.severity) : undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : undefined;
    const to = req.query.to ? new Date(String(req.query.to)) : undefined;

    const conditions: SQL<unknown>[] = [];
    if (code) conditions.push(eq(clientErrors.code, code));
    if (severity) conditions.push(eq(clientErrors.severity, severity));
    if (from) conditions.push(gte(clientErrors.createdAt, from));
    if (to) conditions.push(lte(clientErrors.createdAt, to));

    const where = conditions.reduce<SQL<unknown> | undefined>(
      (acc, condition) => (acc ? and(acc, condition) : condition),
      undefined,
    );

    const baseQuery = db.select().from(clientErrors);
    const rows = await (where ? baseQuery.where(where) : baseQuery)
      .orderBy(desc(clientErrors.createdAt))
      .limit(limit)
      .offset(offset);
    res.json({ total: rows.length, items: rows });
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({ error: 'Failed to list client errors' });
  }
}

export async function getClientError(req: Request, res: Response) {
  try {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { id } = req.params;
    const [row] = await db.select().from(clientErrors).where(eq(clientErrors.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({ error: 'Failed to get client error' });
  }
}

export async function deleteClientError(req: Request, res: Response) {
  try {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { id } = req.params;
    const result = await db.delete(clientErrors).where(eq(clientErrors.id, id)).returning();
    res.json({ deleted: result.length });
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({ error: 'Failed to delete client error' });
  }
}

export async function bulkDeleteClientErrors(req: Request, res: Response) {
  try {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { before, code, severity } = req.body || {};
    const conditions: SQL<unknown>[] = [];
    if (before) {
      const d = new Date(before);
      if (!isNaN(d.getTime())) conditions.push(lte(clientErrors.createdAt, d));
    }
    if (code) conditions.push(eq(clientErrors.code, String(code)));
    if (severity) conditions.push(eq(clientErrors.severity, String(severity)));

    const where = conditions.reduce<SQL<unknown> | undefined>(
      (acc, condition) => (acc ? and(acc, condition) : condition),
      undefined,
    );

    if (!where)
      return res.status(400).json({ error: 'Provide at least one filter: before, code, severity' });
    const result = await db.delete(clientErrors).where(where).returning({ id: clientErrors.id });
    res.json({ deleted: result.length });
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({ error: 'Failed to bulk delete client errors' });
  }
}

// Health check endpoint that includes error information
export async function healthCheck(req: Request, res: Response) {
  try {
    const metrics = getMetrics();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: metrics.uptime,
      memory: metrics.memory,
      metrics: {
        requests: metrics.requests,
      },
      version: process.env.npm_package_version || 'unknown',
      db: db ? 'connected' : 'disconnected',
    };

    /*
    logger.info('Health check requested', {
      requestId: req.headers['x-request-id'],
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    */

    res.json(health);
  } catch (error) {
    logger.logApiError(req, error as Error, 500);
    res.status(500).json({
      status: 'unhealthy',
      error: (error as Error).message,
    });
  }
}
// Minimal public health check for monitoring
export async function publicHealthCheck(_req: Request, res: Response) {
  res.json({ status: 'ok' });
}
