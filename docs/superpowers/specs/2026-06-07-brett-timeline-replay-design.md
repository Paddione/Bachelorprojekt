---
title: "Brett: Timeline/Replay (Slice 5)"
ticket_id: T000472
domains: [website]
status: active
pr_number: null
---

# Design: Brett Timeline/Replay (Slice 5)

**Ticket:** T000472
**Branch (vorgesehen):** feature/brett-timeline-replay

---

## Überblick

### Feature-Beschreibung

Das Timeline/Replay-Feature erlaubt Coaches und Teilnehmern, jede Board-Session als vollständige
Aufzeichnung nachzuschauen. Der Server zeichnet alle state-verändernden WS-Mutations-Events mit
Zeitstempel in einer neuen DB-Tabelle `session_events` auf. Der Client erhält eine Replay-UI mit
einem Zeitstrahl-Scrubber sowie Play/Pause-Steuerung. Im Replay-Modus rekonstruiert ein
`replay-engine.ts` Modul den Board-Zustand zu beliebigen Zeitpunkten durch sequenzielles
Einspielen der Events auf den Initial-Snapshot.

### Coaching-Nutzen

Das Systembrett lebt von der Prozesshaftigkeit — wie Figuren bewegt wurden, wann Rollen zugewiesen
wurden, wie sich die Aufstellung über die Session verändert hat, ist therapeutisch und analytisch
wichtiger als der finale Zustand. Mit dem Replay-Feature können:

- **Coaches** eine Session im Nachgang analysieren, Schlüsselmomente identifizieren und mit
  Klienten besprechen.
- **Supervisoren** Coaching-Verläufe auswerten und Lernmaterial aus realen Sessions gewinnen.
- **Gruppen-Coaches** den Prozess einer Gruppenaufstellung nachschauen und dokumentieren.

### Scope-Abgrenzung

- Replay ist **read-only**: Keine Mutations im Replay-Modus (kein WS-Senden außer Verbindungserhalt).
- Der Replay-Zugriff ist **admin-only** (isAdmin-Flag, OIDC-Claim).
- Aufzeichnung läuft **serverseitig** und ist für aktive Sessions transparent.
- Der Replay läuft **rein clientseitig** — Event-Stream wird per HTTP-Endpoint geladen,
  kein Live-WS-Kanal nötig.

---

## Architectural Decisions

### AD-1: Event Log als separate DB-Tabelle (nicht als JSON-Blob in brett_rooms)

**Entscheidung:** Neue Tabelle `session_events` mit Zeilen pro Event (nicht als Array in `brett_rooms`).

**Begründung:** Eine Session kann hunderte bis tausende Events erzeugen. Ein Array in JSONB würde
bei Abfragen immer das gesamte Blob laden. Separate Zeilen erlauben Paginierung, partielle Abfragen
(z.B. "Events für Zeitraum"), effiziente Inserts via gepufferter Batches, und halten `brett_rooms`
schlank.

**Tradeoff:** Ein zweiter Datenbank-Schreibpfad — aber da er nur Appends erzeugt, ist das
unkritisch.

### AD-2: Event-Buffer mit Batch-Insert (kein Schreiben pro Event)

**Entscheidung:** Events werden serverseitig in einem In-Memory-Buffer pro Room gesammelt und
alle 2 Sekunden per Batch-INSERT in die DB geschrieben (`appendEvents` in `event-log.ts`).

**Begründung:** Frequente Board-Aktivität (move-Events) kann 10-20 Nachrichten/Sekunde erzeugen.
Ein DB-Write pro Event würde die `pg.Pool`-Verbindungen sättigen. Der Buffer reduziert
DB-Schreiblast um ~95% ohne Datenverlust-Risiko bei normalem Betrieb (nur Server-Crash
verliert unflushed Events — akzeptabler Trade für ein Analyse-Feature).

**Flush-on-close:** Beim Beenden einer Session (`session_phase_change` → `ended` oder
`flushImmediate`) wird der Buffer zwangsgeleert.

### AD-3: Replay als clientseitiger Event-Replay auf Initial-Snapshot

**Entscheidung:** Der Replay-Client lädt (a) den Snapshot zum Session-Start und (b) alle Events
der Session per HTTP-API. Die `replay-engine.ts` wendet Events auf den Snapshot an und stellt
den Zustand zu jedem Zeitpunkt bereit.

**Alternativen verworfen:**
- *Server-side State Reconstruction per Timestamp-Query:* Erfordert komplexe serverseitige Logik
  und verhindert scrubbing ohne Server-RTT pro Schritt.
- *Speichern aller Zwischenzustände:* Enormer Speicherbedarf; überflüssig wenn Events vorhanden.

**Begründung:** Lokaler Replay auf dem Client ermöglicht flüssiges Scrubbing ohne Netzwerklatenz.
Die Event-Struktur entspricht direkt den bestehenden `applyMutation`-Cases, was Code-Reuse erlaubt.

### AD-4: Feature-Flag via `window.__brettFeatures['replay']`

**Entscheidung:** Das gesamte Replay-UI bleibt hinter dem bestehenden Dark-Launch-Pattern
(`window.__brettFeatures['replay']`).

**Begründung:** Konsistenz mit der bestehenden Feature-Flag-Infrastruktur. Replay ändert nichts
am bestehenden Board-Verhalten — es ist additiv.

### AD-5: Replay-HTTP-Endpunkte (nicht WS)

**Entscheidung:** Drei neue HTTP-Endpunkte:
- `GET /api/sessions/:room/events` — liefert alle Events einer Session (admin-only)
- `GET /api/sessions/:room/snapshot` — liefert den Initial-Snapshot
- `GET /api/sessions` — listet Sessions des Rooms (für Session-Auswahl)

**Begründung:** HTTP REST ist einfacher für Load/Scrub als ein WS-Protokoll. Der Client fragt
einmalig und arbeitet lokal. Server-seitig keine persistente Verbindung nötig.

---

## Data Model / Interface Changes

### Neue DB-Tabelle: `session_events`

```sql
CREATE TABLE IF NOT EXISTS session_events (
  id            BIGSERIAL    PRIMARY KEY,
  room_token    TEXT         NOT NULL,
  session_code  TEXT,
  seq           INTEGER      NOT NULL,
  event_type    TEXT         NOT NULL,
  payload       JSONB        NOT NULL,
  recorded_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_events_room_token  ON session_events (room_token, recorded_at);
CREATE INDEX idx_session_events_session_code ON session_events (session_code, seq);
```

**Felder:**
- `room_token`: Identifiziert den Room (FK zu `brett_rooms`, aber kein CONSTRAINT für Performance)
- `session_code`: Der Coaching-Session-Code (z.B. `ABC-123`) — `NULL` im Free-Board-Modus
- `seq`: Monotone Sequenznummer pro Room (In-Memory-Counter, garantiert Reihenfolge)
- `event_type`: Der Message-Type-String (`move`, `add`, `session_phase_change`, etc.)
- `payload`: Der vollständige Event-Payload als JSONB
- `recorded_at`: Server-Timestamp mit Timezone

### Neues TypeScript-Interface: `RecordedEvent`

```typescript
// brett/src/server/event-log.ts
export interface RecordedEvent {
  id: number;
  roomToken: string;
  sessionCode: string | null;
  seq: number;
  eventType: string;
  payload: Record<string, any>;
  recordedAt: string; // ISO 8601
}
```

### Neue Client-Types

```typescript
// brett/src/client/replay-engine.ts
export interface ReplayState {
  figures: any[];
  stiffness: number;
  phase: string;
  sessionCode: string | null;
}

export interface ReplayController {
  seek(timestampMs: number): ReplayState;
  play(): void;
  pause(): void;
  isPlaying: boolean;
  totalDurationMs: number;
  currentPositionMs: number;
  events: RecordedEvent[];
}
```

### Erweiterung WsDeps

`WsDeps` in `ws-handler.ts` erhält zwei neue injizierte Funktionen:

```typescript
logEvent?: (room: string, sessionCode: string | null, eventType: string, payload: any) => void;
flushEventLog?: (room: string) => Promise<void>;
```

Beide sind optional (`?`) um Backwards-Compatibility mit bestehenden Tests zu gewährleisten.

### Neue ServerMessage: `replay_snapshot`

```typescript
| { type: 'replay_snapshot'; events: RecordedEvent[]; initialState: any; sessionMeta: { code: string | null; startedAt: string; endedAt: string | null } }
```

Wird **nicht** über WS gesendet, sondern nur in der HTTP-API-Response verwendet (Type-Safety).

---

## Implementation Strategy

### Server-Schicht

#### event-log.ts (neue Datei)

Das Modul kapselt alles rund um Event-Logging:

1. **In-Memory-Buffer** pro Room: `Map<string, RecordedEvent[]>`
2. **Sequenz-Counter** pro Room: `Map<string, number>`
3. **`appendEvent(room, sessionCode, eventType, payload)`**: Fügt dem Buffer hinzu, plant Flush
4. **`flushEventBuffer(room)`**: Batch-INSERT in `session_events`, Buffer leeren
5. **`loadEvents(room, options?)`**: Lädt Events aus DB (mit optionalem `since`-Filter)
6. **`getInitialSnapshot(room)`**: Gibt den ersten gespeicherten State zurück
7. **`initEventLog(deps)`**: Dependency-Injection-Initialisierung

#### Einbindung in ws-handler.ts

Jede Mutation, die durch `applyMutation` läuft und `schedulePersist` aufruft, ruft auch
`deps.logEvent?.(room, sessionCode, msg.type, msg)` auf. Das umfasst:
- Alle RELAY_TYPES (add, move, update, delete, clear, stiffness, snapshot)
- session_phase_change (in phases.ts bei transitionPhase)
- Possession- und Figure-Type-Events
- Coaching-Steps-Änderungen

#### HTTP-API-Endpunkte (in index.ts)

```
GET /api/sessions/:room/events       → JSON: { events: RecordedEvent[] }
GET /api/sessions/:room/snapshot     → JSON: { state: any, recordedAt: string }
GET /api/sessions                    → JSON: { sessions: SessionMeta[] }
```

Alle drei Endpunkte sind durch `requireAdmin`-Middleware gesichert
(Check auf `req.session.isAdmin`).

### Client-Schicht

#### replay-engine.ts (neue Datei)

Reine Compute-Bibliothek ohne DOM-Abhängigkeiten:

1. **`buildReplayTimeline(events)`**: Erstellt ein sortiertes Array mit Zeitstempeln
2. **`applyEventToState(state, event)`**: Wendet ein Event auf einen `ReplayState` an
   (analog zu `applyMutation` serverseitig, aber auf den simplen Flat-State)
3. **`seekToTimestamp(events, initialState, targetMs)`**: Sucht Events bis zum Zeitpunkt
   und rekonstruiert den State per Binary-Search + sequenziellem Replay
4. **`createReplayController(events, initialState)`**: Factory für `ReplayController`

#### timeline.ts (neue Datei in ui/)

DOM-UI-Komponente für den Zeitstrahl:

1. **`renderTimeline(container, controller)`**: Erstellt das HTML-Element mit:
   - Zeitstrahl-Balken mit klickbarer Scrub-Leiste
   - Play/Pause-Button
   - Zeitanzeige (aktuell / gesamt)
   - Phasen-Marker (Farbcodierung: lobby=blau, active=grün, paused=gelb, ended=grau)
2. **`updateTimeline(element, controller)`**: Aktualisiert Position ohne Re-Render
3. **`destroyTimeline(element)`**: Cleanup

#### Integration in board-boot.ts / app-shell.ts

Replay-Modus wird aktiviert wenn URL-Parameter `?replay=1&room=<token>` vorhanden ist.
In diesem Fall:
- Kein WS-Connect
- HTTP-Fetch der Events + Initial-Snapshot
- Board-Render im Replay-Modus
- Timeline-UI über dem normalen Board-UI eingeblendet

### Test-Strategie

#### Server-Tests (Node.js built-in test runner)

- `brett/test/event-log.test.ts`:
  - Buffer-Accumulation ohne DB-Writes
  - Flush leert Buffer und schreibt in MockPool
  - loadEvents gibt korrekte Reihenfolge zurück
  - Sequenz-Counter ist monoton

- `brett/test/event-log-ws-integration.test.ts`:
  - `logEvent` wird bei RELAY_TYPES aufgerufen
  - `logEvent` wird bei session_phase_change aufgerufen
  - Kein `logEvent` bei admin-only-Messages ohne State-Wirkung

#### Client-Tests (tsx + Node.js)

- `brett/test/replay-engine.test.ts`:
  - `seekToTimestamp` gibt korrekten State für Zeitpunkt t=0, t=mitte, t=ende zurück
  - Leere Event-Liste → Initial-State unverändert
  - Events außerhalb der Timeline-Grenzen → geclampter State

- `brett/test/timeline.test.ts` (jsdom):
  - `renderTimeline` erstellt DOM-Elemente korrekt
  - Scrubber-Klick löst `seek`-Callback aus
  - Phasen-Marker werden bei korrekten Zeitpunkten gerendert

---

## Sicherheit & Zugriffskontrolle

- Alle Replay-API-Endpunkte prüfen `req.session?.isAdmin === true` (OIDC-Claim)
- Events werden **nicht** an normale WS-Clients gesendet
- Session-Codes (die in `session_events.session_code` stehen) sind keine Secrets, aber
  die Event-Payloads können Spielernamen enthalten → Admin-Only ist ausreichend

## Performance-Überlegungen

- Buffer-Flush-Interval: 2000ms (konfigurierbar via `EVENT_LOG_FLUSH_MS` env var)
- Max. Events per Flush: 500 (verhindert zu große INSERT-Statements)
- `loadEvents` limitiert auf 10.000 Events per Request (typische Session: < 2.000)
- Im MOCK_DB-Modus werden Events discarded (kein Buffer-Wachstum)

## Nicht-Ziele (explizit ausgeklammerter Scope)

- Kein Export als Video oder GIF
- Kein Teilen von Replay-Links mit Nicht-Admins
- Kein differentielles Speichern (jeder Replay baut von vorne auf)
- Kein Multi-Session-Vergleich
- Keine Suche in Events
