-- ═══════════════════════════════════════════════════════════════════
-- Tracking Database — Shared requirement/issue tracking for all services
-- One PostgreSQL database, one schema per service
-- ═══════════════════════════════════════════════════════════════════

-- ─── Schemas ───────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS bachelorprojekt;
CREATE SCHEMA IF NOT EXISTS assetgenerator;
CREATE SCHEMA IF NOT EXISTS k3d_dev;

-- ═══════════════════════════════════════════════════════════════════
-- Shared types (in public schema, reused by all services)
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE public.req_category AS ENUM (
    'Funktionale Anforderung',
    'Sicherheitsanforderung',
    'Nicht-Funktionale Anforderung',
    'Abnahmekriterium',
    'Auslieferbares Objekt',
    'BUG',
    'TASK'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM (
    'idea','implementation','testing','documentation','archive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.pipeline_status AS ENUM (
    'pending','in_progress','done','fail','skip'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.test_status AS ENUM ('pass','fail','skip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.feature_priority AS ENUM (
    'must_have','should_have','nice_to_have','wont_have'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Template: create identical table sets in each schema
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.create_tracking_tables(schema_name TEXT) RETURNS void AS $$
BEGIN
  -- Requirements table
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.requirements (
      id                  TEXT PRIMARY KEY,
      category            public.req_category NOT NULL,
      name                TEXT NOT NULL,
      description         TEXT,
      acceptance_criteria TEXT,
      test_cases          TEXT,
      automated           BOOLEAN DEFAULT FALSE,
      priority            public.feature_priority DEFAULT ''nice_to_have'',
      dev_stage           public.pipeline_stage DEFAULT ''idea'',
      created_at          TIMESTAMPTZ DEFAULT now(),
      updated_at          TIMESTAMPTZ DEFAULT now()
    )', schema_name);

  -- Pipeline stages per requirement
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.pipeline (
      req_id      TEXT NOT NULL REFERENCES %I.requirements(id) ON DELETE CASCADE,
      stage       public.pipeline_stage NOT NULL,
      status      public.pipeline_status DEFAULT ''pending'',
      updated_at  TIMESTAMPTZ DEFAULT now(),
      commit_ref  TEXT,
      notes       TEXT,
      PRIMARY KEY (req_id, stage)
    )', schema_name, schema_name);

  -- Pipeline history — records every phase transition with timestamp
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.pipeline_history (
      id          SERIAL PRIMARY KEY,
      req_id      TEXT NOT NULL REFERENCES %I.requirements(id) ON DELETE CASCADE,
      from_stage  public.pipeline_stage,
      to_stage    public.pipeline_stage NOT NULL,
      from_status public.pipeline_status,
      to_status   public.pipeline_status NOT NULL,
      changed_at  TIMESTAMPTZ DEFAULT now(),
      changed_by  TEXT
    )', schema_name, schema_name);

  -- Trigger function: log pipeline changes and update dev_stage
  EXECUTE format('
    CREATE OR REPLACE FUNCTION %I.log_pipeline_change() RETURNS trigger AS $t$
    BEGIN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO %I.pipeline_history
          (req_id, from_stage, to_stage, from_status, to_status)
        VALUES
          (NEW.req_id, OLD.stage, NEW.stage, OLD.status, NEW.status);
        -- Update dev_stage to the most advanced active stage
        IF NEW.status IN (''in_progress'', ''done'') THEN
          UPDATE %I.requirements SET dev_stage = NEW.stage, updated_at = now()
          WHERE id = NEW.req_id;
        END IF;
      END IF;
      NEW.updated_at := now();
      RETURN NEW;
    END; $t$ LANGUAGE plpgsql;
  ', schema_name, schema_name, schema_name);

  -- Attach trigger (drop first to allow re-runs)
  EXECUTE format('
    DROP TRIGGER IF EXISTS trg_pipeline_history ON %I.pipeline;
    CREATE TRIGGER trg_pipeline_history
      BEFORE UPDATE ON %I.pipeline
      FOR EACH ROW
      EXECUTE FUNCTION %I.log_pipeline_change();
  ', schema_name, schema_name, schema_name);

  -- Test runs (one row per execution)
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.test_runs (
      id          SERIAL PRIMARY KEY,
      run_date    TIMESTAMPTZ NOT NULL DEFAULT now(),
      tier        TEXT NOT NULL,
      host        TEXT,
      total       INTEGER DEFAULT 0,
      pass        INTEGER DEFAULT 0,
      fail        INTEGER DEFAULT 0,
      skip        INTEGER DEFAULT 0,
      json_path   TEXT
    )', schema_name);

  -- Individual test results
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.test_results (
      id          SERIAL PRIMARY KEY,
      run_id      INTEGER NOT NULL REFERENCES %I.test_runs(id) ON DELETE CASCADE,
      req_id      TEXT NOT NULL,
      test_name   TEXT NOT NULL,
      description TEXT,
      status      public.test_status,
      duration_ms INTEGER,
      detail      TEXT
    )', schema_name, schema_name);

  -- Issues / bug tracking
  EXECUTE format('
    CREATE TABLE IF NOT EXISTS %I.issues (
      id          SERIAL PRIMARY KEY,
      req_id      TEXT REFERENCES %I.requirements(id) ON DELETE SET NULL,
      title       TEXT NOT NULL,
      description TEXT,
      severity    TEXT CHECK (severity IN (''critical'',''high'',''medium'',''low'')),
      status      TEXT DEFAULT ''open'' CHECK (status IN (''open'',''in_progress'',''resolved'',''wontfix'')),
      assignee    TEXT,
      gh_issue    INTEGER,
      created_at  TIMESTAMPTZ DEFAULT now(),
      resolved_at TIMESTAMPTZ
    )', schema_name, schema_name);

  -- ─── Views ─────────────────────────────────────────────────────

  -- Pipeline overview (pivot) with priority and dev_stage
  EXECUTE format('
    CREATE OR REPLACE VIEW %I.v_pipeline_status AS
    SELECT
      r.id, r.category, r.name, r.priority, r.dev_stage,
      MAX(CASE WHEN p.stage = ''idea''           THEN p.status::text END) AS idea,
      MAX(CASE WHEN p.stage = ''implementation'' THEN p.status::text END) AS implementation,
      MAX(CASE WHEN p.stage = ''testing''        THEN p.status::text END) AS testing,
      MAX(CASE WHEN p.stage = ''documentation''  THEN p.status::text END) AS documentation,
      MAX(CASE WHEN p.stage = ''archive''        THEN p.status::text END) AS archive
    FROM %I.requirements r
    LEFT JOIN %I.pipeline p ON p.req_id = r.id
    GROUP BY r.id, r.category, r.name, r.priority, r.dev_stage
    ORDER BY
      CASE r.priority
        WHEN ''must_have''    THEN 1
        WHEN ''should_have''  THEN 2
        WHEN ''nice_to_have'' THEN 3
        WHEN ''wont_have''    THEN 4
      END,
      r.category, r.id
  ', schema_name, schema_name, schema_name);

  -- Pipeline timeline — transition history
  EXECUTE format('
    CREATE OR REPLACE VIEW %I.v_pipeline_timeline AS
    SELECT
      h.req_id, r.name AS req_name,
      h.from_stage, h.to_stage,
      h.from_status, h.to_status,
      h.changed_at, h.changed_by
    FROM %I.pipeline_history h
    JOIN %I.requirements r ON r.id = h.req_id
    ORDER BY h.changed_at DESC
  ', schema_name, schema_name, schema_name);

  -- Latest test results
  EXECUTE format('
    CREATE OR REPLACE VIEW %I.v_latest_tests AS
    SELECT
      tr.req_id, tr.test_name, tr.status, tr.duration_ms, tr.detail,
      t.run_date, t.tier
    FROM %I.test_results tr
    JOIN %I.test_runs t ON t.id = tr.run_id
    WHERE t.id = (SELECT MAX(id) FROM %I.test_runs)
    ORDER BY tr.req_id, tr.test_name
  ', schema_name, schema_name, schema_name, schema_name);

  -- Progress summary
  EXECUTE format('
    CREATE OR REPLACE VIEW %I.v_progress_summary AS
    SELECT
      stage,
      COUNT(*) FILTER (WHERE status = ''done'')        AS done,
      COUNT(*) FILTER (WHERE status = ''in_progress'')  AS in_progress,
      COUNT(*) FILTER (WHERE status = ''fail'')         AS failed,
      COUNT(*) FILTER (WHERE status = ''pending'')      AS pending,
      COUNT(*) FILTER (WHERE status = ''skip'')         AS skipped,
      COUNT(*)                                           AS total
    FROM %I.pipeline
    GROUP BY stage
    ORDER BY CASE stage
      WHEN ''idea''           THEN 1
      WHEN ''implementation'' THEN 2
      WHEN ''testing''        THEN 3
      WHEN ''documentation''  THEN 4
      WHEN ''archive''        THEN 5
    END
  ', schema_name, schema_name);

  -- Open issues
  EXECUTE format('
    CREATE OR REPLACE VIEW %I.v_open_issues AS
    SELECT i.*, r.name AS req_name, r.category AS req_category
    FROM %I.issues i
    LEFT JOIN %I.requirements r ON r.id = i.req_id
    WHERE i.status IN (''open'', ''in_progress'')
    ORDER BY
      CASE i.severity
        WHEN ''critical'' THEN 1
        WHEN ''high''     THEN 2
        WHEN ''medium''   THEN 3
        WHEN ''low''      THEN 4
      END,
      i.created_at
  ', schema_name, schema_name, schema_name);

  RAISE NOTICE 'Created tracking tables in schema %', schema_name;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════
-- Create tables for each service
-- ═══════════════════════════════════════════════════════════════════

SELECT public.create_tracking_tables('bachelorprojekt');
SELECT public.create_tracking_tables('assetgenerator');
SELECT public.create_tracking_tables('k3d_dev');

-- ═══════════════════════════════════════════════════════════════════
-- Cross-service views (in public schema)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_all_requirements AS
  SELECT 'bachelorprojekt' AS service, id, category, name, priority, dev_stage, created_at FROM bachelorprojekt.requirements
  UNION ALL
  SELECT 'assetgenerator'  AS service, id, category, name, priority, dev_stage, created_at FROM assetgenerator.requirements
  UNION ALL
  SELECT 'k3d_dev'         AS service, id, category, name, priority, dev_stage, created_at FROM k3d_dev.requirements;

CREATE OR REPLACE VIEW public.v_all_open_issues AS
  SELECT 'bachelorprojekt' AS service, id, title, severity, status, assignee, created_at FROM bachelorprojekt.issues WHERE status IN ('open','in_progress')
  UNION ALL
  SELECT 'assetgenerator'  AS service, id, title, severity, status, assignee, created_at FROM assetgenerator.issues WHERE status IN ('open','in_progress')
  UNION ALL
  SELECT 'k3d_dev'         AS service, id, title, severity, status, assignee, created_at FROM k3d_dev.issues WHERE status IN ('open','in_progress')
  ORDER BY
    CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
    created_at;

CREATE OR REPLACE VIEW public.v_all_progress AS
  SELECT 'bachelorprojekt' AS service, stage, status, count(*) AS cnt FROM bachelorprojekt.pipeline GROUP BY stage, status
  UNION ALL
  SELECT 'assetgenerator'  AS service, stage, status, count(*) AS cnt FROM assetgenerator.pipeline GROUP BY stage, status
  UNION ALL
  SELECT 'k3d_dev'         AS service, stage, status, count(*) AS cnt FROM k3d_dev.pipeline GROUP BY stage, status;

-- ═══════════════════════════════════════════════════════════════════
-- Seed data: Bachelorprojekt requirements (FA-01 through FA-15)
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO bachelorprojekt.requirements (id, category, name, description, acceptance_criteria, test_cases, automated, priority) VALUES
  -- ─── Core MVP (must_have) ──────────────────────────────────────
  ('FA-01', 'FA', 'Messaging (Echtzeit)',
   'Echtzeit-Chat mit Threads, Formatierung und Emoji-Reaktionen via Mattermost.',
   '1) Nachrichten in Echtzeit zustellbar\n2) Thread-Antworten moeglich\n3) Markdown-Formatierung\n4) Emoji-Reaktionen',
   'T1: Nachricht senden → Empfaenger sieht sofort\nT2: Thread oeffnen → Antwort sichtbar\nT3: Markdown testen → korrekt gerendert',
   TRUE, 'must_have'),
  ('FA-02', 'FA', 'Kanaele / Workspaces',
   'Teams, oeffentliche/private Kanaele, Archivierung in Mattermost.',
   '1) Oeffentliche und private Kanaele erstellbar\n2) Team-Zuordnung\n3) Archivierung moeglich',
   'T1: Kanal erstellen → sichtbar fuer Team\nT2: Privater Kanal → nur fuer Mitglieder\nT3: Kanal archivieren → nicht mehr aktiv',
   TRUE, 'must_have'),
  ('FA-03', 'FA', 'Videokonferenzen',
   'Jitsi-Integration fuer Videokonferenzen mit 10+ Teilnehmern und Bildschirmfreigabe.',
   '1) Jitsi-Konferenz startbar\n2) 10+ gleichzeitige Teilnehmer\n3) Bildschirmfreigabe funktioniert',
   'T1: Meeting starten → Teilnehmer kann beitreten\nT2: 10 User gleichzeitig → stabil\nT3: Screen-Share → sichtbar fuer alle',
   TRUE, 'must_have'),
  ('FA-04', 'FA', 'Dateiablage',
   'Datei-Upload in Kanaele, 10GB Speicher, Nextcloud-Integration.',
   '1) Dateien in Kanaelen hochladbar\n2) Nextcloud-Speicher verfuegbar\n3) 10GB Speicherplatz',
   'T1: Datei hochladen → in Kanal sichtbar\nT2: Nextcloud → Dateien erreichbar\nT3: Speicherplatz pruefen → 10GB verfuegbar',
   TRUE, 'must_have'),
  ('FA-05', 'FA', 'Nutzerverwaltung',
   'User-Lifecycle, Rollen (Admin/User/Guest), SSO via Keycloak.',
   '1) Nutzer anlegbar/deaktivierbar\n2) Rollen: Admin, User, Guest\n3) SSO via Keycloak (OIDC)',
   'T1: User anlegen → Login moeglich\nT2: Rolle zuweisen → Berechtigungen korrekt\nT3: SSO-Login → Redirect zu Keycloak',
   TRUE, 'must_have'),
  ('FA-06', 'FA', 'Benachrichtigungen',
   'Web Push, Desktop, Mobile Notifications mit Do-Not-Disturb.',
   '1) Web-Push-Benachrichtigungen\n2) Desktop-Notifications\n3) DND-Modus',
   'T1: Nachricht erhalten → Push-Notification\nT2: DND aktivieren → keine Benachrichtigungen',
   FALSE, 'must_have'),
  ('FA-07', 'FA', 'Suche',
   'Volltextsuche mit Filtern, Antwortzeit unter 2 Sekunden.',
   '1) Volltextsuche ueber Nachrichten\n2) Filter nach Kanal/User/Datum\n3) Antwortzeit < 2s',
   'T1: Suchbegriff eingeben → Ergebnisse angezeigt\nT2: Filter setzen → Ergebnisse eingeschraenkt\nT3: Ladezeit messen → < 2s',
   TRUE, 'must_have'),
  ('FA-08', 'FA', 'Workspace-spezifisch',
   'Status-Emojis, Kalender-Integration, Verfuegbarkeitsanzeige.',
   '1) Status setzbar (Beschaeftigt, Verfuegbar etc.)\n2) Custom-Status moeglich\n3) Kalender-Integration',
   'T1: Status setzen → sichtbar fuer andere\nT2: Custom-Status → in Profil angezeigt\nT3: Kalender-Events importierbar',
   TRUE, 'must_have'),

  -- ─── Collaboration (should_have) ───────────────────────────────
  ('FA-09', 'FA', 'Kollaborationstools (Dokumente & Whiteboards)',
   'Echtzeit-Kollaboration an Dokumenten und Whiteboards. Collabora Online (CODE) in Nextcloud fuer DOCX/XLSX/PPTX/ODF-Bearbeitung. Spacedeck Open fuer visuelle Whiteboards. Beide self-hosted, SSO via Keycloak.',
   '1) Collabora Online in Nextcloud integriert und per Browser erreichbar\n2) Gleichzeitige Bearbeitung durch mindestens 2 Nutzer\n3) Unterstuetzte Formate: DOCX, XLSX, PPTX, ODF\n4) Spacedeck Whiteboard unter board.localhost erreichbar\n5) Whiteboard-Sessions teilbar per Link\n6) Alle Dienste self-hosted\n7) SSO-Login via Keycloak fuer Spacedeck',
   'T1: DOCX in Nextcloud oeffnen → Collabora-Editor laedt\nT2: 2 User oeffnen dasselbe Dokument → Echtzeit-Sync\nT3: XLSX bearbeiten → Zellen und Formeln korrekt\nT4: Spacedeck unter board.localhost → HTTP 200\nT5: Whiteboard erstellen → persistiert nach Reload\nT6: DNS-Check → keine externen Cloud-Anfragen\nT7: Spacedeck-Login via Keycloak → SSO-Redirect',
   FALSE, 'should_have'),
  ('FA-10', 'FA', 'OpenClaw KI-Assistent',
   'KI-Assistent basierend auf Open WebUI mit Claude (Anthropic API) als Backend. Nicht-destruktiv (RBAC-enforced), benachrichtigt Admin bei Unsicherheit via Mattermost-Webhook. SSO via Keycloak, erreichbar unter ai.localhost. Integriert mit Kubernetes, PostgreSQL und GitHub via MCP-Server.',
   '1) Open WebUI erreichbar unter ai.localhost\n2) Claude (Anthropic API) als LLM-Backend\n3) SSO-Login via Keycloak (OIDC)\n5) Nutzer erhalten hilfreiche Antworten\n6) Keine destruktiven Aktionen moeglich (RBAC-enforced)\n7) Admin-Benachrichtigung via Mattermost-Webhook bei unsicheren Anfragen\n8) MCP-Server fuer Kubernetes, PostgreSQL und GitHub integriert',
   'T1: ai.localhost → Open WebUI oder SSO-Redirect\nT2: SSO-Login via Keycloak → erfolgreich\nT3: Frage stellen → hilfreiche Antwort via Claude\nT4: Destruktive Anfrage → Aktion verweigert\nT5: Grenzfall-Anfrage → Admin erhaelt Mattermost-Benachrichtigung\nT6: Kubernetes-Abfrage → Pod-Liste zurueckgegeben\nT7: Datenbank-Abfrage → Ergebnis aus PostgreSQL',
   FALSE, 'should_have'),

  -- ─── MCP Servers (nice_to_have) ────────────────────────────────
  ('FA-11', 'FA', 'Kubernetes MCP Server',
   'MCP-Server fuer Cluster-Zugriff durch OpenClaw. Stellt Kubernetes-API-Operationen als Tools bereit (Pods auflisten, Logs lesen, Deployments neustarten/skalieren). RBAC-limitiert: kein Zugriff auf Secrets, kein exec, kein delete. Laeuft als standalone Pod mit eigenem ServiceAccount.',
   '1) MCP-Server erreichbar unter mcp-kubernetes:3000 (ClusterIP)\n2) Streamable HTTP Transport aktiv\n3) ServiceAccount openclaw-agent mit ClusterRole gebunden\n4) GET/LIST/WATCH auf Pods, Deployments, Services, Logs erlaubt\n5) PATCH/UPDATE auf Deployments erlaubt (Restart, Scale)\n6) Kein Zugriff auf Secrets\n7) Kein pods/exec moeglich\n8) Kein DELETE auf Namespaces, PVCs, Deployments',
   'T1: Health-Endpoint /health → HTTP 200\nT2: kubectl auth can-i get pods --as=SA → yes\nT3: kubectl auth can-i get secrets --as=SA → no\nT4: kubectl auth can-i create pods/exec --as=SA → no\nT5: kubectl auth can-i delete namespaces --as=SA → no\nT6: kubectl auth can-i patch deployments --as=SA → yes\nT7: OpenClaw fragt "Zeige alle Pods" → Liste zurueckgegeben\nT8: OpenClaw fragt "Loesche Keycloak" → verweigert',
   FALSE, 'nice_to_have'),
  ('FA-12', 'FA', 'PostgreSQL MCP Server',
   'MCP-Server fuer Datenbank-Zugriff durch OpenClaw. Stellt SQL-Abfragen als Tools bereit fuer keycloak-db, mattermost-db und nextcloud-db. Read-only Zugriff, kein Schreibzugriff auf Produktionsdaten.',
   '1) MCP-Server erreichbar unter mcp-postgres:3001 (ClusterIP)\n2) Streamable HTTP Transport aktiv\n3) Verbindung zu keycloak-db:5432, mattermost-db:5432, nextcloud-db:5432\n4) SELECT-Abfragen moeglich\n5) INSERT/UPDATE/DELETE werden verweigert\n6) Tabellenlisten abrufbar',
   'T1: Health-Endpoint → HTTP 200\nT2: Tabellenliste keycloak-db → Tabellen zurueckgegeben\nT3: SELECT count(*) FROM users → Zahl zurueckgegeben\nT4: INSERT-Versuch → verweigert\nT5: OpenClaw fragt "Wie viele Nutzer hat Mattermost?" → korrekte Antwort\nT6: OpenClaw fragt "Zeige Nextcloud-Konfiguration" → Config-Tabelle',
   FALSE, 'nice_to_have'),
  ('FA-13', 'FA', 'GitHub MCP Server',
   'MCP-Server fuer Repository-Zugriff durch OpenClaw. Stellt GitHub-API-Operationen als Tools bereit (Issues, PRs, Code-Suche). Authentifizierung via Personal Access Token.',
   '1) MCP-Server erreichbar unter mcp-github:3002 (ClusterIP)\n2) Streamable HTTP Transport aktiv\n3) PAT-basierte Authentifizierung konfiguriert\n4) Repository-Liste abrufbar\n5) Issue-Suche funktioniert\n6) Code-Suche funktioniert\n7) PR-Liste abrufbar',
   'T1: Health-Endpoint → HTTP 200\nT2: Repository-Liste → k3d-dev gelistet\nT3: Issue-Suche → Ergebnisse zurueckgegeben\nT4: Code-Suche nach "keycloak" → Treffer\nT5: OpenClaw fragt "Welche offenen Issues gibt es?" → Liste\nT6: OpenClaw fragt "Zeige den letzten PR" → PR-Details',
   FALSE, 'nice_to_have'),
  ('FA-14', 'FA', 'Prometheus + Grafana MCP Server (Monitoring)',
   'MCP-Server fuer Monitoring-Zugriff durch OpenClaw. Prometheus-MCP stellt PromQL-Abfragen und Alert-Status bereit. Grafana-MCP ermoeglicht Dashboard-Interaktion und Panel-Daten-Abruf. Beide verbinden sich mit dem Monitoring-Stack.',
   '1) Prometheus-MCP erreichbar unter mcp-prometheus:3003 (ClusterIP)\n2) Grafana-MCP erreichbar unter mcp-grafana:3004 (ClusterIP)\n3) PromQL-Abfragen moeglich\n4) Alert-Status abrufbar\n5) Grafana-Dashboard-Liste abrufbar\n6) Panel-Daten als Tabelle/JSON abrufbar',
   'T1: Prometheus-MCP Health → HTTP 200\nT2: Grafana-MCP Health → HTTP 200\nT3: PromQL "up" → Metriken zurueckgegeben\nT4: Alert-Status → aktive Alerts gelistet\nT5: Dashboard-Liste → Dashboards zurueckgegeben\nT6: OpenClaw fragt "Wie ist die CPU-Auslastung?" → Metrik-Antwort\nT7: OpenClaw fragt "Zeige das Latenz-Dashboard" → Dashboard-Link',
   FALSE, 'nice_to_have'),
  ('FA-15', 'FA', 'Tracking Web Frontend',
   'Web-Frontend fuer die Tracking-Datenbank. Zeigt Feature-Tabelle mit Prioritaet, Entwicklungsphase und Pipeline-Status. CRUD-Operationen: Features anlegen, bearbeiten, loeschen. Prioritaet aendern. Pipeline-Timeline mit Zeitstempeln. Multi-Schema-Unterstuetzung (bachelorprojekt, assetgenerator, k3d_dev).',
   '1) Frontend erreichbar unter tracking.localhost\n2) Feature-Tabelle mit allen Requirements sichtbar\n3) Sortierung nach Prioritaet und Kategorie\n4) Neues Requirement anlegen moeglich\n5) Bestehendes Requirement bearbeiten moeglich\n6) Requirement loeschen moeglich (mit Bestaetigung)\n7) Prioritaet per Dropdown aenderbar\n8) Pipeline-Status per Klick aenderbar (erzeugt Zeitstempel)\n9) Timeline-Ansicht zeigt Phasenuebergaenge\n10) Schema-Wechsel zwischen Services',
   'T1: tracking.localhost → HTML-Seite geladen\nT2: Feature-Tabelle → alle FA/SA/NFA sichtbar\nT3: Neues Feature anlegen → in DB persistiert\nT4: Feature bearbeiten → Aenderung sichtbar\nT5: Feature loeschen → Bestaetigung → entfernt\nT6: Prioritaet aendern → sofort aktualisiert\nT7: Pipeline-Status aendern → Zeitstempel in History\nT8: Timeline oeffnen → Phasenuebergaenge mit Datum\nT9: Schema wechseln → andere Service-Tabelle geladen',
   FALSE, 'nice_to_have')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  acceptance_criteria = EXCLUDED.acceptance_criteria,
  test_cases = EXCLUDED.test_cases,
  priority = EXCLUDED.priority;

-- Pipeline stages for all features
INSERT INTO bachelorprojekt.pipeline (req_id, stage, status)
SELECT req_id, stage::public.pipeline_stage, 'pending'::public.pipeline_status
FROM (VALUES
  ('FA-01'),('FA-02'),('FA-03'),('FA-04'),('FA-05'),('FA-06'),('FA-07'),('FA-08'),
  ('FA-09'),('FA-10'),('FA-11'),('FA-12'),('FA-13'),('FA-14'),('FA-15')
) AS r(req_id)
CROSS JOIN (VALUES ('idea'),('implementation'),('testing'),('documentation'),('archive')) AS s(stage)
ON CONFLICT (req_id, stage) DO NOTHING;
