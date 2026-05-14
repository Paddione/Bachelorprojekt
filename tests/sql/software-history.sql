-- Run with: psql -v ON_ERROR_STOP=1 -f tests/sql/software-history.sql
-- Verifies v_software_stack / v_software_history behavior on a clean fixture.
BEGIN;
TRUNCATE bachelorprojekt.software_events CASCADE;
TRUNCATE bachelorprojekt.features CASCADE;

INSERT INTO bachelorprojekt.features (pr_number, title, category, merged_at, status)
VALUES
  (1, 'add mattermost',     'feat', '2025-01-01', 'shipped'),
  (2, 'remove mattermost',  'chore','2025-03-01', 'shipped'),
  (3, 'add nextcloud-talk', 'feat', '2025-03-02', 'shipped'),
  (4, 'unrelated doc fix',  'docs', '2025-04-01', 'shipped');

INSERT INTO bachelorprojekt.software_events (pr_number, service, area, kind, classifier) VALUES
  (1, 'mattermost',     'chat', 'added',      'manual'),
  (2, 'mattermost',     'chat', 'removed',    'manual'),
  (3, 'nextcloud-talk', 'chat', 'added',      'manual'),
  (4, 'docs',           'internal', 'irrelevant', 'manual');

-- Stack must contain nextcloud-talk, NOT mattermost, NOT docs.
DO $$
DECLARE r RECORD;
BEGIN
  IF (SELECT count(*) FROM bachelorprojekt.v_software_stack WHERE service='mattermost') <> 0 THEN
    RAISE EXCEPTION 'mattermost should not appear in v_software_stack';
  END IF;
  IF (SELECT count(*) FROM bachelorprojekt.v_software_stack WHERE service='nextcloud-talk') <> 1 THEN
    RAISE EXCEPTION 'nextcloud-talk should appear exactly once in v_software_stack';
  END IF;
  IF (SELECT count(*) FROM bachelorprojekt.v_software_stack WHERE service='docs') <> 0 THEN
    RAISE EXCEPTION 'irrelevant events must not appear in v_software_stack';
  END IF;
  IF (SELECT count(*) FROM bachelorprojekt.v_software_history) <> 3 THEN
    RAISE EXCEPTION 'v_software_history must hide irrelevant events; expected 3 rows';
  END IF;
END $$;
ROLLBACK;
\echo 'software-history SQL fixture OK'
