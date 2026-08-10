# p1 — Schema und Aufräum-Task

**Rolle:** implementation
**Dateien:** `scripts/migrations/2026-08-10-llm-proxy-request-log.sql`, `Taskfile.yml`

## Kontext

Die Tabelle liegt in der tickets-DB, weil der Proxy dort bereits liest (`llm_proxy_backends`) und
weil das Cockpit über `LISTEN cockpit_events` (`website/src/lib/sdlc/cockpit-listen-hub.ts:45`)
seinen Push-Weg schon hat. Begründung und verworfene Alternativen: `design.md` → D1.

## Aufgaben

- [ ] **Migration anlegen.** `scripts/migrations/2026-08-10-llm-proxy-request-log.sql` mit der
      Tabelle `tickets.llm_proxy_request_log`:

```sql
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
  stream_incomplete boolean     NOT NULL DEFAULT false,
  truncated         boolean     NOT NULL DEFAULT false,
  original_bytes    bigint,
  slot_id           integer,
  dispatch_ticket   text,
  dispatch_partial  text,
  request_body      text,
  response_body     text
);
```

- [ ] **Indizes.** `(ts DESC)` für die Listenabfrage, `(dispatch_ticket, ts DESC)` für die
      Zuordnung zu einem Vorgang. Kein Index auf den Body-Spalten.

- [ ] **NOTIFY-Trigger.** Nach `INSERT` ein `pg_notify('cockpit_events', …)` mit einer Nutzlast,
      die **nur** Typ und `id` trägt. Vorbild: `website/src/db/migrations/20260804_cockpit_notify_triggers.sql`.
      Die Nutzlast von `pg_notify` ist auf 8000 Byte begrenzt — ein Body darf dort unter keinen
      Umständen hinein, sonst schlägt der `INSERT` selbst fehl und der Mitschnitt bricht den
      Dispatch, den er beobachten soll.

- [ ] **Rechte.** `GRANT SELECT, INSERT, DELETE` auf die Tabelle und `USAGE, SELECT` auf die
      Sequenz an die Rolle, unter der `factory_psql` verbindet (`psql -U website`, siehe
      `scripts/factory/lib.sh`).

- [ ] **Aufräum-Task.** In `Taskfile.yml` neben `maintenance:ai-log-cleanup` (ab Zeile 5239) einen
      Task `maintenance:dispatch-log-cleanup` ergänzen, der Zeilen älter als 14 Tage löscht. Den
      bestehenden Task als Muster nehmen, einschließlich seiner `ENV=`-Behandlung, und ihn in
      denselben Sammel-Task eintragen, der `maintenance:ai-log-cleanup` bereits aufruft
      (`Taskfile.yml:5256`).

- [ ] **Migration anwenden und Ergebnis prüfen** — geprüft wird der Zustand der Datenbank, nicht
      der Inhalt der SQL-Datei:

```bash
source scripts/factory/lib.sh && factory_resolve
echo "\\d tickets.llm_proxy_request_log" | factory_psql
# erwartet: die Tabelle existiert mit allen oben genannten Spalten
```

## Budgets

| Datei | Ist | Budget |
| --- | --- | --- |
| `Taskfile.yml` | — | keine S1-Schwelle für `.yml` |

`scripts/migrations/2026-08-10-llm-proxy-request-log.sql` ist neu; `.sql` trägt keine
S1-Schwelle. Der Aufräum-Task in `Taskfile.yml` bleibt unter 20 Zeilen.
