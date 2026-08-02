# Proposal: sdlc-cockpit-k10-pipeline-slot

## Why

K7 (T002466) hat die Kit-Verdrahtung von `/admin/cockpit` geliefert, aber nicht den
Ticket-Kern: *das SDLC-Cockpit wird die Dachfläche im Admin-Menü, auf dem heutigen Platz
von Pipeline*. Auf `main` steht deshalb weiterhin nebeneinander, was E1/E2 zusammenführen
wollen:

| Beleg (Stand 2026-08-02, `main`) | Zustand |
|---|---|
| `website/src/components/admin/AdminSidebarNav.astro:39` / `:59` | zwei Menü-Einträge — *Cockpit* und *Pipeline* |
| `website/src/pages/admin.astro:140` | Dashboard-Widget verlinkt „Pipeline →" |
| `website/src/middleware/redirect-map.ts:17-20` | **vier** Alt-Pfade zeigen auf `/admin/pipeline?tab=…` |
| `website/src/pages/admin/pipeline.astro` | 32 Z. Hülle um `DevStatusTabs` |
| `website/src/components/admin/Cockpit.svelte` | 156 Z., **null** Nicht-Test-Nutzer seit PR #3563 |
| `website/src/styles/mobile-cockpit.css` | 85 Z., **kein** Lader im Repo (OF4 nie entschieden) |

Der zweite Ticket-Datenpfad ist damit nicht mehr eine konkurrierende Oberfläche, sondern
toter Code: `cockpit.astro` importiert `Cockpit.svelte` seit PR #3563 nicht mehr, am Leben
halten den Baum nur noch seine eigenen Testdateien.

## What

1. **Menü-Slot.** Es bleibt genau ein SDLC-Eintrag im Admin-Menü; der Pipeline-Eintrag und
   die Dashboard-Verlinkung gehen auf `/admin/cockpit` über (E1, E2).
2. **Pipeline-Inhalt als Panel.** `DevStatusTabs` wird unverändert in einen Panel-Rahmen
   aus der geteilten Kit-CSS-Schicht gesetzt (E22) und im Cockpit-Arbeitsbereich
   platziert. Server-Vorbefüllung (`getFloor`) und Tab-Vorwahl (`?tab=`) bleiben erhalten.
3. **Alt-Pfade.** Die vier Redirect-Ziele zeigen künftig direkt auf `/admin/cockpit?tab=…`;
   `pipeline.astro` schrumpft auf eine query-erhaltende 301-Weiterleitung.
4. **Toter Baum.** Der verwaiste `Cockpit.svelte`-Baum wird gelöscht — nach vorheriger,
   dateiweiser Verwaisungsprüfung, nicht pauschal.
5. **OF4.** `mobile-cockpit.css` entfällt ersatzlos (kein Lader vorhanden).

## Abgrenzung

- **Nicht hier:** der Ersatz des handgeschriebenen Flex-Layouts in `cockpit.astro` durch
  die Layout-Engine. Das war Punkt 6 des Tickets und ist per Scope-Kommentar vom
  2026-08-02 nach **K3 (T002462)** gewandert.
- **Nicht hier:** die Feinzerlegung der sieben `DevStatusTabs`-Tabs (factory, planung,
  analytics, kosten, control, abhaengigkeiten, parallel) in sieben frei platzierbare
  Panels. Der Baum umfasst gemessene 6.132 Zeilen über ~15 Komponenten; er wird eingehängt,
  nicht umgeschrieben. Die Zerlegung ist ein möglicher eigener Folgevorgang, sobald die
  Layout-Engine live ist.
- **Nicht hier:** die Rückkehr der reicheren Ticket-Funktionen (Filterleiste, Anlege-Modal,
  Presets, Mobile-Toggle) aus dem gelöschten Baum. Sie sind seit PR #3563 unerreichbar; wer
  sie zurückwill, baut sie als Kit-Panel in einem eigenen Vorgang.

_Ticket: T002531 · Epic T002458 · bindend: Design-Spec E1, E2, E22_
