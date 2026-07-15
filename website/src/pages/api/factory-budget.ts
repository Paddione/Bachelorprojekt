import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../lib/auth';
import {
  getDailyBudgetSummary,
  getRunBudgetByTicket,
  setBudgetLimit,
  getRecentRuns
} from '../../lib/factory-budget';

export const prerender = false;

export const GET: APIRoute = async ({ request, url , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ticketId = url.searchParams.get('ticketId');
  const date = url.searchParams.get('date') || undefined;
  const recent = url.searchParams.get('recent');

  try {
    if (recent === 'true') {
      const data = await getRecentRuns();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (ticketId) {
      const data = await getRunBudgetByTicket(ticketId);
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await getDailyBudgetSummary(date);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-budget GET]');
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request , locals }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { limit } = await request.json();
    if (limit === undefined || isNaN(parseFloat(limit))) {
      return new Response(JSON.stringify({ error: 'Invalid limit' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await setBudgetLimit(parseFloat(limit));
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/factory-budget POST]');
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
