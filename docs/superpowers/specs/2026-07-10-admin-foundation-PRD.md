---
ticket_id: T001786
plan_ref: null
status: active
date: 2026-07-10
---

# PRD — Admin-Fundament Konsolidierung (Epic T001786)

> **Artefakt-Ebene:** Dieses PRD ist **Upstream-Kontext** und Roadmap für das Epic. Es ist **kein SSOT** —
> SSOT sind die konsolidierten `openspec/specs/`-Specs, die aus den Change-Deltas der einzelnen Stränge
> entstehen. Das PRD priorisiert und sequenziert; die einzelnen Changes tragen die verbindlichen
> Requirements.

## Problem

Die Admin-GUI (`website/src/**/admin*`, ~47.000 LOC, 91 Svelte-Komponenten) ist über Monate gewachsen,
ohne dass gemeinsame Muster durchgesetzt wurden. Zwei Codebase-Explorationen (2026-07-10) ergaben:
**kein einziger toter Component**. Die Schuld ist reine **Muster-Duplikation** — gute Abstraktionen
wurden gebaut und nie durchgesetzt:

- `ui/AdminTabs.svelte` existiert → nur 4 Consumer; 4 Hubs bauen Tab-Logik neu.
- `lib/admin-api.ts` (`apiCall` mit Retry/401/Toast) → 5 Consumer; **71 Komponenten** nutzen rohes `fetch()`.
- `--admin-*`-Alias-Schicht → nur 24 von 52 `<style>`-Komponenten nutzen sie.
- 62 Admin-Seiten wiederholen denselben Auth-Block; kein `requireAdmin()`-Helper.
- 8 Modals + 4 Drawer ohne gemeinsame Basis; nur 1 Modal ist a11y-konform.
- 3 Token-Ebenen für dieselben Farben; `--sidebar-width` dreifach definiert.
- 23 Redirect-Stub-Seiten.

## Ziel & Erfolgskriterien

Das schon vorhandene `ui/`-Fundament **konsequent verwenden statt Neues bauen**. Erst wenn das
Fundament trägt, folgt der Visual-Layer (react-bits als React-Islands).

Erfolg = messbar:
- **Eine** Farb-Token-Quelle (`@theme`); `admin-token-alias.test.ts` grün gegen die neue Quelle; keine
  Farb-Dublette mehr.
- **Eine** Modal-/Drawer-Basis; alle 8 Modals + 4 Drawer haben `role="dialog"`, Focus-Trap, Escape.
- `requireAdmin()`-Helper; **0** inline-kopierte Auth-Blöcke in Admin-Seiten; einheitliches Redirect-Ziel.
- **0** rohe `fetch()`-Aufrufe gegen `/api/*` in Admin-Komponenten (alle über `apiCall`); Fehleranzeige
  einheitlich über `admin-toast`.
- **Eine** Tab-Primitive (`AdminTabs`) in allen 4 Hubs.
- **0** Redirect-Stub-`.astro`-Dateien; alte Pfade weiter per `301` erreichbar.

## Roadmap (4 Wellen, 6 Stränge)

| Welle | Strang | Change-Slug | Ticket | Abhängigkeit |
|---|---|---|---|---|
| **1** | Token → `@theme` einzige Quelle | `admin-token-consolidation` | T001787 | — (läuft zuerst: Snapshot-Risiko isolieren) |
| **1** | `AdminModal` + `AdminDrawer` | `admin-ui-modal-drawer` | T001788 | nach Token (Snapshot-Basis stabil) |
| **1** | `REDIRECT_MAP` in `middleware.ts` | `admin-redirect-map` | T001789 | nach Token (unabhängig von Modal) |
| **2** | `requireAdmin()`-Guard (62 Seiten) | tbd | tbd | teilt `middleware.ts` mit Welle-1-Redirect |
| **2** | `AdminTabs` in 4 Hubs durchsetzen | tbd | tbd | unabhängig |
| **3** | 71 `fetch()` → `apiCall` | tbd | tbd | nach Token/Modal (breite Fläche) |
| **4** | react-bits als React-Islands + Motion | tbd | tbd | nach Fundament komplett |

**Sequenzierung:** Innerhalb Welle 1 ist die einzige harte Ordnung: **Token zuerst** (verändert
Snapshots; danach stabile Baseline). Modal und Redirect sind untereinander unabhängig. Jeder Strang =
**eigener OpenSpec-Change + eigener PR** — reviewbar und einzeln rollback-bar.

## Kernentscheidungen (Brainstorming 2026-07-10, im Lavish-Board bestätigt)

- **T1 Token:** Tailwind `@theme` als einzige Quelle; `factory-tokens.css` auflösen.
- **T2 Redirect:** `REDIRECT_MAP` in `middleware.ts` (Query-Strings; teilt Datei mit Welle-2-Guard).
- **T3 Modal:** natives `<dialog>` + Svelte-Snippets (Browser liefert Focus-Trap/Escape/`inert`).

Details, Begründungen und Trade-offs: `docs/superpowers/specs/2026-07-10-admin-foundation-design.md`.

## Nicht-Ziele

- Kein Visual-Redesign in Welle 1 (kommt in Welle 4).
- Kein Dark/Light-Umschalter (nicht angefragt).
- **T001784** (CDN-React in `coaching/studio.astro`) wird **separat** als Bug gefixt, nicht hier.

## Ausführungs-Modell

Die drei Welle-1-Changes sind auf dem Umbrella-Branch `feature/admin-foundation` geplant und gestaged.
Bei der Umsetzung (`dev-flow-execute`) bekommt **jeder Strang seinen eigenen Branch + PR** (off `main`,
Design-Spec + PRD als Kontext). Token-Change zuerst mergen, dann Modal + Redirect.
