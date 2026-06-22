---
title: Zentrales Logging — Sidekick-Widget
date: 2026-06-22
status: approved
domains: [website, observability]
ticket_id: ""
plan_ref: ""
---

# Zentrales Logging → Sidekick-Widget

## Ziel

Alle Logs werden in **eine** admin-gegatete Logging-View im `PortalSidekick`
verteilt, dort **filterbar** (Level + Quelle + Text) und nach **echtem
Log-Level farbcodiert**. Drei Quellen fächern in einen gemeinsamen
Log-Bus (Shared Store); die bestehende Admin-Ops-Log-Ansicht teilt sich die
Farb-/Parse-Logik mit dem Widget.

## Entscheidungen (mit User fixiert)

- **Quellen:** Server-App-Logs (Pino/API), Browser-Fehler, Live-Pod-Logs.
  Loki-Cross-Service-Aggregation ist **out of scope**.
- **Sichtbarkeit:** Nur Admins (`helpContext === 'admin'` clientseitig;
  `getSession` + `isAdmin` serverseitig, `401` sonst).
- **Wiederverwendung:** Geteilte Logik in einem Modul; `LogsSidekickView` **und**
  `admin/ops/LogsTab` konsumieren dieselben Parse-/Color-Helfer.
- **Server-Transport:** In-Process-Ringpuffer + SSE (dev+prod-Parität, kein
  k8s-Zwang, strukturiertes JSON).

## Architektur

```
 SERVER (Astro SSR, ein Node-Prozess)          BROWSER (Admin-Session)
 logger.ts (Pino, multistream)                 LogsSidekickView ┐ teilen sich
   ├─ stdout ──────────► Promtail/Loki         admin/ops/LogsTab┘ log-format.ts
   └─ serverLogBuffer.pushRaw(line)  ◀NEU              │
   GET /api/admin/ops/server-logs/stream ─SSE─►  log-store (writable, cap 2000,
   GET /api/admin/ops/log-stream/stream  ─SSE─►   filter: level+source+text)
            (bestehend, Pod-Logs)                       ▲
                                          window.onerror / unhandledrejection
                                          → browser-collector (nur Admin)
```

## Bausteine

**Shared (`website/src/lib/logging/`)**
- `log-types.ts` — `LogEntry { ts, level, source, message, meta? }`, `LogLevel`,
  `LogSource`.
- `log-format.ts` — pure: `pinoLevelToLevel(n)`, `textToLevel(line)`,
  `levelClass(level)`, `levelLabel(level)`, `parsePinoLine(raw, source)`,
  `parsePodLine(raw)`, `levelClassFromText(line)` (Legacy-Komfort für Ops-Tab).
- `log-store.ts` — `writable<LogEntry[]>` + `addEntry`, `clearLog`, gekappter
  Ring (cap 2000); pure `filterEntries(entries, filters)`.
- `browser-collector.ts` — `registerBrowserLogCapture(add)`: `window.onerror`,
  `onunhandledrejection`, optional `console.error/warn`; idempotent.
- `log-streams.ts` — `openServerLogStream`, `openPodLogStream`: EventSource→add + Cleanup.

**Server-Backbone**
- `lib/server-log-buffer.ts` — Ringpuffer-Singleton (cap 500) + Subscriber-Set.
- `lib/logger.ts` — `pino.multistream([stdout, bufferStream])`; stdout/Loki unverändert.
- `pages/api/admin/ops/server-logs/stream.ts` — admin-gegateter SSE: Backlog + Live.

**Sidekick**
- `components/assistant/LogsSidekickView.svelte` — Source-/Level-Chips, Textfilter,
  farbcodierte Liste, Auto-Scroll, Leeren; optional Pod-Auswahl (kompakt).
- `components/PortalSidekick.svelte` — `'logs'`-View + Collector-Registrierung (Admin).
- `components/assistant/SidekickHome.svelte` — Nav-Item (admin-gegated).

**Refactor**
- `components/admin/ops/LogsTab.svelte` — nutzt `levelClassFromText`/`parsePodLine`
  aus `log-format.ts` statt lokaler Kopie. Kein Verhaltensbruch.

## Daten-/Fehlerfluss

- Jede Quelle normalisiert auf `LogEntry` → `addEntry()`. Store = einzige Wahrheit;
  Views rendern nur `filterEntries(...)`.
- Fail-soft: Stream-Abbruch markiert Quelle als „getrennt" (kein Crash, Reconnect).
- Kein Datenleck: Browser-Logs bleiben clientseitig in der Admin-Session.

## Tests

- Vitest: `log-format.test.ts`, `log-store.test.ts`, `browser-collector.test.ts`,
  `server-log-buffer.test.ts`.
- Auth-Gate des SSE-Endpoints (`401` ohne Admin).

## Out of Scope (YAGNI)

Loki-Aggregation, zentrale Persistenz fremder Browser-Logs, gespeicherte
Filter-Presets, Ersetzen des Admin-Ops-Tabs.
