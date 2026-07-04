---
title: Persistierte 24h-Fehleransicht — Sidekick-Widget
date: 2026-07-03
status: approved
domains: [website, observability]
ticket_id: "T001594"
plan_ref: "openspec/changes/sidekick-error-log-24h/tasks.md"
---

# Persistierte 24h-Fehleransicht — Sidekick-Widget

## Ziel

Das bestehende zentrale Logging im `PortalSidekick` (`LogsSidekickView.svelte`,
siehe `docs/superpowers/specs/2026-06-22-logging-sidekick-widget-design.md`) ist
rein In-Memory (Ringpuffer, Cap 500 server / 2000 client) und nur per Live-SSE
sichtbar — ein Server-Neustart oder Browser-Reload löscht die Historie, und der
Puffer ist mengen- statt zeitbasiert gekappt. Damit ist aktuell **keine**
verlässliche Ansicht "Fehler der letzten 24h" möglich.

Dieses Feature ergänzt eine **echte, persistierte** 24h-Fehlerhistorie —
keine Mock-/Platzhalterdaten. Nur `level=error`-Einträge werden persistiert.

## Entscheidungen (mit User fixiert)

- **Quellen:** Server (Pino/API), Browser (`window.onerror`/`unhandledrejection`)
  und Pod-Logs werden alle persistiert.
- **Pod-Erfassung:** Kein Dauer-Watcher/Background-Poller. Pod-Fehler werden nur
  während einer aktiv im Sidekick geöffneten Pod-Log-Beobachtung erfasst und
  persistiert (bewusste Lücke außerhalb aktiver Sessions, ressourcenschonend).
- **Retention:** 7 Tage, automatisiert per CronJob (nicht nur ein manueller
  Taskfile-Task wie beim `ai_call_log`-Vorbild — dort existiert *kein*
  tatsächlicher Scheduler, die "90 Tage Retention" ist unvollzogene Doku-Behauptung).
- **Log-Level:** Nur `error` wird persistiert/angezeigt (kein `warn`/`info`/`debug`).
- **UI:** Neuer Moduswechsel "Live" / "Letzte 24h" in `LogsSidekickView.svelte`,
  kein Vermischen von Live-Stream und Historie in derselben Liste.

## Architektur

```
SERVER                              BROWSER (Admin-Session)
logger.ts (Pino, multistream)       window.onerror/unhandledrejection
  ├─ stdout → Promtail/Loki           └─ browser-collector.ts
  ├─ serverLogBuffer (bestehend)          ├─ addEntry() (lokal, live, wie bisher)
  └─ NEU: error>=level → persistError()   └─ NEU: POST /api/admin/ops/error-log
              │                                          │
              ▼                                          ▼
        Tabelle error_log  ◀──────────── POST /api/admin/ops/error-log
              ▲                          (auch vom Pod-Stream-Handler befüllt,
              │                           nur während aktiver Beobachtung)
    GET /api/admin/ops/error-log?since=24h
              │
              ▼
   LogsSidekickView: neuer Modus "Letzte 24h" (Toggle neben "Live")
```

## Datenmodell

Neue Migration `website/src/db/migrations/20260703_create_error_log.sql`
(Vorbild `20260621_create_ai_call_log.sql`, aber mit tatsächlich durchgesetztem
Cleanup statt nur dokumentierter Retention):

```sql
CREATE TABLE error_log (
  id bigserial PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('server','browser','pod')),
  message text NOT NULL,
  namespace text,        -- nur bei source='pod'
  pod_name text,         -- nur bei source='pod'
  meta jsonb
);
CREATE INDEX error_log_ts_idx ON error_log (ts DESC);
```

## Bausteine

**Server-Schreibpfad**
- `website/src/lib/logging/error-log-store.ts` — `persistError(entry)`: Fire-and-forget
  Insert (analog `ai-metrics.ts` `logAiCall`), eigener try/catch mit `logger.error`
  bei Insert-Fehlern, blockiert nie den Hauptpfad.
- `website/src/lib/logger.ts` — zusätzlicher Pino-Stream, filtert `level >= error`,
  ruft `persistError()`.

**Browser-Schreibpfad**
- `website/src/pages/api/admin/ops/error-log.ts` — `POST` (admin-gegated:
  `getSession` + `isAdmin`, `401` sonst), nimmt `{ source, message, meta }` an,
  ruft `persistError()`.
- `website/src/lib/logging/browser-collector.ts` — zusätzlich zu `addEntry()` ein
  Fire-and-forget `fetch(POST /api/admin/ops/error-log)` bei erfassten Fehlern.

**Pod-Schreibpfad**
- `website/src/components/assistant/LogsSidekickView.svelte` — der bestehende
  `openPodLogStream`-Handler erkennt via `parsePodLine`/`textToLevel` Zeilen mit
  `level=error` und sendet sie zusätzlich an `POST /api/admin/ops/error-log`
  (nur solange der Pod-Stream aktiv geöffnet ist).

**Lese-API**
- `error-log.ts` erhält zusätzlich `GET ?since=24h` (admin-gegated): liefert
  `error_log`-Zeilen der letzten 24h als `LogEntry[]`, sortiert nach `ts DESC`.

**UI**
- `LogsSidekickView.svelte`: neuer Moduswechsel "Live" / "Letzte 24h" oberhalb der
  bestehenden Chips. Im 24h-Modus: Fetch beim Aktivieren + manueller
  Refresh-Button, Source-Chips bleiben aktiv filterbar, Level-Chips sind
  deaktiviert dargestellt (nur `error` existiert in diesem Datensatz).
  Gleiche Farbcodierung/Zeilen-Rendering wie im Live-Modus (Wiederverwendung
  `levelClass`/`levelLabel` aus `log-format.ts`).

**Retention/Cleanup**
- `DELETE FROM error_log WHERE ts < now() - interval '7 days'`, täglich.
- Neuer CronJob `k3d/error-log-retention-cronjob.yaml`, gebaut nach dem
  bestehenden Muster (`k3d/tests-retention-cronjob.yaml`): HTTP-Trigger-Endpoint
  + `CRON_SECRET`-Auth, kein rein manueller Taskfile-Task als einzige Absicherung.

## Daten-/Fehlerfluss

- Persistenz ist strikt additiv zum bestehenden Live-Store — der Live-Pfad
  (`log-store.ts`, SSE) bleibt unverändert.
- Fail-soft: Insert-Fehler in `persistError()` werden geloggt, aber unterbrechen
  nie den Hauptpfad (Server-Response, Browser-Fehlerbehandlung, Pod-Stream).
- Kein Datenleck: `error_log` ist admin-only lesbar (`isAdmin`-Gate auf GET/POST).

## Tests

- Vitest: `error-log-store.test.ts` (Fire-and-Forget-Verhalten, Fehlerfall im
  Insert bricht Hauptpfad nicht ab).
- API-Endpoint-Tests: `401` ohne Admin (POST und GET), korrekte 24h-Fensterung
  bei GET, Validierung des POST-Payloads.
- BATS/Kustomize-Struktur-Test für den neuen CronJob (analog bestehendem
  Retention-CronJob-Test, z.B. `tests-retention-cronjob`-Pendant).

## Out of Scope (YAGNI)

- Loki-Cross-Service-Aggregation bleibt unverändert außen vor (siehe
  Ursprungs-Design-Dokument).
- Pod-Fehler außerhalb aktiver Sidekick-Beobachtungsfenster werden nicht
  rückwirkend erfasst (bewusste Lücke).
- Persistenz von `warn`/`info`/`debug`-Leveln.
- Gespeicherte Filter-Presets, Ersetzen der bestehenden Live-Ansicht.
