// Direct read-only access to the Nextcloud Talk DB (oc_talk_rooms).
//
// We need this because Talk's OCS API (GET /apps/spreed/api/v4/room) is
// user-scoped: it only lists rooms the authenticated user is a participant of.
// The website's NC admin account is rarely a participant of coaching-call
// rooms, so the OCS approach misses most active calls.
//
// Schema reference (Talk 14+): https://github.com/nextcloud/spreed
//   oc_talk_rooms.token         -- conversation token
//   oc_talk_rooms.name          -- internal name
//   oc_talk_rooms.active_since  -- timestamp the active call started (NULL = no call)
//   oc_talk_rooms.call_flag     -- bitmask, 0 = no call

import { Pool } from 'pg';

const NC_DB_HOST = process.env.NEXTCLOUD_DB_HOST || 'nextcloud-db.workspace.svc.cluster.local';
const NC_DB_PORT = parseInt(process.env.NEXTCLOUD_DB_PORT || '5432', 10);
const NC_DB_NAME = process.env.NEXTCLOUD_DB_NAME || 'nextcloud';
const NC_DB_USER = process.env.NEXTCLOUD_DB_USER || 'nextcloud';
const NC_DB_PASSWORD = process.env.NEXTCLOUD_DB_PASSWORD || '';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: NC_DB_HOST,
      port: NC_DB_PORT,
      database: NC_DB_NAME,
      user: NC_DB_USER,
      password: NC_DB_PASSWORD,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  }
  return pool;
}

export interface ActiveCallRoom {
  token: string;
  name: string;
  displayName: string;
  activeSince: Date | null;
}

export async function listActiveCallRooms(): Promise<ActiveCallRoom[]> {
  if (!NC_DB_PASSWORD) {
    console.error('[nc-talk-db] NEXTCLOUD_DB_PASSWORD is not set');
    return [];
  }
  try {
    const { rows } = await getPool().query<{
      token: string;
      name: string;
      active_since: Date | null;
    }>(
      `SELECT token, name, active_since
         FROM oc_talk_rooms
        WHERE active_since IS NOT NULL OR call_flag > 0
        ORDER BY active_since DESC NULLS LAST
        LIMIT 200`
    );
    return rows.map((r) => ({
      token: r.token,
      name: r.name ?? '',
      displayName: r.name ?? r.token,
      activeSince: r.active_since,
    }));
  } catch (err) {
    console.error('[nc-talk-db] listActiveCallRooms failed:', err);
    return [];
  }
}
