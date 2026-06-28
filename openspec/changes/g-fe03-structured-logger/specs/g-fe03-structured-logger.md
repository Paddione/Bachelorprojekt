# g-fe03-structured-logger

## Purpose

Alle Server-side-Logging-Aufrufe in `website/src` sollen über den pino-basierten strukturierten Logger (`website/src/lib/logger.ts`) laufen, sodass Promtail/Loki jeden Log-Eintrag als JSON-Event mit Level, Service-Kontext und Korrelations-IDs indizieren kann. Browser-seitige Komponenten nutzen einen Browser-Logger-Stub mit identischer API. Kein Produktionscode darf mehr direkt `console.error` oder `console.warn` aufrufen.

## Requirements

- REQ-1: Der Mess-Command `grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l` muss reproduzierbar und deterministisch sein. Er wird ohne zusätzliche Flags direkt aus dem Repo-Root ausgeführt.
- REQ-2: Nach Abschluss der Migration liefert der Mess-Command den Wert `0`.
- REQ-3: Alle Server-side-Module (`lib/*.ts`, `pages/*.astro`) importieren `logger` aus `website/src/lib/logger.ts` und verwenden ausschließlich `logger.error()` bzw. `logger.warn()`.
- REQ-4: Browser-seitige Svelte-Komponenten (`components/**/*.svelte`) importieren `browserLogger` aus `website/src/lib/browser-logger.ts`. Der Stub enthält intern `console.error`/`console.warn`, aber kein Produktionscode ruft diese Funktionen direkt auf.
- REQ-5: Testdateien, die `console.error` als Spy-Target verwenden, mocken stattdessen `logger.error` via `vi.spyOn`. Diagnose-Ausgaben in Tests verwenden `console.log`.
- REQ-6: `website/package.json` enthält bereits `pino` als Dependency. Keine zusätzliche Logger-Bibliothek wird eingeführt.
- REQ-7: `task test:changed` bleibt grün — bestehende Testsemantik wird durch die Logger-Mock-Umstellung nicht verletzt.
- REQ-8: Das Admin-Logging-Widget empfängt weiterhin Server-Log-Entries über `serverLogBuffer` (Multistream in `logger.ts` bleibt unverändert).

## Acceptance Criteria

- THEN liefert `echo -n "error/warn: "; grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l` den Wert `error/warn: 0`.
- THEN ist `bash scripts/health-goals-check.sh --only=G-FE03` grün.
- THEN enthält `website/src/lib/browser-logger.ts` eine typsichere `browserLogger`-Implementierung ohne Node.js-spezifische Imports.
- THEN gibt `task test:changed` keinen Fehler zurück.
- THEN gibt `task freshness:check` keinen Fehler zurück.
