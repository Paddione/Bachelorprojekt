# admin-redesign — Design

> Ausführliche Design-Spec (Brainstorming-Ergebnis, Screenshots, Entscheidungs-Log):
> `docs/superpowers/specs/2026-07-02-admin-redesign-design.md` — dieses Dokument fasst die
> technischen Entscheidungen zusammen.

## Context

Vier unkoordinierte Stil-Systeme im Admin (Indigo-`--admin-*`, Brass-`factory-tokens`,
Hex-Hardcodes, DORA-Eigenschema); drei redundante Analytics-Flächen; scrollende Sidebar;
funktional dünnes Dashboard; Cockpit ohne Ticket-Inhalts-Sicht. `factory-tokens.css` ist bereits
die dokumentierte „Mentolder Design System bridge" (Ink/Brass/Sage, Newsreader/Geist) — das
Zielsystem existiert, ist aber nicht durchgesetzt. Ist-Aufnahme per Live-Screenshots (2026-07-02).

## Goals / Non-Goals

**Goals:**

- Ein Token-Set (Brass/Ink) für den gesamten Admin; Front-Page-Ästhetik auf den Kernflächen.
- Sidebar ohne Scroll (900px, Akkordeon offen); funktional dichteres Dashboard.
- Eine Pipeline-Fläche (`/admin/pipeline`) statt drei; Floor Conveyor-only.
- Cockpit-Zeilen zeigen Ticket-Inhalt (Expand-Row).
- `/admin/dora` entfernt.

**Non-Goals:**

- Kein Redesign der ~55 übrigen Admin-Seiten (erben nur Tokens).
- Keine Datenmodell-/API-Vertragsänderungen; keine Factory-Logik-Änderungen.
- Kein Umbau Portal/öffentliche Website; `/admin/architektur` bleibt außen vor.

## Decisions

1. **Alias-Schicht statt Migration der Konsumenten.** `admin-foundation.css` behält die
   `--admin-*`-Namen und remappt sie auf factory-tokens-Werte. Alternative (alle ~65 Seiten auf
   `--brass`/`--ink-*` umschreiben) verworfen: zu großer Diff, kein Mehrwert. Ladereihenfolge:
   factory-tokens → admin-foundation (Alias) → admin-premium.
2. **Conveyor-only Floor.** Kanban-Zweig (Toggle, `localStorage['ff-view']`, Kanban-Grid mit
   defektem „Halle"-Layout) wird entfernt statt repariert — das Kanban-Bedürfnis deckt das
   Cockpit; senkt `FactoryFloor.svelte` unter das S1-Risiko (heute 386/500). Fallback: gespeicherte
   `ff-view=kanban`-Präferenz wird ignoriert (kein Fehler).
3. **Umzug statt Neubau der Pipeline-Seite.** `dev-status.astro` → `admin/pipeline.astro`;
   `DevStatusTabs` behält Planung/Steuerung/Abhängigkeiten 1:1, Tab-Bar wechselt auf
   `AdminTabs.svelte`, neuer Kosten-Tab = Merge aus `FactoryObservability` + `FactoryBudgetPage`
   (eine Fläche, eine Farbquelle). Alternative (dritte Analytics-Seite zusätzlich) verworfen —
   genau die heutige Redundanz.
4. **`PipelineSidekickView` verdrahten statt neu bauen.** Fertig + getestet; wird Dashboard-Widget
   (SSE-live). Alternative (neues Widget) wäre Doppelarbeit.
5. **Expand-Row statt Side-Panel im Cockpit.** Bleibt im Tabellenkontext, lazy Detail-Fetch beim
   Aufklappen, ein Accordion-Item gleichzeitig. Side-Panel (Floor-Muster) verworfen: braucht
   Breite, dupliziert DetailPanel-Logik außerhalb des Floor-Kontexts.
6. **`AdminBadge` wird eingesetzt, nicht gelöscht.** Als Standard-Chip (Brass/Sage/Danger) in
   Expand-Row und Pipeline-Tabs — behebt „0 Verwendungen" durch Nutzung statt Entfernung.
7. **DORA-UI ersatzlos entfernt** (User-Entscheidung). Redirect auf
   `/admin/pipeline?tab=analytics`; Messung bleibt `scripts/vda.sh cfr`.

## Risks / Trade-offs

- [Alias-Schicht färbt viele Seiten auf einmal] → eigener Task mit visueller Stichprobe
  (Dashboard + Formular- + Tabellen-Seite) vor den Flächen-Tasks.
- [E2E-Specs hängen an Floor-testids und Kanban-Toggle] → `data-testid`s unverändert;
  `fa-factory-floor.spec.ts` in demselben Task wie die Kanban-Entfernung anpassen;
  `task test:inventory` regenerieren.
- [Verstreute `/dev-status`-Links] → Grep-Sweep + 301-Redirect als Sicherheitsnetz.
- [Kore-Brand driftet] → `kore-app.css`-Overrides für die neuen Aliase im Token-Task;
  Sichtprüfung auf korczewski-Dev.
- [Kein Unit-Test-Netz für Chart-/Nav-Komponenten] → neue Vitest-Tests für Helper +
  Token-Alias-Integrität; Verhalten der Charts bleibt unverändert (nur Farben aus einer Quelle).

## Migration Plan

Reihenfolge im Plan: (1) Token-Alias-Schicht + Kore-Overrides, (2) Sidebar + Dashboard,
(3) Pipeline-Umzug + Kosten-Tab + Conveyor-only, (4) Cockpit Expand-Row, (5) DORA-Removal +
Redirect-Stubs, (6) Test-Sweep (E2E-Anpassung, Inventory). Rollback: ein Revert des Squash-Commits
stellt den Vorzustand her (reines UI-Redesign, keine Daten-Migrationen).
