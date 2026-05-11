import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from './migrate';
import { makeRepo, type MatchInsert } from './repo';

const url = process.env.TEST_DB_URL;
const d = url ? describe : describe.skip;

let pool: Pool;
let repo: ReturnType<typeof makeRepo>;

d('repo (integration)', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: url });
    await runMigrations(pool);
    repo = makeRepo(pool);
  });

  afterAll(async () => { await pool.end(); });

  it('inserts a match with its players in one transaction', async () => {
    const now = new Date();
    const match: MatchInsert = {
      lobbyCode: 'TST001',
      openedAt: new Date(now.getTime() - 60_000),
      startedAt: new Date(now.getTime() - 30_000),
      endedAt: now,
      winnerPlayer: 'user-1@mentolder',
      botCount: 2,
      humanCount: 2,
      forfeitCount: 0,
      resultsJsonb: { tickCount: 0 },
      players: [
        { playerKey: 'user-1@mentolder', displayName: 'patrick', brand: 'mentolder',
          isBot: false, characterId: 'blonde-guy', place: 1, kills: 0, deaths: 0, forfeit: false },
        { playerKey: 'bot_1', displayName: 'Bot 1', brand: null,
          isBot: true, characterId: 'brown-guy', place: 2, kills: 0, deaths: 1, forfeit: false },
      ],
    };
    const matchId = await repo.insertMatchWithPlayers(match);
    expect(matchId).toMatch(/^[0-9a-f-]{36}$/);
    const got = await pool.query(
      'SELECT count(*)::int AS n FROM arena.match_players WHERE match_id = $1', [matchId],
    );
    expect(got.rows[0].n).toBe(2);
  });
});