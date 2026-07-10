# Proposal: admin-fundament-konsolidierung

## Why

Die Admin-GUI ist über Monate gewachsen (~47k LOC, 91 Svelte-Komponenten, 608 admin-bezogene Dateien). Es gibt keine toten Komponenten — die Schuld liegt in Muster-Duplikation: gute Abstraktionen wurden gebaut und nie flächendeckend durchgesetzt. Beispiel: `AdminTabs` hat nur 4 Consumer, `admin-api.ts` hat nur 5 Consumer, `--admin-*` Aliase werden nur von 24 von 52 Admin-Nutzern verwendet.

Dieser Epic konsolidiert das Fundament, bevor visuelle Layer (react-bits als React-Islands) darauf aufbauen können.

**Design-Spec:** `docs/superpowers/specs/2026-07-10-admin-foundation-design.md`

## What — Epic Scope

Vier Wellen, jede als eigener OpenSpec-Change mit eigenem PR:

### Welle 1 (parallel, jetzt)
Drei unabhängige Stränge, die jeweils sofort loslaufen können:

1. **T001787 — Admin-Token-Konsolidierung:** Tailwind `@theme` als einzige Token-Quelle; `factory-tokens.css` auflösen. Alle Admin-Komponenten nutzen einheitliche Design-Tokens.
2. **T001789 — REDIRECT_MAP:** 23 Admin-Stub-Seiten in `middleware.ts` auflösen. Reduziert Routing-Overhead und eliminated tote Routes.
3. **T001788 — AdminModal + AdminDrawer:** Natives `<dialog>` + Svelte-Snippets für Modal/Drawer. Browser liefert Focus-Trap, Escape, `inert` — kein eigenes Implementieren nötig. 8 Modal- und 4 Drawer-Migrationen.

### Welle 2 (nach Welle 1)
- **requireAdmin()-Guard:** Einheitlicher Auth-Guard auf 62 Admin-Seiten (statt verteilter Prüfungen).
- **AdminTabs in 4 Hubs durchsetzen:** Das beste Tab-Muster wird zum Standard erklärt und in allen Admin-Hubs eingeführt.

### Welle 3 (nach Welle 2)
- **71 `fetch()` → `apiCall`:** Einheitlicher API-Client mit Fehlerbehandlung.
- **Einheitliche Fehleranzeige:** `admin-toast` als zentrale Fehler-/Erfolgsmeldung.

### Welle 4 (nach Welle 3)
- **react-bits als React-Islands:** Motion-Layer, Animationen, visuelle Aufwertung.
- Dependent on Wave 3 (einheitlicher API-Client) für saubere Datenbindung.

## Non-Goals

- Keine Feature-Neuentwicklung — nur Konsolidierung bestehender Patterns.
- Keine Breaking Changes für Endnutzer-Interfaces.
- T001784 (CDN-React in coaching/studio.astro) ist explizit ausgegliedert (eigenes Bug-Ticket).

## Sub-Ticket-Abhängigkeiten

```
T001786 (Epic) ──┐
                  ├── T001787 (Token-Konsolidierung)  in_progress
                  ├── T001789 (REDIRECT_MAP)          plan_staged
                  └── T001788 (Modal + Drawer)         in_progress
```

Alle drei Welle-1-Tickets laufen parallel. Welle 2–4 sind abhängig vom Abschluss der jeweils vorherigen Welle.
