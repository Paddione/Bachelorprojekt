import { pgSchema, uuid, char, text, smallint, boolean, integer, timestamp, jsonb, primaryKey } from 'drizzle-orm/pg-core';

export const arena = pgSchema('arena');

export const matches = arena.table('matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  lobbyCode: char('lobby_code', { length: 6 }).notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),
  winnerPlayer: text('winner_player'),
  map: text('map').notNull().default('concrete-arena'),
  botCount: smallint('bot_count').notNull().default(0),
  humanCount: smallint('human_count').notNull(),
  forfeitCount: smallint('forfeit_count').notNull().default(0),
  resultsJsonb: jsonb('results_jsonb').notNull(),
});

export const matchPlayers = arena.table('match_players', {
  matchId: uuid('match_id').notNull(),
  playerKey: text('player_key').notNull(),
  displayName: text('display_name').notNull(),
  brand: text('brand'),
  isBot: boolean('is_bot').notNull(),
  characterId: text('character_id').notNull(),
  place: smallint('place').notNull(),
  kills: smallint('kills').notNull().default(0),
  deaths: smallint('deaths').notNull().default(0),
  forfeit: boolean('forfeit').notNull().default(false),
}, (t) => ({ pk: primaryKey({ columns: [t.matchId, t.playerKey] }) }));

export const lobbies = arena.table('lobbies', {
  code: char('code', { length: 6 }).primaryKey(),
  phase: text('phase').notNull(),
  hostKey: text('host_key').notNull(),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  stateJsonb: jsonb('state_jsonb').notNull().default({}),
});