# Datenbank

> Diese Seite wurde zu **[PostgreSQL (shared-db)](shared-db.md)** verschoben.

**Datenbankmodelle und Schemas** finden Sie in den Abschnitten unten.

---

# Datenbankmodelle

Alle im Repository definierten Schemas laufen auf `shared-db` (PostgreSQL 16).
Die Tabellenstrukturen werden durch Kubernetes-Init-Skripte idempotent angelegt —
`k3d/website-schema.yaml` fuer die `website`-Datenbank,
`deploy/tracking/init.sql` fuer das `bachelorprojekt`-Schema.

---

## Website-Datenbank (`website`)

Speichert die Meeting Knowledge Pipeline, das Messaging-System sowie Website-Admin-Einstellungen: Kunden, Meeting-Verlauf, Transkripte, Artefakte, KI-Insights, Chat-Raeume, Nachrichten, Bug-Tickets, Service-Konfigurationen und Projektmanagement.

```mermaid
erDiagram
    customers {
        uuid        id                      PK
        text        name
        text        email                   UK
        text        phone
        text        company
        text        keycloak_user_id
        timestamptz created_at
        timestamptz updated_at
    }

    meetings {
        uuid        id                  PK
        uuid        customer_id         FK
        uuid        project_id          FK
        text        meeting_type
        timestamptz scheduled_at
        timestamptz started_at
        timestamptz ended_at
        integer     duration_seconds
        text        talk_room_token
        text        recording_path
        text        status
        timestamptz released_at
        timestamptz created_at
        timestamptz updated_at
    }


    transcripts {
        uuid        id               PK
        uuid        meeting_id       FK
        text        full_text
        text        language
        text        whisper_model
        numeric     duration_seconds
        timestamptz created_at
    }

    transcript_segments {
        uuid    id              PK
        uuid    transcript_id   FK
        integer segment_index
        numeric start_time
        numeric end_time
        text    text
        text    speaker
    }

    meeting_artifacts {
        uuid        id             PK
        uuid        meeting_id     FK
        text        artifact_type
        text        name
        text        storage_path
        text        content_text
        jsonb       metadata
        timestamptz created_at
    }

    meeting_insights {
        uuid        id                  PK
        uuid        meeting_id          FK
        text        insight_type
        text        content
        text        generated_by
        text        doc_reference
        timestamptz created_at
    }

    bug_tickets {
        text        ticket_id           PK
        text        status
        text        category
        text        reporter_email
        text        description
        text        url
        text        brand
        jsonb       screenshots_json
        timestamptz created_at
        timestamptz resolved_at
        text        resolution_note
    }

    service_config {
        text        brand           PK
        jsonb       services_json
        timestamptz updated_at
    }

    leistungen_config {
        text        brand           PK
        jsonb       categories_json
        timestamptz updated_at
    }

    site_settings {
        text        brand           PK
        text        key             PK
        text        value
        timestamptz updated_at
    }

    legal_pages {
        text        brand           PK
        text        page_key        PK
        text        content_html
        timestamptz updated_at
    }

    referenzen_config {
        text        brand           PK
        jsonb       items_json
        timestamptz updated_at
    }

    inbox_items {
        serial      id              PK
        text        type
        text        status
        timestamptz created_at
    }

    message_threads {
        serial      id              PK
        uuid        customer_id     FK
        text        subject
        timestamptz created_at
    }

    messages {
        serial      id              PK
        int         thread_id       FK
        text        sender_id
        text        body
        timestamptz created_at
    }

    chat_rooms {
        serial      id              PK
        text        name
        text        created_by
        timestamptz created_at
    }

    chat_messages {
        serial      id              PK
        int         room_id         FK
        text        sender_id
        text        body
        timestamptz created_at
    }

    projects {
        uuid        id              PK
        text        brand
        text        name
        text        description
        text        notes
        date        start_date
        date        due_date
        text        status
        text        priority
        uuid        customer_id     FK
        timestamptz created_at
        timestamptz updated_at
    }

    sub_projects {
        uuid        id              PK
        uuid        project_id      FK
        text        name
        text        description
        text        notes
        date        start_date
        date        due_date
        text        status
        text        priority
        uuid        customer_id     FK
        timestamptz created_at
        timestamptz updated_at
    }

    project_tasks {
        uuid        id              PK
        uuid        project_id      FK
        uuid        sub_project_id  FK
        text        name
        text        description
        text        notes
        date        start_date
        date        due_date
        text        status
        text        priority
        uuid        customer_id     FK
        timestamptz created_at
        timestamptz updated_at
    }

    customers        ||--o{ meetings             : "hat"
    projects         ||--o{ meetings             : "zugeordnet"
    meetings         ||--o{ transcripts          : "hat"
    transcripts      ||--o{ transcript_segments  : "enthaelt"
    meetings         ||--o{ meeting_artifacts    : "hat"
    meetings         ||--o{ meeting_insights     : "hat"
    customers        ||--o{ projects             : "verantwortlich"
    customers        ||--o{ sub_projects         : "verantwortlich"
    customers        ||--o{ project_tasks        : "verantwortlich"
    projects         ||--o{ sub_projects         : "hat"
    projects         ||--o{ project_tasks        : "hat direkt"
    sub_projects     ||--o{ project_tasks        : "hat"
    customers        ||--o{ message_threads      : "hat"
    message_threads  ||--o{ messages             : "enthaelt"
    chat_rooms       ||--o{ chat_messages        : "enthaelt"
```

### Tabellenbeschreibungen

| Tabelle | Beschreibung |
|---------|--------------|
| `customers` | Kunden/Coachees — Referenzpunkt zu Keycloak (`keycloak_user_id`) |
| `meetings` | Meeting-Verlauf mit Status-Lifecycle: `scheduled → active → ended → transcribed → finalized`; optional einem Projekt zugeordnet (`project_id`, nullable FK mit ON DELETE SET NULL) |
| `transcripts` | Volltext-Transkripte aus Whisper (faster-whisper-medium) |
| `transcript_segments` | Zeitgestempelte Segmente eines Transkripts mit optionalem Speaker-Label |
| `meeting_artifacts` | Artefakte (Whiteboard-Export, Datei, Screenshot, Dokument) je Meeting |
| `meeting_insights` | KI-generierte Einsichten: Zusammenfassung, Aktionspunkte, Themen, Sentiment, Coaching-Notizen |
| `bug_tickets` | Bug-Meldungen vom Website-Formular mit Status `open → resolved → archived` |
| `service_config` | Angebots-Overrides je Brand (JSON) fuer das Admin-Panel |
| `leistungen_config` | Leistungskategorien-Overrides je Brand (Preistabelle) fuer das Admin-Panel |
| `site_settings` | Key/Value-Store fuer Website-Einstellungen je Brand (z.B. Hero-Text, Kontaktdaten) |
| `legal_pages` | Admin-editierbare Rechtstexte (AGB, Datenschutz, Impressum) je Brand als HTML |
| `referenzen_config` | Referenz-/Kundenlisten je Brand fuer den Referenzen-Bereich der Website |
| `projects` | Kundenprojekte mit Status-Lifecycle `entwurf → wartend → geplant → aktiv → erledigt → archiviert` |
| `sub_projects` | Teilprojekte innerhalb eines Projekts (eine Ebene tief) mit identischen Attributen |
| `project_tasks` | Aufgaben in Projekten oder Teilprojekten — `sub_project_id` IS NULL bedeutet direkte Projektzuordnung |
| `inbox_items` | Eingehende Anfragen (Kontaktformular, Buchung, Bug-Report) mit Status `pending → actioned → archived` |
| `message_threads` | Direkt-Nachrichtenthreads zwischen Kunden und Admins |
| `messages` | Nachrichten innerhalb eines Threads |
| `chat_rooms` | Themenbasierte Chat-Raeume (oeffentlich oder privat) |
| `chat_messages` | Nachrichten in einem Chat-Raum mit Lesebestaetigung via `chat_message_reads` |

---

## Bachelorprojekt-Tracking-Schema (`bachelorprojekt`)

Verfolgt den Fortschritt aller Anforderungen durch den Entwicklungsprozess.
Angelegt in der `postgres`-Standarddatenbank auf `shared-db`.

```mermaid
erDiagram
    requirements {
        text        id          PK
        text        category
        text        name
        text        description
        text        criteria
        text        test_case
        timestamptz created_at
    }

    pipeline {
        serial      id          PK
        text        req_id      FK
        text        stage
        timestamptz entered_at
        text        notes
    }

    test_results {
        serial      id          PK
        text        req_id      FK
        text        result
        timestamptz run_at
        text        details
    }

    requirements ||--o{ pipeline      : "durchlaeuft"
    requirements ||--o{ test_results  : "hat"
```

### Views

| View | Beschreibung |
|------|--------------|
| `v_pipeline_status` | Aktueller Stage je Anforderung (neuester `pipeline`-Eintrag) |
| `v_progress_summary` | Anzahl Anforderungen je Stage |
| `v_open_issues` | Alle Anforderungen ausser `archive` |
| `v_latest_tests` | Letztes Testergebnis je Anforderung |
