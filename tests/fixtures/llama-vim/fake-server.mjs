import http from 'node:http';
import fs from 'node:fs';
import url from 'node:url';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port-file' && i + 1 < args.length) {
      opts.portFile = args[++i];
    } else if (args[i] === '--closed-port-file' && i + 1 < args.length) {
      opts.closedPortFile = args[++i];
    }
  }
  return opts;
}

const opts = parseArgs();

if (opts.closedPortFile) {
  const dummy = http.createServer();
  dummy.listen(0, '127.0.0.1', () => {
    const port = dummy.address().port;
    dummy.close(() => {
      fs.writeFileSync(opts.closedPortFile, String(port));
      process.exit(0);
    });
  });
} else if (opts.portFile) {
  const statsMap = new Map();

  function getStats(scenario) {
    if (!statsMap.has(scenario)) {
      statsMap.set(scenario, {
        requests: {},
        closed_early: 0,
        first_write_ms: 0,
        end_ms: 0,
      });
    }
    return statsMap.get(scenario);
  }

  const server = http.createServer(async (req, res) => {
    const reqUrl = url.parse(req.url, true);
    const pathname = reqUrl.pathname;

    if (pathname.startsWith('/__stats/')) {
      const scenario = pathname.slice('/__stats/'.length);
      const st = getStats(scenario);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(st));
      return;
    }

    // Match /s/<scenario>/<rest>
    const match = pathname.match(/^\/s\/([^\/]+)\/(.+)$/);
    if (!match) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const scenario = match[1];
    const route = match[2];
    const st = getStats(scenario);
    st.requests[route] = (st.requests[route] || 0) + 1;
    const reqCount = st.requests[route];

    // Read body if POST
    let body = '';
    req.on('data', chunk => { body += chunk; });
    await new Promise(resolve => req.on('end', resolve));

    if (route === 'health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (route === 'props') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ default_generation_settings: { n_ctx: 24576 } }));
      return;
    }
    if (route === 'v1/models') {
      if (scenario === 'models-nofim') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'plain-chat' }] }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          data: [
            { id: 'plain-chat' },
            { id: 'fim-a', capabilities: ['infill'] },
            { id: 'fim-b', capabilities: ['fim'] }
          ]
        }));
      }
      return;
    }

    if (route !== 'infill') {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    // Handle scenario for infill
    if (scenario === 'http-400') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad request' }));
      return;
    }
    if (scenario === 'http-503-always') {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'service unavailable' }));
      return;
    }
    if (scenario === 'http-503-once' && reqCount === 1) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'service unavailable' }));
      return;
    }
    if (scenario === 'http-429-once' && reqCount === 1) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'rate limited' }));
      return;
    }
    if (scenario === 'malformed') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {kaputt\n\n');
      return;
    }
    if (scenario === 'final-json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content: 'final completion text' }));
      return;
    }
    if (scenario === 'stall') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      // do not send any body
      return;
    }

    if (scenario === 'ndjson-split') {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      const chunks = [
        '{"content": "',
        'alpha"}\n{"content": "beta"}\n{"content": "',
        'gamma"}\n'
      ];
      for (const chunk of chunks) {
        res.write(chunk);
        await new Promise(r => setTimeout(r, 20));
      }
      res.end();
      return;
    }

    if (scenario === 'slow') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      st.first_write_ms = Date.now();
      res.write('data: {"content": "one"}\n\n');
      await new Promise(r => setTimeout(r, 600));
      res.write('data: {"content": "two"}\n\n');
      await new Promise(r => setTimeout(r, 600));
      res.write('data: {"content": "three"}\n\ndata: [DONE]\n\n');
      st.end_ms = Date.now();
      res.end();
      return;
    }

    if (scenario === 'repeat') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      let aborted = false;
      req.on('close', () => {
        if (!res.writableEnded) {
          aborted = true;
          st.closed_early++;
        }
      });
      for (let i = 0; i < 200 && !aborted; i++) {
        res.write('data: {"content": "repeat_token "}\n\n');
        await new Promise(r => setTimeout(r, 20));
      }
      if (!aborted) res.end();
      return;
    }

    if (scenario === 'supersede') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (reqCount === 1) {
        let aborted = false;
        req.on('close', () => { aborted = true; st.closed_early++; });
        for (let i = 0; i < 15 && !aborted; i++) {
          res.write('data: {"content": "AAA"}\n\n');
          await new Promise(r => setTimeout(r, 100));
        }
        if (!aborted) res.end();
      } else {
        res.write('data: {"content": "BBB"}\n\ndata: [DONE]\n\n');
        res.end();
      }
      return;
    }

    // Default or sse-split or (http-503-once / http-429-once after 1st req)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    st.first_write_ms = Date.now();
    // Split SSE across write calls
    res.write('data: {"content": "first ');
    await new Promise(r => setTimeout(r, 20));
    res.write('part"}\n:comment line\ndata: {"content": " second');
    await new Promise(r => setTimeout(r, 20));
    res.write(' part"}\n\ndata: [DONE]\n\n');
    st.end_ms = Date.now();
    res.end();
  });

  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    fs.writeFileSync(opts.portFile, String(port));
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
