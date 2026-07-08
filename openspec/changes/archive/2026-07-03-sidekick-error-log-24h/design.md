## Context

Das bestehende zentrale Logging (`docs/superpowers/specs/2026-06-22-logging-sidekick-widget-design.md`)
ist rein In-Memory: `serverLogBuffer` (Cap 500) + `log-store.ts` (Cap 2000,
Svelte-writable). Beide sind mengenbasiert gekappt, nicht zeitbasiert, und
überleben weder Server-Neustart noch Browser-Reload. Für eine echte
"Fehler der letzten 24h"-Ansicht ist Persistenz in Postgres (`shared-db`)
nötig — analog zum bestehenden `ai_call_log`-Muster, aber mit tatsächlich
automatisiertem Cleanup (bei `ai_call_log` existiert nur ein manueller
Taskfile-Task, kein CronJob — die dokumentierte 90-Tage-Retention wird nie
durchgesetzt).

Vollständige Design-Entscheidungen inkl. User-Abstimmung:
`docs/superpowers/specs/2026-07-03-sidekick-error-log-24h-design.md`.

## Goals / Non-Goals

**Goals:**
- Persistierte, echte (keine Mock-Daten) 24h-Fehlerhistorie für Server-,
  Browser- und Pod-Quelle.
- Automatisiertes, tatsächlich durchgesetztes Retention-Cleanup (7 Tage).
- Wiederverwendung bestehender Farb-/Format-Logik (`log-format.ts`) und
  bestehendem Admin-Auth-Muster (`getSession` + `isAdmin`).

**Non-Goals:**
- Kein Hintergrund-Watcher/Poller für Pod-Logs — nur Erfassung während aktiv
  im Sidekick geöffneter Pod-Log-Beobachtung.
- Keine Loki-Cross-Service-Aggregation (bleibt unverändert außerhalb des Scopes).
- Keine Persistenz von `warn`/`info`/`debug`-Leveln.
- Kein Vermischen von Live-Stream und 24h-Historie in derselben Liste.

## Decisions

- **Eigene Tabelle `error_log` statt Erweiterung von `ai_call_log`:**
  `ai_call_log` ist domänenspezifisch für AI-Call-Metriken (Latenz, Modell,
  Tokens). Eine generische Fehler-Log-Tabelle mit anderem Schema (Quelle,
  Namespace/Pod statt AI-Metadaten) ist klarer getrennt und vermeidet
  Spalten-Overloading.
- **Fire-and-forget Insert (analog `ai-metrics.ts` `logAiCall`):** Persistenz
  darf den Hauptpfad (Server-Response, Browser-Fehlerbehandlung, Pod-Stream)
  nie blockieren oder crashen. `void persistError(...)` mit internem
  try/catch + `logger.error` bei Fehlschlag.
- **Server-seitige Erfassung über zusätzlichen Pino-Stream** statt Hooks an
  jeder Call-Site: zentral in `logger.ts`, filtert `level >= error`,
  konsistent mit dem bestehenden `pino.multistream`-Muster.
- **Browser/Pod über denselben POST-Endpoint** (`/api/admin/ops/error-log`)
  statt getrennter Endpoints: ein Schema, eine Auth-Prüfung, weniger
  Duplikation.
- **Echter CronJob statt Taskfile-Task für Retention:** Das Repo hat ein
  etabliertes Muster für automatisiertes Cleanup
  (`k3d/tests-retention-cronjob.yaml`, HTTP-Trigger + `CRON_SECRET`). Dieses
  Muster wird übernommen statt das bei `ai_call_log` unvollzogene
  "Taskfile-Task ohne Scheduler"-Vorbild zu wiederholen.

## Risks / Trade-offs

- [Pod-Fehler außerhalb aktiver Beobachtung fehlen in der 24h-Historie] →
  Akzeptierte, bewusste Lücke (User-Entscheidung) — vermeidet einen
  Dauerbetrieb-Poller mit zusätzlicher k8s-API-Last und Lifecycle-Komplexität.
- [Browser-Fehler können PII/DSGVO-relevante Daten in `message`/`meta`
  enthalten] → Admin-only Lesezugriff (gleiche Gate wie bestehender
  SSE-Stream), 7-Tage-Retention begrenzt die Aufbewahrungsdauer.
- [Zusätzlicher Pino-Stream verlangsamt Logging im Fehlerfall bei DB-Latenz] →
  Fire-and-forget (nicht awaited), Fehler im Insert werden nur geloggt, nie
  propagiert.

## Migration Plan

1. Migration `20260703_create_error_log.sql` anwenden (additiv, keine
   bestehenden Tabellen betroffen).
2. Server-/Browser-/Pod-Schreibpfade deployen (rückwärtskompatibel — Insert
   schlägt fail-soft fehl, falls Tabelle noch nicht vorhanden ist während
   eines Rollouts).
3. CronJob-Manifest anwenden (`task workspace:deploy`).
4. Rollback: CronJob und neue Code-Pfade sind additiv und können ohne
   Datenverlust an bestehender Funktionalität zurückgerollt werden; die
   `error_log`-Tabelle kann bei Rollback stehen bleiben (nächster Cleanup-Lauf
   räumt sie ohnehin ab).

## Open Questions

Keine — alle Design-Entscheidungen wurden im Brainstorming mit dem User fixiert
(siehe referenziertes Spec-Dokument).
