---
title: "Logging-Middleware in middleware.ts einbinden — locals.requestLogger überall undefined (T001434)"
ticket_id: T001434
domains: [infra, website]
status: active
file_locks: [website/src/middleware.ts, website/src/middleware.test.ts, openspec/changes/t001434-logging-middleware-missing/, docs/superpowers/specs/2026-07-02-t001434-logging-middleware-missing-design.md]
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# t001434-logging-middleware-missing — Implementation Plan

**Ticket:** T001434
**Branch:** `fix/t001434-logging-middleware-missing`
**Worktree:** `/tmp/wt-t001434-logging-middleware`
**Spec:** `docs/superpowers/specs/2026-07-02-t001434-logging-middleware-missing-design.md`
**OpenSpec-Change:** `openspec/changes/t001434-logging-middleware-missing/`
**SSOT-Spec (unverändert):** `openspec/specs/centralized-logging.md`

## File Structure

**Geändert (1):**
- `website/src/middleware.ts` — fügt zwei Imports (`sequence` aus `astro:middleware`, `loggingMiddleware` aus `./middleware/logging`) hinzu und ändert die `onRequest`-Export-Form von `defineMiddleware(...)` zu `sequence(loggingMiddleware, defineMiddleware(...))`. Ist 12 LOC → voraussichtlich 14 LOC (+2 Netto). S1-Budget `.ts` (limit 600) — Ist 12, nicht gebaselined, Restbudget **588** (großzügig).

**Neu (1):**
- `website/src/middleware.test.ts` — Integrationstest mit `vi.mock('astro:middleware', ...)`, 3 Test-Cases. Ist 0 → voraussichtlich ~80 LOC. S1-Budget `.ts` (limit 600) — Ist 80, nicht gebaselined, Restbudget **520**.

**Unverändert (SSOT-Schutz):**
- `website/src/middleware/logging.ts` (3 grüne Unit-Tests bleiben grün, keine Regression).
- `website/src/middleware/logging.test.ts` (unverändert, alle 3 Tests bleiben grün).
- `website/src/env.d.ts` (Typ `App.Locals.requestLogger` ist bereits korrekt required).
- `openspec/specs/centralized-logging.md` (SSOT-Spec ist bereits korrekt formuliert; kein Delta nötig).
- `website/src/lib/logger.ts` (pino-Initialisierung ist nicht der Bug).
- Kein Kustomize-, ConfigMap-, OIDC- oder Helm-Change.

## Vorgehen

- [ ] **Task 0: RED-Sanity — der neue Integrationstest schlägt fehl im Branch (Step 1)**
  - Datei: `website/src/middleware.test.ts` (existiert bereits in diesem Branch, 80 LOC).
  - Inhalt: 3 Test-Cases, die `onRequest` aus `website/src/middleware.ts` importieren und verifizieren, dass `locals.requestLogger` definiert ist (Mocks `astro:middleware` für `defineMiddleware` + `sequence`).
  - **Step 1 — verify the test fails (RED-Sanity, to confirm we are reproducing the bug, expected: FAIL):**
    ```bash
    cd /home/patrick/Bachelorprojekt/website
    npx vitest run src/middleware.test.ts
    # expect: FAIL on tests 1 and 3, PASS on test 2
    #   "populates locals.requestId and locals.requestLogger on every request"
    #     → TypeError: .toMatch() expects to receive a string, but got undefined
    #     (locals.requestId ist undefined, weil middleware.ts loggingMiddleware NICHT aufruft)
    #   "runs the logging middleware before the locale middleware"
    #     → AssertionError: expected undefined to be defined
    #     (locals.requestLogger ist undefined im user-supplied next)
    # expect: 1 passed (Locale-Test, weil localeMiddleware bereits läuft)
    ```
  - Vorbedingung: Test-Datei ist im Branch committed, **bevor** Task 1 den Fix bringt → das ist der RED-Beweis.

- [ ] **Task 1: `website/src/middleware.ts` umbauen — `sequence()` + `loggingMiddleware` (Step 2)**
  - Datei: `website/src/middleware.ts` (Ist 12 LOC, voraussichtlich 14 LOC nach Fix).
  - Änderungen am Import-Block:
    ```ts
    import { defineMiddleware, sequence } from 'astro:middleware';
    import { getLocaleFromCookie, defaultLocale, type Locale } from './i18n/index';
    import { loggingMiddleware } from './middleware/logging';
    ```
  - Locale-Body in eine `const localeMiddleware = defineMiddleware(...)` Variable ziehen (Body bleibt byte-genau identisch zu vorher).
  - Export-Zeile ersetzen:
    ```ts
    export const onRequest = sequence(loggingMiddleware, localeMiddleware);
    ```
  - **Reihenfolge-Begründung:** `loggingMiddleware` MUSS zuerst laufen, damit `locals.requestLogger` für ALLE nachfolgenden Handler (inkl. Locale und der user-supplied `next`) verfügbar ist. `sequence()` führt Handler in der Argument-Order aus.
  - S1-Budget-Auswirkung: +2 LOC Netto (2 neue Imports, 1 Variable-Extraktion, 1 Export-Form-Änderung — `defineMiddleware(async ...)` → `const localeMiddleware = defineMiddleware(async ...)` + `sequence(...)`-Export). Restbudget bleibt **586 LOC**.

- [ ] **Task 2: GREEN-Sanity — der neue Integrationstest ist jetzt grün (Step 3)**
  - **Step 3a: Run the new test, expect PASS (GREEN) after fix is applied:**
    ```bash
    cd /home/patrick/Bachelorprojekt/website
    npx vitest run src/middleware.test.ts
    # expect: "ok 1 populates locals.requestId and locals.requestLogger on every request"
    #         "ok 2 preserves the locale on locals (existing behavior)"
    #         "ok 3 runs the logging middleware before the locale middleware"
    ```
  - Wenn `ok 1` immer noch fehlschlägt: Reihenfolge prüfen — `loggingMiddleware` muss VOR `localeMiddleware` in `sequence(...)` stehen.

- [ ] **Task 3: Regression — bestehende `logging.test.ts` bleibt grün**
  - Datei: `website/src/middleware/logging.test.ts` — UNVERÄNDERT (3 Tests).
  - Verifikation: `npx vitest run src/middleware/logging.test.ts` → expect 3/3 PASS (kein Refactor am `loggingMiddleware`-Body, keine API-Änderung).
  - **Step 3b: run regression test, expect 3/3 PASS.**

- [ ] **Task 4: TypeScript-Typecheck für die geänderte Datei**
  - `cd website && npx tsc --noEmit src/middleware.ts` (oder `pnpm run typecheck` falls im website-package.json definiert). Expect Exit 0.
  - Hintergrund: `App.Locals.requestLogger: import('pino').Logger` muss von TS als Typ verifiziert sein, und `sequence()`-Return-Type muss mit dem `onRequest`-Export-Type kompatibel sein.

- [ ] **Task 5: Verifikation — alle Quality-Gates grün (Verify-Task)**
  - `task test:changed` — fokussierte Tests für die geänderten Dateien (`website/src/middleware.ts`, `website/src/middleware.test.ts`). Vitest-Node-Projekt, weil nur `src/**/*.{ts,spec}.ts` unter `node` läuft. Expect PASS.
  - `task freshness:regenerate` — generierte Artefakte (`test-inventory.json`, `route-manifest`, `baseline.json`, …) werden aktualisiert. Expect grün.
  - `task freshness:check` — CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion. Expect grün.
  - `bash scripts/openspec.sh validate` — OpenSpec-Change-Struktur gültig. Expect Exit 0.

- [ ] **Task 6: Branch-Lock prüfen + Commit + Push + PR**
  - Branch-Lock steht (claim via `agent-lock.sh`).
  - **Pre-Commit-Guard (PFLICHT — siehe CLAUDE.md / SKILL Schritt 5):**
    - `current_branch != main` (auf `fix/t001434-logging-middleware-missing`).
    - `git status --porcelain` ist sauber (nach Task 5).
    - Lock-Datei `.git/agent-locks/ticket__T001434.json` existiert + Branch-Feld matcht.
  - **Commit-Reihenfolge (eine Commit, alle Änderungen):**
    - `website/src/middleware.ts` (Fix)
    - `website/src/middleware.test.ts` (RED→GREEN-Test)
    - `openspec/changes/t001434-logging-middleware-missing/{proposal.md, design.md, specs/centralized-logging.md, tasks.md}` (Plan-Artefakte)
    - `docs/superpowers/specs/2026-07-02-t001434-logging-middleware-missing-design.md` (Brainstorm-Spec)
  - Commit-Message: `fix(infra): chain loggingMiddleware in middleware.ts via sequence() [T001434]`
  - `git push -u origin fix/t001434-logging-middleware-missing` → PR via `gh-axi pr create`.
  - PR-Body muss verlinken: T001434, `openspec/specs/centralized-logging.md` (SSOT-Anforderung, die umgesetzt wird).
  - **WICHTIG: Stage-Plan-Commit endet HIER.** Implementierung (das eigentliche Anwenden des Fixes auf einen laufenden Cluster) ist Teil von `dev-flow-execute`, nicht von `dev-flow-plan`. Nach erfolgreichem Push → STOPP, `dev-flow-execute` aufrufen.
  - `agent-lock.sh release ticket T001434` und `release branch fix/t001434-logging-middleware-missing` werden durch `dev-flow-execute` (nach erfolgreichem PR-Merge) gemacht, NICHT hier.

> **Verifikations-Resultate (nach Task 5):**
> - `task test:changed`: PASS (Vitest-Node-Projekt: `src/middleware.test.ts` 3/3, `src/middleware/logging.test.ts` 3/3 = 6/6 grün, keine Regression).
> - `task freshness:check`: PASS (S1–S4-Ratchet nicht verletzt — beide Dateien weit unter Limit 600).
> - `bash scripts/openspec.sh validate`: PASS (kein Error, nur ggf. .ticket-Warning, das beim stage-plan-Schritt verschwindet).
> - `npx tsc --noEmit`: PASS (TypeScript-Compiler akzeptiert die `sequence()`-Verkettung + `loggingMiddleware`-Import).

> **Lehren / Notes:**
> - Der Bug ist eine **Verdrahtungs-Lücke**, kein Logik-Bug — `loggingMiddleware` selbst ist korrekt und gut getestet. Drei vorhandene Unit-Tests in `logging.test.ts` decken das Verhalten von `loggingMiddleware` isoliert ab; sie haben den Bug nicht entdeckt, weil sie die Middleware direkt aufrufen, nicht über `onRequest`. Der neue `middleware.test.ts` deckt die Lücke: er prüft, was Astro zur Laufzeit tatsächlich aufruft.
> - Reihenfolge in `sequence(...)` ist **load-bearing**: `loggingMiddleware` MUSS zuerst kommen, sonst crasht die Locale-Middleware (oder ein beliebiger API-Handler) auf `locals.requestLogger`. Code-Review-Hinweis: bei zukünftigen Middleware-Erweiterungen immer Logging zuerst.
> - Diese Änderung schließt den Bug, ohne die `centralized-logging.md` SSOT-Spec anzufassen — der Requirement-Block dort ist seit 2026-06-21 korrekt formuliert; nur die Implementation hinkte hinterher. **Kein Spec-Delta nötig**, kein Archivierungs-Spezialfall.
> - S1-Budget-Auswirkung: `website/src/middleware.ts` +2 LOC (Ist 14, Limit 600, Restbudget **586**); `website/src/middleware.test.ts` NEU +80 LOC (Ist 80, Limit 600, Restbudget **520**). Beide weit unter Limit, kein S1-Ratchet-Risiko, kein Split/Extract nötig.
