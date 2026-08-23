-- scripts/migrations/2026-08-23-tickets-delete-guard-audit.sql
-- ═══════════════════════════════════════════════════════════════════════
-- T015009 — Ungeklärter Löschpfad auf tickets.tickets (Fall T014936 /
-- Incident T015005): Am 2026-08-23 zwischen 13:36 und 13:59 UTC verschwand
-- die non-test-data-Zeile T014936 spurlos. Forensik-Befund:
--
--   * tickets.tickets hatte KEINEN DELETE-Trigger — Löschungen hinterlassen
--     keine Spur (ticket_activity kaskadiert mit ON DELETE CASCADE weg).
--   * fn_audit_log() trackt external_id und is_test_data NICHT — eine
--     Ummarkierung oder ein ID-Rename wäre unsichtbar gewesen.
--   * Alle gecodeten Purge-Pfade (purge-fn-v*.sql, Website purge-all) sind
--     is_test_data-geschützt und forensisch ausgeschlossen; die Original-
--     Zeile war bis zu ihrem letzten Audit-Event is_test_data=false ohne
--     jede Markierungs-Änderung.
--   * Einziger legitimer non-test-data-Löschpfad im Produktionscode:
--     planning-office.ts cleanupEphemeral() (status='planning', nicht
--     gepinnt) — wird per app.allow_ticket_hard_delete freigegeben.
--
-- Dieser Fix schließt die Klasse in drei Schichten:
--   1. AUDIT   — tickets.ticket_delete_audit (ohne FK, überlebt CASCADE)
--                füllt sich per BEFORE DELETE Row-Trigger.
--   2. GUARD   — BEFORE DELETE blockiert non-test-data-Tickets außer mit
--                Session-Flag app.allow_ticket_hard_delete = 'true'.
--                is_test_data=true bleibt immer löschbar (Purge-Pfade).
--   3. LÜCKEN  — fn_audit_log() trackt ab jetzt auch external_id und
--                is_test_data (Rename/Ummarkierung wird sichtbar).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS / DROP+CREATE TRIGGER / CREATE OR
-- REPLACE FUNCTION — gefahrlos erneut ausführbar.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1) Überlebende Audit-Tabelle (bewusst OHNE FK: muss CASCADEs überleben)

CREATE TABLE IF NOT EXISTS tickets.ticket_delete_audit (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_uuid  uuid        NOT NULL,
  external_id  text,
  title        text,
  status       text,
  is_test_data boolean,
  snapshot     jsonb       NOT NULL,
  actor_label  text,
  deleted_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_delete_audit_deleted_at
  ON tickets.ticket_delete_audit (deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_delete_audit_external_id
  ON tickets.ticket_delete_audit (external_id);

-- ── 2a) Audit-Trigger: JEDER DELETE wird vor der Löschung festgehalten

CREATE OR REPLACE FUNCTION tickets.fn_ticket_delete_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO tickets.ticket_delete_audit
    (ticket_uuid, external_id, title, status, is_test_data, snapshot, actor_label)
  VALUES (
    OLD.id,
    OLD.external_id,
    OLD.title,
    OLD.status,
    OLD.is_test_data,
    to_jsonb(OLD),
    current_setting('app.user_label', true)
  );
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_delete_audit ON tickets.tickets;
CREATE TRIGGER trg_tickets_delete_audit
  BEFORE DELETE ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_delete_audit();

-- ── 2b) Guard-Trigger: non-test-data nur mit explizitem Freigabe-Flag

CREATE OR REPLACE FUNCTION tickets.fn_tickets_guard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.is_test_data THEN
    RETURN OLD;  -- Purge-/Cleanup-Pfade bleiben unangetastet
  END IF;
  IF coalesce(current_setting('app.allow_ticket_hard_delete', true), '') = 'true' THEN
    RETURN OLD;  -- bewusste Wartung (Sanierung, cleanupEphemeral)
  END IF;
  RAISE EXCEPTION
    'T015009: DELETE auf non-test-data Ticket % (%) blockiert. Bewusst? Session-Flag app.allow_ticket_hard_delete=''true'' setzen.',
    OLD.external_id, OLD.id;
END $$;

DROP TRIGGER IF EXISTS trg_tickets_guard_delete ON tickets.tickets;
CREATE TRIGGER trg_tickets_guard_delete
  BEFORE DELETE ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION tickets.fn_tickets_guard_delete();

-- ── 3) Audit-Lücken schließen: external_id + is_test_data tracken
-- (Auszug der getrackten Felder aus der bestehenden Funktion; die Liste hier
--  muss mit tickets.fn_audit_log() synchron gehalten werden.)

CREATE OR REPLACE FUNCTION tickets.fn_audit_log()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  actor_id_local UUID;
  actor_label_local TEXT;
  diff JSONB := '{}'::jsonb;
  tracked_field TEXT;
BEGIN
  BEGIN actor_id_local := current_setting('app.user_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN actor_id_local := NULL; END;
  BEGIN actor_label_local := current_setting('app.user_label', true);
  EXCEPTION WHEN OTHERS THEN actor_label_local := NULL; END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label, field, new_value)
    VALUES (NEW.id, actor_id_local, actor_label_local, '_created', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  FOR tracked_field IN SELECT unnest(ARRAY[
    'external_id','is_test_data',
    'status','resolution','priority','severity','assignee_id','customer_id',
    'reporter_id','reporter_email','title','description','url','component',
    'touched_files',
    'thesis_tag','parent_id','start_date','due_date','estimate_minutes'
  ]) LOOP
    IF (to_jsonb(OLD) -> tracked_field) IS DISTINCT FROM (to_jsonb(NEW) -> tracked_field) THEN
      diff := diff || jsonb_build_object(tracked_field,
        jsonb_build_object('old', to_jsonb(OLD) -> tracked_field,
                           'new', to_jsonb(NEW) -> tracked_field));
    END IF;
  END LOOP;

  IF diff <> '{}'::jsonb THEN
    INSERT INTO tickets.ticket_activity (ticket_id, actor_id, actor_label, field, old_value, new_value)
    VALUES (NEW.id, actor_id_local, actor_label_local, '_updated', NULL, diff);
  END IF;
  RETURN NEW;
END $$;
