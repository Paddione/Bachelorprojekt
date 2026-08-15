#!/usr/bin/env node
// scripts/mcp-gateway/mcp-postgres-local.mjs
// T002767 — lokaler MCP-Postgres-Server als Ersatz für den fleet-Monolith,
// der seit T002626 (lokal-primär) auf eine stale DB zeigt.
//
// Minimaler Read-Only-Query-Wrapper über node-postgres.
// Protokoll: Streamable HTTP (MCP 2024-11-05), Port 13001.

import { createServer } from 'node:http';
import pg from 'pg';

const { Pool } = pg;

const DB_URL = process.env.DATABASE_URL || 'postgresql://mcp_readonly@localhost:15432/website';
const PORT = parseInt(process.env.PORT || '13001', 10);

const pool = new Pool({
  connectionString: DB_URL,
  max: 5,
  idleTimeoutMillis: 30000,
  statement_timeout: 120000,
});

const serverInfo = {
  name: 'mcp-postgres-local',
  version: '1.0.0',
};

const tools = [
  {
    name: 'query',
    description:
      'Run a read-only SQL query against the local k3d postgres database. ' +
      'Only a single statement per call is accepted.',
    inputSchema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL query (read-only)' },
      },
      required: ['sql'],
    },
  },
];

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(body));
}

function rpc(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcErr(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleInitialize(_params) {
  return {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    serverInfo,
  };
}

async function handleToolsList() {
  return { tools };
}

const MUTATING_KEYWORDS = new Set([
  'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'TRUNCATE',
  'CREATE', 'DROP', 'ALTER', 'GRANT', 'REVOKE',
  'CALL', 'DO', 'COPY', 'VACUUM', 'REFRESH', 'SECURITY',
]);

// Tokenisiert SQL und erkennt Strings, Kommentare, Dollar-Quotes, E-Strings
// und Quoted Identifiers. Liefert Token-Liste der unquotierten Wörter sowie
// Kennzeichen ob nach einem Semikolon weitere Anweisungen folgen.
function tokenizeSql(sql) {
  const tokens = [];
  let isMulti = false;
  let seenSemicolon = false;
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const ch = sql[i];
    const next = sql[i + 1];

    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Zeilen-Kommentar: -- ...
    if (ch === '-' && next === '-') {
      i += 2;
      while (i < len && sql[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Block-Kommentar mit PG-Verschachtelung: /* ... /* ... */ ... */
    if (ch === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < len && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          i++;
        }
      }
      continue;
    }

    // Nicht-Whitespace / Nicht-Kommentar nach Semikolon -> zweites Statement
    if (seenSemicolon) {
      isMulti = true;
    }

    // Semikolon
    if (ch === ';') {
      seenSemicolon = true;
      i++;
      continue;
    }

    // C-Style Escape-String: E'...' oder e'...'
    if ((ch === 'E' || ch === 'e') && next === "'") {
      i += 2;
      while (i < len) {
        if (sql[i] === '\\') {
          i += 2;
        } else if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2; // '' Escape
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      continue;
    }

    // Einfaches String-Literal: '...'
    if (ch === "'") {
      i++;
      while (i < len) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2; // '' Escape
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      continue;
    }

    // Quoted Identifier: "..."
    if (ch === '"') {
      i++;
      while (i < len) {
        if (sql[i] === '"') {
          if (sql[i + 1] === '"') {
            i += 2; // "" Escape
          } else {
            i++;
            break;
          }
        } else {
          i++;
        }
      }
      continue;
    }

    // Dollar-Quoted String: $$...$$ oder $tag$...$tag$
    if (ch === '$') {
      const tagMatch = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (tagMatch) {
        const delimiter = tagMatch[0];
        const endIdx = sql.indexOf(delimiter, i + delimiter.length);
        if (endIdx !== -1) {
          i = endIdx + delimiter.length;
          continue;
        } else {
          i = len;
          continue;
        }
      }
    }

    // Unquotierte Bezeichner / Keywords
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (i < len && /[A-Za-z0-9_]/.test(sql[i])) {
        i++;
      }
      tokens.push(sql.slice(start, i).toUpperCase());
      continue;
    }

    // Operatoren, Zahlen, Klammern etc.
    i++;
  }

  return { tokens, isMulti };
}

function isMultiStatement(sql) {
  return tokenizeSql(sql).isMulti;
}

function validateQuery(sql) {
  const { tokens, isMulti } = tokenizeSql(sql);

  if (tokens.length === 0) {
    throw { code: -32602, message: 'Only read-only queries (SELECT/WITH/EXPLAIN) are allowed' };
  }

  const firstToken = tokens[0];
  if (firstToken !== 'SELECT' && firstToken !== 'WITH' && firstToken !== 'EXPLAIN') {
    throw { code: -32602, message: 'Only read-only queries (SELECT/WITH/EXPLAIN) are allowed' };
  }

  if (firstToken === 'WITH' || firstToken === 'EXPLAIN') {
    for (let i = 1; i < tokens.length; i++) {
      if (MUTATING_KEYWORDS.has(tokens[i])) {
        throw { code: -32602, message: 'Only read-only queries (SELECT/WITH/EXPLAIN) are allowed' };
      }
    }
  }

  if (isMulti) {
    throw { code: -32602, message: 'Only single-statement queries are supported' };
  }
}

async function handleToolsCall(params) {
  const { name, arguments: args } = params;
  if (name !== 'query') {
    throw { code: -32601, message: `Unknown tool: ${name}` };
  }
  const { sql } = args || {};
  if (!sql) {
    throw { code: -32602, message: 'Missing required parameter: sql' };
  }

  // Pre-DB guards: read-only validation & multi-statement check
  validateQuery(sql);

  let result;
  try {
    result = await pool.query(sql);
  } catch (err) {
    throw { code: -32000, message: `Query failed: ${err.message}` };
  }

  // Defensiv: falls pg doch mehrere Results liefert (Parser-Lücke im Scanner),
  // als Fehler melden statt result.rows (dort undefined) als leeres Array auszugeben.
  if (Array.isArray(result)) {
    throw { code: -32602, message: 'Only single-statement queries are supported' };
  }
  const rows = result.rows;

  const text = JSON.stringify(rows, null, 2);
  return {
    content: [{ type: 'text', text: text || '[]' }],
  };
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject({ code: -32700, message: 'Parse error' });
      }
    });
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    });
    res.end();
    return;
  }

  // Health endpoint
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  // MCP endpoint
  if (req.method === 'POST' && req.url === '/mcp') {
    let payload;
    try {
      payload = await getBody(req);
    } catch (err) {
      json(res, 400, rpcErr(null, err.code || -32700, err.message));
      return;
    }

    const { id, method, params } = payload;

    try {
      let result;
      switch (method) {
        case 'initialize':
          result = await handleInitialize(params);
          break;
        case 'tools/list':
          result = await handleToolsList();
          break;
        case 'tools/call':
          result = await handleToolsCall(params);
          break;
        case 'notifications/initialized':
          json(res, 200, rpc(id, {}));
          return;
        default:
          json(res, 200, rpcErr(id, -32601, `Method not found: ${method}`));
          return;
      }
      json(res, 200, rpc(id, result));
    } catch (err) {
      json(res, 200, rpcErr(id, err.code || -32603, err.message));
    }
    return;
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mcp-postgres-local] Listening on http://127.0.0.1:${PORT}`);
  console.log(`[mcp-postgres-local] DB: ${DB_URL.replace(/\/\/.*@/, '//***@')}`);
});
