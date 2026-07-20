---
title: "brett-controls-rework — Implementation Plan"
ticket_id: T002006
domains: [brett, frontend]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brett-controls-rework — Implementation Plan

_Ticket: T002006 — Spec: `docs/superpowers/specs/2026-07-20-brett-controls-rework-design.md`_

## File Structure

```
brett/src/client/board-dblclick.ts        (NEU — pure dblclick-Entscheidung)
brett/src/client/board-boot.ts            (dblclick-Handler nutzt board-dblclick)
brett/src/client/ui/fig-panel.ts          (spawnOfflineNotice bei WS nicht OPEN)
brett/src/client/ui/lobby.ts              (Empty-/Error-Feedback im Vorlagen-Dropdown)
brett/src/client/ui/primitives.ts         (NEU: styleSelect())
brett/src/client/ui/hud.ts                (Sprachwahl-Select via styleSelect)
brett/src/client/ui/topbar-participants.ts (Rollen-Select via styleSelect)
brett/src/client/ui/zone-editor.ts        (Zonen-Select via styleSelect)
brett/src/server/routes/admin.ts          (BRETT_BRAND statt BRAND)
brett/test/board-dblclick.test.ts         (NEU — node:test Verhaltens-Tests)
brett/test/templates-brand-env.test.ts    (NEU — node:test Brand-Env-Test)
tests/spec/brett.bats                     (T002006-Struktur-Tests — bereits committed, RED)
```

S1-Budgets (`.ts`-Limit 600, keine Baselines — wirksame Schwelle = 600):
`board-boot.ts` 549 Zeilen → Budget 51; `lobby.ts` 362 → 238; `fig-panel.ts` 243 → 357;
`primitives.ts` 149 → 451; `admin.ts` 118 → 482; `hud.ts` 352 → 248;
`topbar-participants.ts` 174 → 426; `zone-editor.ts` 209 → 391. Alle Änderungen sind
klein (< 30 Zeilen je Datei); `board-boot.ts` wird durch die Extraktion der
dblclick-Logik netto eher kürzer.

## Task 1 — RED: Failing-Tests verifizieren

Die strukturellen Tests für T002006 liegen bereits in `tests/spec/brett.bats`
(Abschnitt "T002006: Controls-Rework"). Auf dem aktuellen Branch-Stand MÜSSEN sie rot sein:

```bash
bats tests/spec/brett.bats
# expected: FAIL (die 5 T002006-Tests sind rot, solange der Fix fehlt)
```

## Task 2 — Doppelklick-Spawn: pure Entscheidung extrahieren

1. Neues Modul `brett/src/client/board-dblclick.ts` (keine Imports von `state`/`ws-client`;
   reine Funktion, Kontext wird injiziert — T001931-Konvention):

```ts
export type DblclickFloorAction = { kind: 'spawn'; x: number; z: number };

/**
 * Entscheidet die Aktion für einen Doppelklick auf freien Boden.
 * Doppelklick spawnt IMMER eine neue Figur — unabhängig von der Selektion.
 * (Der frühere Selektions-Teleport verhinderte Mehrfach-Spawn; Bewegen bleibt Drag.)
 */
export function dblclickFloorAction(target: { x: number; z: number }): DblclickFloorAction {
  return { kind: 'spawn', x: target.x, z: target.z };
}
```

2. In `brett/src/client/board-boot.ts` im dblclick-Handler den Zweig
   `if (fig) { easeFigure(...) } else { figPanel.addFigure(...) }` ersetzen durch:
   `const action = dblclickFloorAction(target); figPanel.addFigure({ x: action.x, z: action.z });`
   — Import `import { dblclickFloorAction } from './board-dblclick';`. Der Figuren-Treffer-Zweig
   (Appearance-Drawer) und das Magnet-Snapping bleiben unverändert. Die dann ungenutzte
   `easeFigure`-Hilfsfunktion prüfen: wird sie sonst nirgends genutzt, entfernen (Budget-Gewinn).

3. Neuer Test `brett/test/board-dblclick.test.ts` (node:test): Doppelklick-Aktion ist
   immer `spawn`, Koordinaten werden durchgereicht.

```bash
cd brett && npx tsx --test test/board-dblclick.test.ts
```

## Task 3 — Brand-Env-Fix in admin.ts

In `brett/src/server/routes/admin.ts` (`GET /api/templates`):

```ts
const brand = process.env.BRETT_BRAND || process.env.BRAND || 'mentolder';
```

Neuer Test `brett/test/templates-brand-env.test.ts` (node:test, source-basiert analog
`facelift-tokens.test.ts`): `routes/admin.ts` referenziert `BRETT_BRAND` und nicht mehr
ausschließlich `process.env.BRAND`.

## Task 4 — Lobby-Dropdown: Empty-/Error-Feedback

In `brett/src/client/ui/lobby.ts` beide Template-Fetches erweitern:

1. Hilfsfunktion (lokal in lobby.ts) `appendNotice(select, text)` — fügt eine
   `<option disabled>` mit dem Text hinzu und entfernt eine ggf. vorhandene alte Notice.
2. `.catch(...)` der beiden Fetches: statt Leerlauf → `appendNotice(tplSelect, 'Vorlagen konnten nicht geladen werden')`.
3. Nach Abschluss BEIDER Fetches (Promise.allSettled-Muster): wenn außer dem Placeholder
   keine wählbare Option existiert → `appendNotice(tplSelect, 'Keine Vorlagen vorhanden')`.

## Task 5 — Gemeinsamer Select-Styler

1. `brett/src/client/ui/primitives.ts`: neue Funktion

```ts
export function styleSelect(el: HTMLSelectElement): void {
  el.style.background = 'var(--brett-ink-850)';
  el.style.color = 'var(--brett-fg)';
  el.style.border = '1px solid var(--brett-line-2)';
  el.style.borderRadius = '8px';
  el.style.padding = '4px 8px';
  el.style.fontFamily = 'var(--brett-font-sans)';
}
```

   Options bleiben lesbar: in `styleSelect` zusätzlich pro `option` dunklen Hintergrund
   setzen (`background: var(--brett-ink-850); color: var(--brett-fg)`), damit die native
   Options-Liste auf dunklem UI nicht hell/unlesbar aufklappt.

2. Anwenden in `brett/src/client/ui/hud.ts` (`mountLangSelect` — ersetzt die
   Inline-Styles inkl. des `opt.style.color='#000'`-Workarounds),
   `brett/src/client/ui/topbar-participants.ts` (Rollen-Select) und
   `brett/src/client/ui/zone-editor.ts` (Varianten-Select). Keine Brand-Domain-Literale,
   keine neuen Hex-Farben (Token-Tests `facelift-tokens.test.ts` /
   `no-hardcoded-brand-css.test.ts` bleiben grün).

## Task 6 — Spawn-Offline-Feedback

In `brett/src/client/ui/fig-panel.ts` `addFigure`: wenn der WS nicht OPEN ist,
`spawnOfflineNotice()` aufrufen — kleine exportierte Funktion (im selben Modul), die über
den bestehenden Toast-/Hinweis-Mechanismus (vgl. `export-toast`) einen Hinweis zeigt:
"Figur noch nicht synchronisiert – Verbindung wird aufgebaut". Kein Verhaltens-Change
bei offenem WS.

## Task 7 — GREEN + Verifikation

1. Struktur-Tests jetzt grün:

```bash
bats tests/spec/brett.bats
```

2. Brett-Testsuite + Typecheck:

```bash
cd brett && npm test && npm run typecheck
```

3. Mandatory CI-Gates (Repo-Root):

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

4. Nach Test-Neuzugängen: `task test:inventory` und geändertes Inventar committen.
