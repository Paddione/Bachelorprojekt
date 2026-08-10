-- LLM-Proxy Dispatch-Mitschnitt — T003277
-- 2026-08-10 — Haelt Request/Response-Paare jedes /v1/*-POST fest, der durch den
-- lokalen Proxy (scripts/llm-proxy/server.mjs, Port 18235) laeuft. Geschrieben
-- wird gebuendelt aus scripts/llm-proxy/request-log.mjs, gelesen von
-- website/src/pages/sdlc/api/llm-proxy/requests*.ts.
--
-- Aufbewahrung: 14 Tage via `task maintenance:dispatch-log-cleanup`.
--
-- Warum hier und nicht in ai_call_log: jene Tabelle liegt in der mentolder-DB,
-- gehoert der Rolle `website` und speichert bewusst KEINE Bodies. Sie ist das
-- Vorbild fuer Retention und Fire-and-forget, nicht der Zielort.
--
-- Idempotent; guarded mit to_regnamespace(), weil dieses Verzeichnis von jedem
-- Marken-Migrationslauf gelesen wird und nacktes DDL dort abbraeche, wo das
-- tickets-Schema fehlt.
DO $$
BEGIN
  IF to_regnamespace('tickets') IS NOT NULL THEN

    CREATE TABLE IF NOT EXISTS tickets.llm_proxy_request_log (
      id                bigserial PRIMARY KEY,
      ts                timestamptz NOT NULL DEFAULT now(),
      backend           text        NOT NULL,
      requested_model   text,
      served_model      text,
      subpath           text        NOT NULL,
      http_status       integer,
      duration_ms       integer,
      queue_wait_ms     integer,
      prompt_tokens     integer,
      completion_tokens integer,
      streamed          boolean     NOT NULL DEFAULT false,
      -- Der Strom endete vor dem Abschlusssignal des Backends. Die Zeile wird
      -- trotzdem geschrieben: eine fehlende Zeile waere von "dieser Dispatch
      -- fand nie statt" nicht zu unterscheiden.
      stream_incomplete boolean     NOT NULL DEFAULT false,
      -- Body ueber 256 KiB gekappt; original_bytes traegt die Groesse davor.
      truncated         boolean     NOT NULL DEFAULT false,
      original_bytes    bigint,
      -- Korrelation. Bleibt NULL, wenn der Aufrufer die Header nicht sendet —
      -- nicht geraten, siehe design.md D6.
      slot_id           integer,
      dispatch_ticket   text,
      dispatch_partial  text,
      request_body      text,
      response_body     text
    );

    -- Listenabfrage des Panels (neueste zuerst).
    CREATE INDEX IF NOT EXISTS llm_proxy_request_log_ts
      ON tickets.llm_proxy_request_log (ts DESC);
    -- Zuordnung zu einem Vorgang. Partiell: die grosse Mehrheit der Zeilen
    -- traegt kein Ticket, die haetten den Index nur aufgeblaeht.
    CREATE INDEX IF NOT EXISTS llm_proxy_request_log_ticket
      ON tickets.llm_proxy_request_log (dispatch_ticket, ts DESC)
      WHERE dispatch_ticket IS NOT NULL;
    -- Bewusst KEIN Index auf request_body/response_body: sie werden nie
    -- gesucht, nur einzeln gelesen, und liegen wegen ihrer Groesse in TOAST.

    -- Push ans Cockpit ueber den bestehenden Kanal. Die Triggerfunktion aus
    -- 20260804_cockpit_notify_triggers.sql wird wiederverwendet; sie sendet nur
    -- Kennfelder, weil pg_notify ueber 8000 Byte hart abbricht — ein Body darin
    -- liesse den INSERT scheitern und der Mitschnitt braeche den Dispatch, den
    -- er beobachten soll.
    IF to_regprocedure('tickets.cockpit_notify()') IS NOT NULL THEN
      DROP TRIGGER IF EXISTS cockpit_notify_dispatch ON tickets.llm_proxy_request_log;
      CREATE TRIGGER cockpit_notify_dispatch
        AFTER INSERT ON tickets.llm_proxy_request_log
        FOR EACH ROW EXECUTE FUNCTION tickets.cockpit_notify('dispatch');
    END IF;

    -- factory_psql verbindet als `website` (scripts/factory/lib.sh).
    GRANT SELECT, INSERT, DELETE ON tickets.llm_proxy_request_log TO website;
    GRANT USAGE, SELECT ON SEQUENCE tickets.llm_proxy_request_log_id_seq TO website;

  END IF;
END $$;
