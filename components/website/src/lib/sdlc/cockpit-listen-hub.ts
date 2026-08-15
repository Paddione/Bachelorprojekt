// cockpit-listen-hub.ts — Single-connection LISTEN distributor (T002643 Task 4)
//
// Holds exactly ONE long-lived pg.Client for LISTEN cockpit_events, created on
// first subscribe() and released on last unsubscribe(). A per-browser connection
// would be the intuitive choice but would exhaust the pool limit — LISTEN clients
// live forever, and the pool has a hard cap.
//
// On connection error: close, wait, reconnect if subscribers remain. After
// reconnect, emit { domain: 'reconnect' } so subscribers know they missed events
// and must re-read. A silent reconnect would show stale data labeled as live.

import { Client } from 'pg';
import { pool } from '../db-pool';

export type CockpitEvent = { domain: string; op: string; at: number };

type Subscriber = (ev: CockpitEvent) => void;

let client: Client | null = null;
const subscribers = new Set<Subscriber>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let listenActive = false;

const RECONNECT_DELAY_MS = 5_000;

function ensureClient(): Client {
  if (!client) {
    // Derive connection config from pool but create a standalone Client.
    // `options` is not in the public pg.PoolConfig typing — read via unknown.
    const poolOpts = (pool as unknown as { options?: object }).options;
    client = new Client(
      poolOpts && typeof poolOpts === 'object'
        ? { ...poolOpts }
        : { connectionString: process.env.SESSIONS_DATABASE_URL || process.env.DATABASE_URL },
    );
  }
  return client;
}

async function connect(): Promise<void> {
  if (listenActive) return;
  const c = ensureClient();
  try {
    await c.connect();
    await c.query('LISTEN cockpit_events');
    listenActive = true;
  } catch {
    // Connection failed — schedule reconnect if subscribers exist
    scheduleReconnect();
    return;
  }

  c.on('notification', (msg) => {
    if (!msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload) as CockpitEvent;
      for (const fn of subscribers) {
        try { fn(payload); } catch { /* subscriber error must not kill the hub */ }
      }
    } catch { /* malformed payload — ignore */ }
  });

  c.on('error', () => {
    listenActive = false;
    teardownClient();
    scheduleReconnect();
  });

  c.on('end', () => {
    listenActive = false;
    teardownClient();
    if (subscribers.size > 0) scheduleReconnect();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  if (subscribers.size === 0) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect().then(() => {
      // After reconnect, tell subscribers they may have missed events
      const reconnectEvent: CockpitEvent = { domain: 'reconnect', op: 'reconnect', at: Date.now() / 1000 };
      for (const fn of subscribers) {
        try { fn(reconnectEvent); } catch { /* swallow */ }
      }
    }).catch(() => { /* will retry on next scheduleReconnect call */ });
  }, RECONNECT_DELAY_MS);
}

function teardownClient(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (client) {
    try { client.removeAllListeners(); } catch { /* ignore */ }
    try { client.end(); } catch { /* ignore */ }
    client = null;
  }
  listenActive = false;
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn);
  if (subscribers.size === 1) {
    void connect();
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      teardownClient();
    }
  };
}

export function subscriberCount(): number {
  return subscribers.size;
}
