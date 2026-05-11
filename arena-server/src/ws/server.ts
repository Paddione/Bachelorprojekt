import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { verifyArenaJwt } from '../auth/jwt';
import type { Config } from '../config';
import type { Lifecycle } from '../lobby/lifecycle';
import { PROTOCOL_VERSION } from '../proto/messages';
import { attachHandlers } from './handlers';
import { log } from '../log';

const HANDSHAKES_PER_MIN_PER_IP = 60;
const handshakes = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const a = (handshakes.get(ip) ?? []).filter(t => now - t < 60_000);
  if (a.length >= HANDSHAKES_PER_MIN_PER_IP) { handshakes.set(ip, a); return false; }
  a.push(now); handshakes.set(ip, a); return true;
}

export function startWs(server: HttpServer, cfg: Config, lc: Lifecycle): Server {
  const io = new Server(server, { path: '/ws', cors: { origin: '*' } });

  io.use(async (socket, next) => {
    const ip = socket.handshake.address;
    if (!rateLimit(ip)) return next(new Error('rate limited'));
    const token = (socket.handshake.auth as any)?.token;
    const proto = (socket.handshake.auth as any)?.protocolVersion;
    if (proto !== PROTOCOL_VERSION) return next(new Error(`protocol mismatch: client=${proto} server=${PROTOCOL_VERSION}`));
    if (!token) return next(new Error('missing token'));
    try {
      const claims = await verifyArenaJwt(token, { trustedIssuers: cfg.issuers });
      (socket.data as any).user = claims;
      next();
    } catch (e: any) {
      log.warn({ err: e.message }, 'ws handshake rejected');
      next(new Error('unauthorised'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as any).user;
    log.info({ sub: user.sub, brand: user.brand }, 'ws connected');
    attachHandlers(socket, { lc, user });
  });

  return io;
}