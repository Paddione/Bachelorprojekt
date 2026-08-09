-- scripts/migrations/2026-08-09-customer-projects-copy.sql
-- E4/T002722: Kundenprojekte aus tickets.tickets in public.customer_projects
-- kopieren und FK-Kanten umhaengen.
--
-- IDEMPOTENT: bei mehrfacher Ausfuehrung ohne Effekt (ON CONFLICT DO NOTHING,
-- DROP CONSTRAINT IF EXISTS).
--
-- Vorbedingung: alle drei FK-Kanten (meetings.project_id,
-- time_entries.project_id/task_id, questionnaire_assignments.project_id)
-- muessen unbelegt sein (0 Zeilen). Bricht ab, falls doch Zeilen
-- referenzieren — kein stiller Fortschritt bei ueberholter Messung.
BEGIN;

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM meetings WHERE project_id IS NOT NULL;
  SELECT n + count(*) INTO n FROM time_entries WHERE project_id IS NOT NULL OR task_id IS NOT NULL;
  SELECT n + count(*) INTO n FROM questionnaire_assignments WHERE project_id IS NOT NULL;
  IF n > 0 THEN
    RAISE EXCEPTION 'Vorbedingung verletzt: % Zeilen referenzieren tickets.tickets ueber project_id/task_id — Abbruch, siehe design.md D3', n;
  END IF;
END $$;

INSERT INTO public.customer_projects
  (id, parent_id, type, brand, title, description, notes, start_date, due_date,
   status, resolution, priority, customer_id, assignee_id, created_at, updated_at)
SELECT id, parent_id,
       CASE type WHEN 'chore' THEN 'task' ELSE type END,
       brand, title, description, notes, start_date, due_date,
       status, resolution, priority, customer_id, assignee_id, done_at, created_at, updated_at
FROM tickets.tickets
WHERE type = 'project'
   OR (type = 'chore' AND parent_id IN (SELECT id FROM tickets.tickets WHERE type = 'project'))
ON CONFLICT (id) DO NOTHING;

ALTER TABLE meetings DROP CONSTRAINT IF EXISTS meetings_project_id_fkey;
ALTER TABLE meetings ADD CONSTRAINT meetings_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;

ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_project_id_fkey;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE CASCADE;
ALTER TABLE time_entries DROP CONSTRAINT IF EXISTS time_entries_task_id_fkey;
ALTER TABLE time_entries ADD CONSTRAINT time_entries_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;

ALTER TABLE questionnaire_assignments DROP CONSTRAINT IF EXISTS questionnaire_assignments_project_id_fkey;
ALTER TABLE questionnaire_assignments ADD CONSTRAINT questionnaire_assignments_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.customer_projects(id) ON DELETE SET NULL;

COMMIT;
