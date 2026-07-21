# sessions-server
<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Der Sessions-Server verwaltet kurzlebige öffentliche Sessions (z. B. Brainstorming-Boards oder Formulare), die unter `sessions.mentolder.de` erreichbar gemacht werden. Ein zentrales Registry-JSON hält alle aktiven Sessions mit Slug, Port, Typ, Titel und öffentlicher URL vor. Das `session-hub.sh`-Skript steuert den gesamten Lebenszyklus (Registrieren, Auflisten, Abmelden, Bereinigen).

---

## Requirements

### Requirement: Session Registration

The system SHALL add a new session entry to the registry when a session is registered with a name, port, type, and title, and SHALL derive the public URL from the session domain using the pattern `https://session-<slug>.<domain>`.

#### Scenario: Neue Session in leerer Registry registrieren

- **GIVEN** die Registry-Datei existiert noch nicht (leeres Verzeichnis)
- **WHEN** `session-hub.sh register --name foo --port 18080 --type brainstorm --title "Foo Board"` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry enthält einen Eintrag mit `slug = "foo"`
- **AND** der `public_url`-Wert des Eintrags lautet `https://session-foo.sessions.example.test`

#### Scenario: Öffentliche URL wird aus Domain und Slug zusammengesetzt

- **GIVEN** `SESSION_HUB_DOMAIN` ist auf `sessions.example.test` gesetzt
- **WHEN** eine Session mit dem Namen `myboard` registriert wird
- **THEN** der `public_url`-Wert des Eintrags lautet `https://session-myboard.sessions.example.test`

---

### Requirement: Session Listing

The system SHALL output the full registry JSON when the list command is invoked, including all currently registered sessions.

#### Scenario: Registry-Inhalt auflisten

- **GIVEN** eine Session mit dem Slug `bar` wurde zuvor registriert
- **WHEN** `session-hub.sh list` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Ausgabe enthält ein JSON-Objekt mit `slug = "bar"`

---

### Requirement: Session Deregistration

The system SHALL remove the matching session entry from the registry when the deregister command is called with a session name.

#### Scenario: Einzelne Session aus Registry entfernen

- **GIVEN** eine Session mit dem Namen `baz` ist in der Registry eingetragen
- **WHEN** `session-hub.sh deregister --name baz` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry enthält danach null Einträge

---

### Requirement: Dead Process Reaping

The system SHALL remove registry entries whose recorded PIDs (tunnel_pid and server_pid) no longer correspond to running processes when the reap command is invoked.

#### Scenario: Eintrag mit totem PID wird bereinigt

- **GIVEN** eine Session ist registriert und ihre `tunnel_pid`/`server_pid`-Werte werden auf `999999` (nicht existierender Prozess) gesetzt
- **WHEN** `session-hub.sh reap` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry ist leer (Länge 0)

---

### Requirement: Idempotent Re-Registration

The system SHALL replace an existing registry entry (not duplicate it) when a session with the same slug is registered a second time, preserving only the latest values.

#### Scenario: Doppelte Registrierung ersetzt bestehenden Eintrag

- **GIVEN** eine Session mit dem Namen `dup` ist bereits mit Port `1` und Titel `v1` registriert
- **WHEN** `session-hub.sh register --name dup --port 2 --type form --title "v2"` erneut aufgerufen wird
- **THEN** die Registry enthält genau einen Eintrag mit `slug = "dup"` und der gespeicherte Port ist `2`

---

### Requirement: BATS Placeholder Test Coverage

The system SHALL have a dedicated BATS spec file (`tests/spec/sessions-server.bats`) that establishes
initial, spec-linked test coverage for the sessions-server SSOT spec, per the "one BATS file per
OpenSpec SSOT spec" convention.

#### Scenario: Placeholder test passes

- **GIVEN** the BATS suite `tests/spec/sessions-server.bats` exists
- **WHEN** `bats tests/spec/sessions-server.bats` is run
- **THEN** the placeholder test `sessions-server spec covered` passes

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Form Session Start with Ticket Association
<!-- bats: session-hub.bats -->

The system SHALL store the `ticket_id` in the registry entry and inject it into the served HTML when `start-form` is called with `--ticket-id`.

#### Scenario: start-form mit ticket-id speichert Ticket-Referenz *(BATS)*

- **GIVEN** eine HTML-Formulardatei mit dem Platzhalter `__SESSION_TICKET_ID__` liegt vor
- **WHEN** `session-hub.sh start-form --file <html> --name tkform --ticket-id T000123` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry enthält für `slug = "tkform"` den Wert `ticket_id = "T000123"`

#### Scenario: start-form speichert den Quellpfad der Formulardatei *(BATS)*

- **GIVEN** eine HTML-Formulardatei ohne Platzhalter liegt vor
- **WHEN** `session-hub.sh start-form --file <html> --name srcform` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Registry enthält für `slug = "srcform"` den absoluten Dateipfad unter `source_file`

---

### Requirement: Form Re-Upload (regen)
<!-- bats: session-hub.bats -->

The system SHALL re-serve the form from the stored `source_file` path when `regen` is called, and SHALL fail with a non-zero exit code when no `source_file` is recorded.

#### Scenario: regen lädt Formular aus gespeichertem source_file erneut hoch *(BATS)*

- **GIVEN** eine Session wurde via `start-form` mit `source_file` und `ticket_id` registriert
- **WHEN** `session-hub.sh regen --name regentest` aufgerufen wird
- **THEN** der Exit-Code ist 0 und die Ausgabe enthält `"done"`

#### Scenario: regen schlägt fehl wenn kein source_file hinterlegt ist *(BATS)*

- **GIVEN** eine Session wurde via `register` ohne `source_file` registriert
- **WHEN** `session-hub.sh regen --name noregen` aufgerufen wird
- **THEN** der Exit-Code ist ungleich 0

---

### Requirement: Brainstorm-Session-Template-Selection

The system SHALL provide 5 pre-installed brainstorm templates (Feature-Intake, Retro, Grilling, Workshop, Spezifikation) selectable at session start.

#### Scenario: Template-Auswahl beim Session-Start

- **GIVEN** ein Admin öffnet den neuen Brainstorm-Modal
- **WHEN** der TemplatePicker lädt
- **THEN** sieht er 5 Default-Templates plus seine eigenen Custom-Templates

#### Scenario: Clone-and-Edit

- **GIVEN** ein Admin klickt "Clone" auf dem Grilling-Default
- **WHEN** der Clone-Dialog bestätigt wird
- **THEN** wird ein neuer Eintrag in sessions.templates mit is_default=false erstellt

#### Scenario: DB-Fallback

- **GIVEN** die sessions.templates-Tabelle ist nicht erreichbar
- **WHEN** templates.ts versucht Templates zu laden
- **THEN** fallen die Funktionen auf DEFAULT_TEMPLATES (hardcoded) zurück

---

### Requirement: Auth-Gating für Admin-Coaching-Sessions-UI
<!-- e2e: fa-54-coaching-sessions.spec.ts -->

The system SHALL redirect unauthenticated requests away from `/admin/coaching/sessions` and `/admin/coaching/sessions/new`, and SHALL return HTTP 401 or 403 for unauthenticated API calls.

#### Scenario: Unauthenticated GET /admin/coaching/sessions wird abgelehnt *(E2E)*

- **GIVEN** kein gültiger Authentifizierungs-Cookie ist gesetzt
- **WHEN** ein Browser `/admin/coaching/sessions` aufruft
- **THEN** die resultierende URL weicht von `/admin/coaching/sessions` ab (Redirect zum Login)

#### Scenario: Unauthenticated GET /admin/coaching/sessions/new wird abgelehnt *(E2E)*

- **GIVEN** kein gültiger Authentifizierungs-Cookie ist gesetzt
- **WHEN** ein Browser `/admin/coaching/sessions/new` aufruft
- **THEN** die resultierende URL weicht von `/admin/coaching/sessions/new` ab (Redirect zum Login)

#### Scenario: Unauthenticated API GET /api/admin/coaching/sessions liefert 401/403 *(E2E)*

- **GIVEN** kein Authorization-Header oder Session-Cookie ist gesetzt
- **WHEN** `GET /api/admin/coaching/sessions` aufgerufen wird
- **THEN** der HTTP-Status ist 401 oder 403

#### Scenario: Unauthenticated API POST /api/admin/coaching/sessions liefert 401/403 *(E2E)*

- **GIVEN** kein Authorization-Header oder Session-Cookie ist gesetzt
- **WHEN** `POST /api/admin/coaching/sessions` mit `{ title, mode }` aufgerufen wird
- **THEN** der HTTP-Status ist 401 oder 403

---

### Requirement: Seitenstruktur der Coaching-Sessions-Verwaltung
<!-- e2e: fa-54-coaching-sessions.spec.ts -->

The system SHALL render the sessions overview with a heading "Coaching-Sessions" and a visible link to create a new session, and the new-session form SHALL expose all required input fields.

#### Scenario: Sessions-Übersichtsseite zeigt Heading und Neu-Link *(E2E)*

- **GIVEN** ein Administrator ist eingeloggt
- **WHEN** `/admin/coaching/sessions` aufgerufen wird
- **THEN** ein Heading `Coaching-Sessions` ist sichtbar und ein Link `Neue Session` ist sichtbar

#### Scenario: Neue-Session-Formular enthält alle Pflichtfelder *(E2E)*

- **GIVEN** ein Administrator ist eingeloggt
- **WHEN** `/admin/coaching/sessions/new` aufgerufen wird
- **THEN** die Felder `#title`, `#clientId`, `#kiConfigId`, `mode=live`, `mode=prep` und `#submit-btn` sind sichtbar

---

### Requirement: Brainstorm-Tunnel Basis-Konnektivität
<!-- e2e: nfa-12-brainstorm-tunnel.spec.ts -->

The system SHALL respond to requests at `brainstorm.mentolder.de` with HTTP 200/301/302 when a tunnel is active, or 502 when no tunnel is published (sish is running but idle); any other 5xx status indicates a pod problem.

#### Scenario: brainstorm.mentolder.de antwortet mit erwartetem HTTP-Status *(E2E)*

- **GIVEN** das Produktions-Cluster ist erreichbar (`PROD_DOMAIN` gesetzt) und sish läuft
- **WHEN** `GET https://brainstorm.mentolder.de` aufgerufen wird
- **THEN** der HTTP-Status ist einer von 200, 301, 302 oder 502 (502 = kein aktiver Tunnel)

#### Scenario: brainstorm.mentolder.de liefert keine kritischen 5xx-Fehler im Browser *(E2E)*

- **GIVEN** das Produktions-Cluster ist erreichbar (`PROD_DOMAIN` gesetzt) und sish läuft
- **WHEN** ein Browser `https://brainstorm.mentolder.de` aufruft
- **THEN** der HTTP-Status ist einer von 200, 301, 302, 404 oder 502 — nicht 500, 503 oder 504

<!-- merged from change delta sessions-server.md (f8b3cb8ac079) -->