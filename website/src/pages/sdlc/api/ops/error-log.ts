import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { persistError, getErrorLogPool } from '../../../../lib/logging/error-log-store';
import { logger } from '../../../../lib/logger';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Validate that we have a JSON body before trying to parse it
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response('Content-Type must be application/json', { status: 400 });
    }

    const session = await getSession(request.headers.get('cookie') ?? '');
    
    if (!session || !isAdmin(session)) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      logger.error({ err }, '[error-log] Failed to parse JSON');
      return new Response('Invalid JSON', { status: 400 });
    }

    const { source, message, namespace, pod_name, meta } = body;

    // Validate required fields
    if (source !== 'browser' && source !== 'pod') {
      return new Response('Invalid source', { status: 400 });
    }
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return new Response('Message is required and cannot be empty', { status: 400 });
    }

    await persistError({ 
      source, 
      message,
      namespace,
      pod_name,
      meta: meta ?? {}
    });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    logger.error({ err }, '[error-log] POST failed');
    return new Response('Internal server error', { status: 500 });
  }
};

export const GET: APIRoute = async ({ request }) => {
  try {
    // Validate session first, before any other processing
    const session = await getSession(request.headers.get('cookie') ?? '');
    
    if (!session || !isAdmin(session)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Only support '24h' window
    const params = new URLSearchParams(request.url.split('?')[1] ?? '');
    const since = params.get('since');
    
    if (since !== '24h') {
      return new Response('Only 24h window is supported', { status: 400 });
    }

    // Query error_log for last 24h
    const now = new Date();
    const sinceDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const result = await getErrorLogPool().query(
      `SELECT id, source, message, namespace, pod_name, ts
       FROM error_log
       WHERE ts >= $1 AND ts <= $2
       ORDER BY ts DESC`,
      [sinceDate.toISOString(), now.toISOString()]
    );

    interface ErrorLogRow {
      id: number;
      source: string;
      message: string;
      namespace: string | null;
      pod_name: string | null;
      ts: string;
    }

    // Map rows to LogEntry format (epoch ms for ts)
    const entries = (result.rows as ErrorLogRow[]).map((row) => ({
      id: row.id,
      source: row.source,
      message: row.message,
      namespace: row.namespace,
      pod_name: row.pod_name,
      level: 'error' as const,
      ts: new Date(row.ts).getTime()
    }));

    return new Response(JSON.stringify(entries), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err) {
    logger.error({ err }, '[error-log] GET failed');
    return new Response('Internal server error', { status: 500 });
  }
};
