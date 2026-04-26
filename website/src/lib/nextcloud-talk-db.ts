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

const BRETT_BOT_NAME = 'Systemisches Brett';

// Look up the brett bot's server-side id from oc_talk_bots_server.
async function getBrettBotId(): Promise<number | null> {
  try {
    const { rows } = await getPool().query<{ id: string }>(
      `SELECT id FROM oc_talk_bots_server WHERE name = $1 LIMIT 1`,
      [BRETT_BOT_NAME]
    );
    return rows.length === 0 ? null : parseInt(rows[0].id, 10);
  } catch (err) {
    console.error('[nc-talk-db] getBrettBotId failed:', err);
    return null;
  }
}

// Ensure the brett bot is enabled for the given conversation. Talk's
// `talk:bot:install` does NOT auto-enable a bot for every room — each room
// needs an explicit row in oc_talk_bots_conversation, normally created by
// `talk:bot:setup BOT_ID TOKEN`. Without this row, bot-reply HMAC fails
// with HTTP 401. We mirror that one-row insert here so /admin/brett/broadcast
// works for rooms the operator hasn't set up manually.
export async function ensureBrettBotEnabledForRoom(roomToken: string): Promise<boolean> {
  const botId = await getBrettBotId();
  if (botId === null) {
    console.error('[nc-talk-db] brett bot not found in oc_talk_bots_server');
    return false;
  }
  try {
    await getPool().query(
      `INSERT INTO oc_talk_bots_conversation (bot_id, token, state)
       SELECT $1::bigint, $2::text, 1::smallint
       WHERE NOT EXISTS (
         SELECT 1 FROM oc_talk_bots_conversation
         WHERE bot_id = $1::bigint AND token = $2::text
       )`,
      [botId, roomToken]
    );
    return true;
  } catch (err) {
    console.error('[nc-talk-db] ensureBrettBotEnabledForRoom failed:', err);
    return false;
  }
}
