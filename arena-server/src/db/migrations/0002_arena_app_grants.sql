-- Idempotent role creation; password set by bootstrap Job from SealedSecret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'arena_app') THEN
    CREATE ROLE arena_app LOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA arena TO arena_app;
GRANT SELECT, INSERT, UPDATE ON arena.matches       TO arena_app;
GRANT SELECT, INSERT, UPDATE ON arena.match_players TO arena_app;
GRANT SELECT, INSERT, UPDATE ON arena.lobbies       TO arena_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA arena
  GRANT SELECT, INSERT, UPDATE ON TABLES TO arena_app;