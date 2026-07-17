# Fix: Hydration-Fehler PortalSidekick — process is not defined

## Purpose

`PortalSidekick.svelte` importiert `{ logger }` aus `../lib/logger`, was ein server-seitiger pino-Logger ist, der `process.env`, `process.stdout` etc. referenziert. Da die Komponente mit `client:load` (AdminLayout) und `client:idle` (Layout) geladen wird, crasht der Client beim Hydrate mit "process is not defined".

## Scope

- Ersetze den pino-Import durch den browser-kompatiblen `browser-logger`
- Kein Server-Code nötig — der pino-Logger funktioniert server-seitig korrekt
