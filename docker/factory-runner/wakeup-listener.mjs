// Wakeup-Listener für factory-tick — T900110
// Empfängt HTTP-POST /wakeup, führt scripts/factory/wakeup.sh aus, streamed Ausgabe,
// gibt WAKEUP_EXIT=<code> zurück. Keine Request-Daten gehen an wakeup.sh.

import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.WAKEUP_LISTEN_PORT || 8787);
const REPO = process.env.FACTORY_REPO || '/workspace';

let busy = false;
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200);
    res.end('ok\n');
    return;
  }

  if (req.method === 'POST' && req.url === '/wakeup') {
    if (busy) {
      res.writeHead(409);
      res.end('WAKEUP_EXIT=busy\n');
      return;
    }

    busy = true;
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });

    const proc = spawn('bash', [`${REPO}/scripts/factory/wakeup.sh`], {
      cwd: REPO,
      env: process.env,
    });

    proc.stdout.on('data', (data) => {
      res.write(data);
    });

    proc.stderr.on('data', (data) => {
      res.write(data);
    });

    proc.on('close', (code) => {
      res.end(`WAKEUP_EXIT=${code ?? 'signal'}\n`);
      busy = false;
    });

    proc.on('error', () => {
      res.end('WAKEUP_EXIT=spawn-error\n');
      busy = false;
    });

    return;
  }

  if (req.method === 'GET' && req.url === '/wakeup') {
    res.writeHead(405);
    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

process.on('SIGTERM', () => {
  server.close(() => {
    // shutdown
  });
});

server.listen(PORT, () => {
  console.log(`wakeup-listener on :${PORT}`);
});
