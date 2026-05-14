CREATE SCHEMA IF NOT EXISTS arena;

CREATE TABLE IF NOT EXISTS arena.matches (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  lobby_code      char(6)       NOT NULL,
  opened_at       timestamptz   NOT NULL,
  started_at      timestamptz   NOT NULL,
  ended_at        timestamptz   NOT NULL,
  duration_s      integer       GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (ended_at - started_at))::int) STORED,
  winner_player   text          NULL,
  map             text          NOT NULL DEFAULT 'concrete-arena',
  bot_count       smallint      NOT NULL DEFAULT 0,
  human_count     smallint      NOT NULL,
  forfeit_count   smallint      NOT NULL DEFAULT 0,
  results_jsonb   jsonb         NOT NULL
);
CREATE INDEX IF NOT EXISTS matches_started_idx ON arena.matches (started_at DESC);

CREATE TABLE IF NOT EXISTS arena.match_players (
  match_id        uuid          NOT NULL REFERENCES arena.matches(id) ON DELETE CASCADE,
  player_key      text          NOT NULL,
  display_name    text          NOT NULL,
  brand           text REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT          NULL,
  is_bot          boolean       NOT NULL,
  character_id    text          NOT NULL,
  place           smallint      NOT NULL,
  kills           smallint      NOT NULL DEFAULT 0,
  deaths          smallint      NOT NULL DEFAULT 0,
  forfeit         boolean       NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, player_key)
);
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_players_brand_fkey') THEN
          ALTER TABLE arena.match_players ADD CONSTRAINT match_players_brand_fkey FOREIGN KEY (brand) REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT;
        END IF;
      END $$;
CREATE INDEX IF NOT EXISTS match_players_key_idx ON arena.match_players (player_key, match_id DESC);

CREATE TABLE IF NOT EXISTS arena.lobbies (
  code            char(6)       PRIMARY KEY,
  phase           text          NOT NULL,
  host_key        text          NOT NULL,
  opened_at       timestamptz   NOT NULL DEFAULT now(),
  expires_at      timestamptz   NOT NULL,
  state_jsonb     jsonb         NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS lobbies_phase_idx ON arena.lobbies (phase) WHERE phase != 'closed';