import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import pinoHttp from 'pino-http';
import { loadConfig } from './config';
import { log } from './log';
import { makeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { makeRepo } from './db/repo';
import { Lifecycle } from './lobby/lifecycle';
import { makeRoutes } from './http/routes';
import { startWs } from './ws/server';
import { makeBroadcasters } from './ws/broadcasters';

async function main() {
  const cfg = loadConfig();
  log.info({ port: cfg.port }, 'arena-server starting');

  const { pool } = makeDb(cfg);
  await runMigrations(pool);
  const repo = makeRepo(pool);

  const app = express();
  app.use(pinoHttp({ logger: log as any }));
  app.use(express.json());

  const httpServer = createServer(app);
  const io = startWs(httpServer, cfg, /* lc set below */ null as any);
  const bc = makeBroadcasters(io);
  const lc = new Lifecycle({
    onBroadcast: (code) => bc.emitLobbyState(code),
    persist: repo,
  });
  // late-bind lc into ws layer
  (httpServer as any)._arenaLc = lc;
  io.use((socket, next) => { (socket as any).lc = lc; next(); });

  app.use('/', makeRoutes({ lc, repo }));

  httpServer.listen(cfg.port, () => log.info({ port: cfg.port }, 'arena-server listening'));

  const shutdown = async () => {
    log.info('shutdown begin');
    io.close();
    httpServer.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { log.error({ err: e.message, stack: e.stack }, 'fatal'); process.exit(1); });