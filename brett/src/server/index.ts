import express from 'express';
import session from 'express-session';
import http from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import * as db from './db';
import * as auth from './auth';
import * as figures from './figures';
import * as phases from './phases';
import * as sessions from './sessions';
import * as rooms from './rooms';
import * as presets from './presets';
import * as permissions from './permissions';
import * as wsHandler from './ws-handler';
import * as wsAdminCommands from './ws-admin-commands';
import * as undoStackModule from './undo-stack';
import * as eventLog from './event-log';
import * as shareTokens from './share-tokens';
import { attachShareRoutes } from './share-routes';
import { attachSkinsUpload } from './skins-upload';

import { snapshotsRouter } from './routes/snapshots';
import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { presetsRouter } from './routes/presets';
import { boardTemplatesRouter } from './routes/board-templates';

// ── Dependency wiring (same order proven in Phase 2) ──────────────
phases.initPhases({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation });
db.initDb({ buildStateFromMutations: (room) => phases.buildStateFromMutations(room) });
// Run DB migrations on startup (idempotent). Skipped under MOCK_DB (tests).
if (process.env.MOCK_DB !== 'true') {
  db.runMigrations().catch(err => console.error('[brett] migration error:', err));
}
// Event-log initialization (Slice 5, T000472 — replay recording).
eventLog.initEventLog({ pool: db.getPool() });
sessions.initSessions({ figureMaps: figures.figureMaps, applyMutation: figures.applyMutation, transitionPhase: phases.transitionPhase });
figures.initFigures({ buildStateFromMutations: (room) => phases.buildStateFromMutations(room) });

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const SESSION_SECRET = process.env.BRETT_SESSION_SECRET || 'dev-session-secret-change-me';
export const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000,
  },
});

app.use(sessionMiddleware);
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path !== '/' && req.path !== '/index.html') return next();
  const redirect = auth.boardAuthRedirect(req, process.env);
  if (redirect) return res.redirect(redirect);
  next();
});

// In production (after `vite build`), serve from dist/client; in dev, fall back to public/.
const distClient = path.join(__dirname, '..', '..', 'dist', 'client');
const staticDir = fs.existsSync(path.join(distClient, 'index.html'))
  ? distClient
  : path.join(__dirname, '..', '..', 'public');
app.use(express.static(staticDir, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5m
    }
  }
}));

export { asyncHandler } from './helpers';

app.use(authRouter);
app.use(adminRouter);
app.use(snapshotsRouter);
app.use(presetsRouter);
app.use(boardTemplatesRouter);

// T000608: View-only-Share-Link-Routen (/share/:token + Token-CRUD).
attachShareRoutes(app, staticDir);

// ─── Skins upload (3D asset-generation pipeline target) ───────────────────────
attachSkinsUpload(app);

// Generic error handler so we never leak stack traces.
app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[brett] error:', err);
  res.status(500).json({ error: 'internal_error' });
});

export const server = http.createServer(app);
export const wss = new WebSocketServer({
  server,
  path: '/sync',
  maxPayload: 64 * 1024,
  verifyClient: (info: any, cb: any) => {
    try {
      const url = new URL(info.req.url, 'http://x');
      const room = url.searchParams.get('room');
      if (!room) return cb(true);
      const decision = sessions.shouldRejectReconnect(room, url.searchParams.get('playerId'));
      if (decision.reject) {
        return cb(false, decision.code, decision.message);
      }
      cb(true);
    } catch (err) {
      console.error('[brett] verifyClient error:', err);
      cb(true);
    }
  },
});

// T000470: Undo/Redo wrapper functions (figureMaps-injection)
function captureBeforeSnapshot(room: string, msg: any): Map<string, any | null> {
  return undoStackModule.captureBeforeSnapshot(room, msg, figures.figureMaps);
}
function captureAfterSnapshot(before: Map<string, any | null>, room: string, msg: any): Map<string, any | null> {
  return undoStackModule.captureAfterSnapshot(before, figures.figureMaps, room, msg);
}
function pushUndo(room: string, entry: undoStackModule.UndoEntry): void {
  undoStackModule.pushUndo(room, entry);
}
function performUndo(room: string) {
  return undoStackModule.performUndo(room, figures.figureMaps);
}
function performRedo(room: string) {
  return undoStackModule.performRedo(room, figures.figureMaps);
}
function getUndoStatus(room: string) {
  return undoStackModule.getUndoStatus(room);
}
function clearUndoStacks(room: string): void {
  undoStackModule.clearStacks(room);
}

const wsDeps = {
  joinRoom: rooms.joinRoom,
  leaveRoom: rooms.leaveRoom,
  broadcast: rooms.broadcast,
  broadcastRoleAware: rooms.broadcastRoleAware,
  broadcastInfo: rooms.broadcastInfo,
  addParticipant: rooms.addParticipant,
  removeParticipant: rooms.removeParticipant,
  clearParticipants: rooms.clearParticipants,
  listParticipants: rooms.listParticipants,
  figureMaps: figures.figureMaps,
  rooms: rooms.rooms,
  ensureFigureMap: figures.ensureFigureMap,
  seedFigureMapFromState: figures.seedFigureMapFromState,
  applyMutation: figures.applyMutation,
  buildStateFromMutations: phases.buildStateFromMutations,
  acquireFigureLock: figures.acquireFigureLock,
  releaseFigureLock: figures.releaseFigureLock,
  releaseLocksForUser: figures.releaseLocksForUser,
  orphanFiguresForUser: figures.orphanFiguresForUser,
  listFigureLocks: figures.listFigureLocks,
  canMutate: permissions.canMutate,
  resolveRole: permissions.resolveRole,
  validateAppearance: presets.validateAppearance,
  readState: db.readState,
  schedulePersist: db.schedulePersist,
  flushImmediate: db.flushImmediate,
  logEvent: eventLog.appendEvent,
  flushEventLog: eventLog.flushEventBuffer,
  handleAdminSessionCreate: sessions.handleAdminSessionCreate,
  handleAdminHandoffMessage: sessions.handleAdminHandoffMessage,
  handleAdminRoundStop: sessions.handleAdminRoundStop,
  handleAdminRoundPause: sessions.handleAdminRoundPause,
  handleAdminRoundStart: sessions.handleAdminRoundStart,
  handleAdminSetOptik: sessions.handleAdminSetOptik,
  handleAdminSetTemplate: sessions.handleAdminSetTemplate,
  loadSnapshotState: db.loadSnapshotState,
  applyTemplateToRoom: figures.applyTemplateToRoom,
  trackPlayerInRoom: sessions.trackPlayerInRoom,
  cleanupRoomTracking: sessions.cleanupRoomTracking,
  transitionPhase: phases.transitionPhase,
  isAdminFromClaims: auth.isAdminFromClaims,
  getAdminTokenHolder: sessions.getAdminTokenHolder,
  beginTokenGrace: sessions.beginTokenGrace,
  setRoomAdminPresence: sessions.setRoomAdminPresence,
  reclaimAdminToken: sessions.reclaimAdminToken,
  roomAdminPresence: sessions.roomAdminPresence,
  sessionMiddleware,
  captureBeforeSnapshot,
  captureAfterSnapshot,
  pushUndo,
  performUndo,
  performRedo,
  getUndoStatus,
  clearUndoStacks,
  resolveShareToken: shareTokens.resolveShareToken,
  resolveZuschauerToken: shareTokens.resolveZuschauerToken,
};

wsHandler.attachWsServer(wss, wsDeps);
wsHandler.startHeartbeat(wss);
wsAdminCommands.startIdleSweep({ checkAllSessions: sessions.checkAllSessions, broadcast: rooms.broadcast, schedulePersist: db.schedulePersist });

let shuttingDown = false;
export async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[brett] ${signal} received, flushing...`);
  // Flush event-log buffers before state (events should land before the snapshot).
  try { await eventLog.flushAll(); } catch (err) { console.error('[brett] shutdown event-log flush:', err); }
  const pending = db.getPending();
  for (const room of pending.keys()) {
    try { await db.flushImmediate(room); } catch (err) { console.error('[brett] shutdown flush:', err); }
  }
  server.close(() => {
    db.getPool().end()
      .catch((err: any) => console.error('[brett] pool.end:', err.message))
      .finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 25_000).unref();   // safety net under 30s grace
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const isMain = typeof require !== 'undefined' && require.main === module;
if (process.env.NODE_ENV !== 'test' && isMain) {
  server.listen(PORT, () => console.log(`brett listening on :${PORT}`));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}

// Re-export every symbol the test suite imports.
export {
  figures, phases, sessions, rooms, presets, permissions, auth, db, wsHandler
};
export const canMutate = permissions.canMutate;
export const resolveRole = permissions.resolveRole;
export const figureMaps = figures.figureMaps;
export const applyMutation = figures.applyMutation;
export const buildStateFromMutations = phases.buildStateFromMutations;
export const validateAppearance = presets.validateAppearance;
export const transitionPhase = phases.transitionPhase;
export const sessionCodeIndex = sessions.sessionCodeIndex;
export const RELAY_TYPES = Array.from(wsHandler.RELAY_TYPES);
export const ADMIN_TYPES = wsHandler.ADMIN_TYPES;
export const pool = db.getPool();
export const handleDisconnect = (ws: any) => wsHandler.handleDisconnect(ws, wsDeps);
export const resolvePlayerId = wsHandler.resolvePlayerId;
export const handleAssignRole = wsHandler.handleAssignRole;
export const handleLobbySetReady = wsHandler.handleLobbySetReady;
export const gateSessionReady = wsHandler.gateSessionReady;
export const onLeaderDisconnect = wsHandler.onLeaderDisconnect;
export const TRANSIENT_TYPES = new Set([]);

export const assignAdminToken = sessions.assignAdminToken;
export const handoffAdminToken = sessions.handoffAdminToken;
export const releaseAdminToken = sessions.releaseAdminToken;
export const getAdminTokenHolder = sessions.getAdminTokenHolder;
export const beginTokenGrace = sessions.beginTokenGrace;
export const reclaimAdminToken = sessions.reclaimAdminToken;
export const setRoomAdminPresence = sessions.setRoomAdminPresence;
export const handleAdminHandoffMessage = sessions.handleAdminHandoffMessage;
export const boardAuthRedirect = auth.boardAuthRedirect;

export { resolveE2eIdentity } from './routes/auth';
export { buildSnapshotListQuery, parseSnapshotInsert, canCreateTemplate } from './routes/snapshots';
export { resolveJoinTarget } from './routes/admin';
export { requireSession } from './auth';

export const resolveBrand = auth.resolveBrand;
export const buildConfig = auth.buildConfig;
export const isAdminFromClaims = auth.isAdminFromClaims;
export const touchSessionActivity = sessions.touchSessionActivity;
export const checkSessionIdle = sessions.checkSessionIdle;
export const checkAllSessions = sessions.checkAllSessions;
export const registerSessionCode = sessions.registerSessionCode;
export const generateSessionCode = sessions.generateSessionCode;
export const resolveSessionCode = sessions.resolveSessionCode;
export const rebuildSessionCodeIndexFromStates = sessions.rebuildSessionCodeIndexFromStates;
export const acquireFigureLock = figures.acquireFigureLock;
export const releaseFigureLock = figures.releaseFigureLock;
export const releaseLocksForUser = figures.releaseLocksForUser;
export const orphanFiguresForUser = figures.orphanFiguresForUser;
export const listFigureLocks = figures.listFigureLocks;
export const seedFigureMapFromState = figures.seedFigureMapFromState;
export const seedFiguresFromTemplate = figures.seedFiguresFromTemplate;
export const applyTemplateToRoom = figures.applyTemplateToRoom;
export const addParticipant = rooms.addParticipant;
export const removeParticipant = rooms.removeParticipant;
export const clearParticipants = rooms.clearParticipants;
export const listParticipants = rooms.listParticipants;
export const colorForIndex = rooms.colorForIndex;
export const trackPlayerInRoom = sessions.trackPlayerInRoom;
export const wasPreviouslyInRoom = sessions.wasPreviouslyInRoom;
export const shouldRejectReconnect = sessions.shouldRejectReconnect;
export const handleAdminSessionCreate = sessions.handleAdminSessionCreate;
export const handleAdminRoundStop = sessions.handleAdminRoundStop;
export const handleAdminRoundPause = sessions.handleAdminRoundPause;
export const handleAdminRoundStart = sessions.handleAdminRoundStart;
export const handleAdminSetOptik = sessions.handleAdminSetOptik;
export const handleAdminSetTemplate = sessions.handleAdminSetTemplate;
export const loadSnapshotState = db.loadSnapshotState;
export const tokenGraceTimers = sessions.tokenGraceTimers;
export const roomAdminPresence = sessions.roomAdminPresence;

export { app };

// T000470: Re-exports for test suite
export const undoStacks = undoStackModule.undoStacks;
export const redoStacks = undoStackModule.redoStacks;
export const UNDOABLE_TYPES = undoStackModule.UNDOABLE_TYPES;
export { undoStackModule };

