---
title: "G-FE03: Strukturierten Logger einführen + console.error/warn migrieren (141→0)"
ticket_id: T001299
domains: ["website","quality","observability"]
status: plan_staged
---

# g-fe03-structured-logger — Implementation Plan

## File Structure

| Status | Datei | Beschreibung |
|--------|-------|--------------|
| Neu | `website/src/lib/browser-logger.ts` | Browser-kompatibler Logger-Stub für Svelte-Komponenten |
| Geändert | `website/src/lib/logger.ts` | Ggf. child-Logger-Helper ergänzen |
| Geändert | `website/src/lib/**/*.ts` (ca. 30 Dateien) | `console.error/warn` → `logger.error/warn` |
| Geändert | `website/src/lib/**/*.test.ts` (ca. 8 Dateien) | `console.error`-Spy → Logger-Mock |
| Geändert | `website/src/pages/**/*.astro` (ca. 19 Dateien) | `console.error/warn` → `logger.error/warn` |
| Geändert | `website/src/components/**/*.svelte` (5 Dateien) | `console.error/warn` → `browserLogger.error/warn` |

---

## Task 0: Baseline messen (RED)

Ziel: Den aktuellen Ist-Zustand festhalten und beweisen, dass das Ziel noch nicht erreicht ist.

- [ ] Measure-Command ausführen:
  ```bash
  echo -n "error/warn: "; grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
  ```
  expected: FAIL (aktueller Wert: 141 — over target: 0 unstrukturierte Logs)

- [ ] Aufschlüsselung nach Kategorie dokumentieren:
  ```bash
  echo "lib (prod):"; grep -rEn 'console\.(error|warn)' website/src/lib --include='*.ts' | grep -v '\.test\.' | wc -l
  echo "lib (test):"; grep -rEn 'console\.(error|warn)' website/src/lib --include='*.ts' | grep '\.test\.' | wc -l
  echo "pages:"; grep -rEn 'console\.(error|warn)' website/src/pages --include='*.astro' | wc -l
  echo "components:"; grep -rEn 'console\.(error|warn)' website/src/components --include='*.svelte' | wc -l
  ```

---

## Task 1: Browser-Logger-Stub anlegen

Svelte-Komponenten laufen im Browser-Kontext. Pino setzt `process.stdout` voraus und ist dort nicht verwendbar. Ein schlanker Stub wird angelegt, der dieselbe API-Oberfläche wie der Server-Logger bietet und die `LogLevel`-Typen aus dem bereits vorhandenen `website/src/lib/logging/log-types.ts` nutzt.

- [ ] Datei `website/src/lib/browser-logger.ts` anlegen:
  ```typescript
  import type { LogLevel } from './logging/log-types';

  type Meta = Record<string, unknown>;

  function emit(level: LogLevel, msgOrMeta: string | Meta, msg?: string): void {
    const message = typeof msgOrMeta === 'string' ? msgOrMeta : (msg ?? '');
    const meta = typeof msgOrMeta === 'object' ? msgOrMeta : undefined;
    if (level === 'error') console.error('[browser]', message, meta ?? '');
    else if (level === 'warn') console.warn('[browser]', message, meta ?? '');
    else console.log('[browser]', message, meta ?? '');
  }

  export const browserLogger = {
    error: (msgOrMeta: string | Meta, msg?: string) => emit('error', msgOrMeta, msg),
    warn:  (msgOrMeta: string | Meta, msg?: string) => emit('warn',  msgOrMeta, msg),
    info:  (msgOrMeta: string | Meta, msg?: string) => emit('info',  msgOrMeta, msg),
  };
  ```

- [ ] Sicherstellen, dass der Stub keine Node.js-spezifischen Imports enthält und Vite beim Client-Bundle keinen Fehler wirft.

---

## Task 2: Server-side Lib-Module migrieren (Batch A — lib/*.ts, prod)

80 Vorkommen in ~30 Produktionsdateien unter `website/src/lib/`. Für jede Datei gilt:

1. Import `logger` aus dem relativen Pfad zu `../lib/logger` (oder `./logger` wenn bereits in `lib/`) ergänzen, sofern nicht vorhanden.
2. `console.error('text', err)` → `logger.error({ err }, 'text')` (pino-Konvention: Objekt als erstes Arg, String als zweites).
3. `console.warn('text', ...)` → `logger.warn({ ... }, 'text')`.
4. Bestehende pino-Imports in der Datei prüfen und Doppelimporte eliminieren.

Betroffene Dateien (vollständige Liste via `grep -rEl 'console\.(error|warn)' website/src/lib --include='*.ts' | grep -v '\.test\.'`):

- [ ] `ai-metrics.ts`
- [ ] `assistant/actions/portal/requestSession.ts`
- [ ] `assistant/llm.ts`
- [ ] `assistant/triggers.ts`
- [ ] `assistant/triggers/admin.ts`
- [ ] `assistant/triggers/portal.ts`
- [ ] `audit-log.ts`
- [ ] `auth.ts`
- [ ] `brett-bot.ts`
- [ ] `caldav.ts`
- [ ] `claude.ts`
- [ ] `email.ts`
- [ ] `embeddings.ts`
- [ ] `factory-ci.ts`
- [ ] `identity.ts`
- [ ] `invoice-payments.ts`
- [ ] `live-state.ts`
- [ ] `logging/browser-collector.ts`
- [ ] `nextcloud-files.ts`
- [ ] `nextcloud-talk-db.ts`
- [ ] `notifications.ts`
- [ ] `provider-config.ts`
- [ ] `questionnaire-db/schema.ts`
- [ ] `questionnaire-db/scoring.ts`
- [ ] `stripe-billing.ts`
- [ ] `systemtest/recorder.ts`
- [ ] `systemtest/test-run-bridge.ts`
- [ ] `talk.ts`
- [ ] `test-runner.ts`
- [ ] `ticket-triage.ts`
- [ ] `tickets-embed.ts`
- [ ] `tickets/email-templates.ts`
- [ ] `tickets/transition.ts`
- [ ] `whisper.ts`
- [ ] `whiteboard.ts`

Nach Abschluss: `grep -rEn 'console\.(error|warn)' website/src/lib --include='*.ts' | grep -v '\.test\.'` muss 0 ergeben.

---

## Task 3: Astro-Pages migrieren (Batch B — pages/*.astro)

19 Vorkommen in Astro-Frontmatter-Blöcken (serverseitig ausgeführt). Dieselbe Konvention wie Task 2.

Betroffene Dateien (vollständige Liste via `grep -rEl 'console\.(error|warn)' website/src/pages --include='*.astro'`):

- [ ] `pages/portal/loslernen.astro`
- [ ] `pages/admin/prompts.astro`
- [ ] `pages/admin/meetings.astro`
- [ ] `pages/admin/kalender.astro`
- [ ] `pages/admin/rechnungen.astro`
- [ ] `pages/admin/projekte.astro`
- [ ] `pages/admin/zeiterfassung.astro`
- [ ] `pages/admin/inbox.astro`
- [ ] `pages/admin/systemtest/board.astro`
- [ ] `pages/admin/app-catalog.astro`
- [ ] `pages/admin/projekte/[id].astro`
- [ ] `pages/admin/tickets/[id].astro`
- [ ] `pages/admin/termine.astro`
- [ ] Restliche Dateien per Grep identifiziert

Nach Abschluss: `grep -rEn 'console\.(error|warn)' website/src/pages --include='*.astro'` muss 0 ergeben.

---

## Task 4: Svelte-Komponenten migrieren (Batch C — components/*.svelte)

5 Vorkommen in Client-seitigem Svelte-Code. Import von `browserLogger` aus `$lib/browser-logger` statt des pino-Loggers.

- [ ] `components/assistant/AssistantWidget.svelte`:
  - `console.warn('[assistant] nudge fetch failed', err)` → `browserLogger.warn({ err }, '[assistant] nudge fetch failed')`
- [ ] `components/inbox/InboxApp.svelte`:
  - `console.error('[InboxApp] reload failed:', err)` → `browserLogger.error({ err }, '[InboxApp] reload failed')`
- [ ] `components/portal/InlineInvoicePayment.svelte`:
  - `console.error('[InlineInvoicePayment]', e)` → `browserLogger.error({ err: e }, '[InlineInvoicePayment]')`
- [ ] `components/portal/QuestionnaireWizard.svelte` (2 Vorkommen):
  - `console.warn('[wizard] failed to start evidence recorder', e)` → `browserLogger.warn({ err: e }, '[wizard] failed to start evidence recorder')`
  - `console.warn('[wizard] evidence finalize failed', e)` → `browserLogger.warn({ err: e }, '[wizard] evidence finalize failed')`

Nach Abschluss: `grep -rEn 'console\.(error|warn)' website/src/components --include='*.svelte'` muss 0 ergeben.

---

## Task 5: Testdateien migrieren (Batch D — *.test.ts)

37 Vorkommen in Testdateien. Drei Muster werden unterschiedlich behandelt:

**Muster 1 — Spy/Suppress** (talk.test.ts, auth.test.ts, whisper.test.ts, whiteboard.test.ts): Testcode patcht `console.error = () => undefined`, um erwartete Fehlermeldungen aus dem logger zu unterdrücken. Nach der Migration emittiert nicht mehr `console.error`, sondern `logger.error`. Die Tests werden auf `vi.mock` des Logger-Moduls umgestellt:

```typescript
import * as loggerModule from '../logger';
vi.spyOn(loggerModule.logger, 'error').mockReturnValue(undefined as any);
```

- [ ] `lib/talk.test.ts` — 16 Vorkommen: Alle `console.error`-Spy-Blöcke auf `vi.spyOn(logger, 'error')` umstellen.
- [ ] `lib/auth.test.ts` — Spy-Block ersetzen.
- [ ] `lib/whisper.test.ts` — Spy-Block ersetzen.
- [ ] `lib/whiteboard.test.ts` — Spy-Block ersetzen.

**Muster 2 — Diagnose-Output** (einvoice-profile.test.ts): `console.error(r.output)` dient als Testdiagnose bei Fehler, kein Spy-Target. Ersetzen durch `console.log`:

- [ ] `lib/einvoice-profile.test.ts` — 3 Vorkommen: `console.error(r.output)` → `console.log('[test-diag]', r.output)`.

**Muster 3 — Embeddings-Test** (embeddings.test.ts): Testname enthält `console.warn` als String-Literal im Testnamen. Kein Funktionsaufruf, kann unverändert bleiben — der Mess-Command sucht nach Funktionsaufrufen, kein Match.

- [ ] `lib/embeddings.test.ts` — prüfen, ob `console.warn` als Funktionsaufruf vorkommt; ggf. auf `vi.spyOn(logger, 'warn')` umstellen.

Nach Abschluss: `grep -rEn 'console\.(error|warn)' website/src --include='*.ts' | grep '\.test\.'` muss 0 ergeben.

---

## Task 6: Verify — Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-FE03` → Ziel-Status grün
- [ ] Mess-Command zeigt 0:
  ```bash
  echo -n "error/warn: "; grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
  ```
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
