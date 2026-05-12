import type { Pool } from 'pg';

export interface MatchPlayerInsert {
  playerKey: string;
  displayName: string;
  brand: 'mentolder' | 'korczewski' | null;
  isBot: boolean;
  characterId: string;
  place: number;
  kills: number;
  deaths: number;
  forfeit: boolean;
}

export interface MatchInsert {
  lobbyCode: string;
  openedAt: Date;
  startedAt: Date;
  endedAt: Date;
  winnerPlayer: string | null;
  botCount: number;
  humanCount: number;
  forfeitCount: number;
  resultsJsonb: unknown;
  players: MatchPlayerInsert[];
}

export function makeRepo(pool: Pool) {
  return {
    async insertLobby(row: { code: string; phase: string; hostKey: string; expiresAt: Date }) {
      await pool.query(
        `INSERT INTO arena.lobbies (code, phase, host_key, expires_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (code) DO UPDATE SET phase = EXCLUDED.phase, expires_at = EXCLUDED.expires_at`,
        [row.code, row.phase, row.hostKey, row.expiresAt],
      );
    },

    async updateLobbyPhase(code: string, phase: string) {
      await pool.query(
        'UPDATE arena.lobbies SET phase = $2 WHERE code = $1', [code, phase],
      );
    },

    async insertMatchWithPlayers(m: MatchInsert): Promise<string> {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const { rows } = await c.query(
          `INSERT INTO arena.matches
            (lobby_code, opened_at, started_at, ended_at, winner_player,
             bot_count, human_count, forfeit_count, results_jsonb)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [m.lobbyCode, m.openedAt, m.startedAt, m.endedAt, m.winnerPlayer,
           m.botCount, m.humanCount, m.forfeitCount, JSON.stringify(m.resultsJsonb)],
        );
        const matchId = rows[0].id as string;
        for (const p of m.players) {
          await c.query(
            `INSERT INTO arena.match_players
              (match_id, player_key, display_name, brand, is_bot, character_id,
               place, kills, deaths, forfeit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [matchId, p.playerKey, p.displayName, p.brand, p.isBot, p.characterId,
             p.place, p.kills, p.deaths, p.forfeit],
          );
        }
        await c.query('COMMIT');
        return matchId;
      } catch (e) {
        await c.query('ROLLBACK');
        throw e;
      } finally {
        c.release();
      }
    },

    async getRecentMatches(limit = 20) {
      const { rows } = await pool.query(
        `SELECT id, lobby_code, started_at, ended_at, winner_player,
                bot_count, human_count, forfeit_count
         FROM arena.matches ORDER BY started_at DESC LIMIT $1`, [limit],
      );
      return rows;
    },
  };
}

export type Repo = ReturnType<typeof makeRepo>;