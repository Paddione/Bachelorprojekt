import crypto from 'crypto';
import { getPool, type MockPoolLike } from './db';
import type { Pool } from 'pg';

type PoolLike = Pool | MockPoolLike;

export async function createShareToken(
  roomToken: string,
  createdBy?: string,
  pool: PoolLike = getPool(),
): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by, token_type) VALUES ($1, $2, $3, 'share')`,
    [token, roomToken, createdBy ?? null],
  );
  return token;
}

export async function resolveShareToken(
  token: string,
  pool: PoolLike = getPool(),
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND token_type = 'share' AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

export async function disableShareToken(
  token: string,
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND token_type = 'share' AND disabled_at IS NULL`,
    [token, roomToken],
  );
  return ((res as any).rowCount ?? 0) > 0;
}

export async function listShareTokens(
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<{ token: string; created_at: Date; created_by: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND token_type = 'share' AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken],
  );
  return rows as any;
}

export async function createZuschauerToken(
  roomToken: string,
  createdBy?: string,
  pool: PoolLike = getPool(),
): Promise<string> {
  const token = crypto.randomBytes(18).toString('base64url');
  await pool.query(
    `INSERT INTO brett_share_tokens (token, room_token, created_by, token_type) VALUES ($1, $2, $3, 'zuschauer')`,
    [token, roomToken, createdBy ?? null],
  );
  return token;
}

export async function resolveZuschauerToken(
  token: string,
  pool: PoolLike = getPool(),
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT room_token FROM brett_share_tokens
     WHERE token = $1 AND token_type = 'zuschauer' AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
    [token],
  );
  return rows[0]?.room_token ?? null;
}

export async function listZuschauerTokens(
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<{ token: string; created_at: Date; created_by: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT token, created_at, created_by FROM brett_share_tokens
     WHERE room_token = $1 AND token_type = 'zuschauer' AND disabled_at IS NULL ORDER BY created_at DESC`,
    [roomToken],
  );
  return rows as any;
}

export async function disableZuschauerToken(
  token: string,
  roomToken: string,
  pool: PoolLike = getPool(),
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE brett_share_tokens SET disabled_at = now()
     WHERE token = $1 AND room_token = $2 AND token_type = 'zuschauer' AND disabled_at IS NULL`,
    [token, roomToken],
  );
  return ((res as any).rowCount ?? 0) > 0;
}
