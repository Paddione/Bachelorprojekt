import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import inventory from '../../../data/api-inventory.json';

// mcp-health.ts — Server-seitiger MCP-Health-Proxy (T008016/E4).
// Der Browser darf MCP-Ports NICHT direkt anbohren (delta-spec
// "API Catalog UI"): er erfragt den Zustand aller HTTP-MCP-Server ueber
// diese Route. Hosts/Ports kommen ausschliesslich aus api-inventory.json —
// nirgendwo dupliziert.
//
// Probe-Semantik: jeder HTTP-Status (auch 405/401) gilt als "Server lebt";
// nur Netzwerk-Ebene (refused/timeout/DNS) ist "down". Timeout je Server
// 1500 ms, damit eine Ausfallreihe die Antwort nicht unendlich verzoegert.

export const prerender = false;

const PROBE_TIMEOUT_MS = 1_500;

interface McpServerEntry {
  name: string;
  transport: string | null;
  endpoint: string | null;
}

interface McpHealthServer {
  name: string;
  ok: boolean;
  error: string | null;
}

const httpServers: { name: string; endpoint: string }[] = (
  (inventory as { mcpServers?: McpServerEntry[] }).mcpServers ?? []
)
  .filter((s) => s.transport === 'http' && typeof s.endpoint === 'string' && s.endpoint.length > 0)
  .map((s) => ({ name: s.name, endpoint: s.endpoint as string }));

async function probe(server: { name: string; endpoint: string }): Promise<McpHealthServer> {
  try {
    await fetch(server.endpoint, {
      method: 'GET',
      headers: { accept: 'application/json, text/event-stream' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    // Jede HTTP-Antwort — auch Fehlerstatus — belegt, dass der Server lauscht.
    return { name: server.name, ok: true, error: null };
  } catch (e) {
    return {
      name: server.name,
      ok: false,
      error: e instanceof Error ? e.message : 'nicht erreichbar',
    };
  }
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const servers = await Promise.all(httpServers.map(probe));
  const body = { fetchedAt: new Date().toISOString(), servers };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
};
