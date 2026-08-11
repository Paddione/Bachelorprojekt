# Proposal: admin-nav-sdlc-cleanup

## Why

Die Admin-Sidebar führt sechs Einträge, deren Zielseiten im Produktions-Image nicht
existieren. Sie zeigen auf `/admin/*`-Pfade, die `website/src/middleware/redirect-map.ts`
nach `/sdlc/*` umleitet; `website/src/integrations/build-target.mjs` filtert im
`astro:build:ssr`-Hook jede Route mit `/sdlc/` im Komponentenpfad aus dem Manifest, und
`.github/workflows/build-website.yml:94` setzt `BUILD_TARGET=prod`. Der Redirect zeigt damit
auf eine Route, die im Image nicht mehr vorhanden ist.

Betroffen sind (Zeile in `AdminSidebarNav.astro` → Redirect-Ziel): `:39` Cockpit →
`/sdlc/cockpit`, `:28` App-Katalog → `/sdlc/app-catalog`, `:29` KI-Konfig. →
`/sdlc/ki-konfiguration`, `:30` Prompts → `/sdlc/prompts`, `:31` Systemtest →
`/sdlc/systemtest/board`, `:59` Repo Health → `/sdlc/repohealth`.

MESSUNG (2026-08-11, gegen Commit `3506f376e`):

```bash
cd website/src/pages
for p in app-catalog ki-konfiguration prompts systemtest repohealth cockpit; do
  [ -e "admin/$p" ] || [ -e "admin/$p.astro" ] || echo "FEHLT admin/$p"
done
# → alle sechs fehlen unter admin/; alle sechs existieren unter sdlc/
```

Der Zustand ist kein Versehen einer einzelnen Änderung, sondern ein **Widerspruch zwischen
drei SSOT-Specs**, den niemand gegeneinander gelesen hat:

| Spec | Aussage |
|---|---|
| `openspec/specs/website-core.md` § Admin-Sidebar-Navigation | schreibt Cockpit, App-Katalog, KI-Konfig., Prompts, Systemtest als Pflicht-Einträge fest |
| `openspec/specs/sdlc-cockpit.md` § Genau eine SDLC-Fläche im Admin-Menü | schreibt den Cockpit-Eintrag auf `/admin/cockpit` fest |
| `openspec/specs/admin-cockpit.md` § Admin-Sidebar enthält genau einen Pipeline-Eintrag | verlangt einen Sidebar-Link auf `/admin/pipeline` |
| `openspec/specs/sdlc-isolation.md` + Build-Target-Split | macht ebendiese Routen im prod-Build unerreichbar |

Der Pipeline-Punkt ist dabei der aufschlussreichste: der geforderte Link existiert in
`AdminSidebarNav.astro` **schon heute nicht** (nur noch als `matches`-Eintrag des
Cockpit-Eintrags). Das Szenario ist `*(E2E)*` markiert, lief also nur im nächtlichen
Playwright-Lauf und nie im PR-Gate — deshalb konnte die Abweichung unbemerkt bestehen.

**Entscheidung (Nutzer, 2026-08-11): `sdlc-isolation` gewinnt.** Die SDLC-Fläche ist
Development-only und ausschließlich über die lokale Console (`sdlc.localhost`) erreichbar,
nie über die Kunden-Domain. Die beiden veralteten Requirements werden per `MODIFIED`-Delta
korrigiert statt still umgangen.

## What

### 1. Tote Einträge entfernen

Die sechs oben genannten Einträge entfallen aus `AdminSidebarNav.astro`. Es verbleiben zwölf
Einträge, deren Zielseiten unter `website/src/pages/admin/` verifiziert vorhanden sind:
Dashboard, Postfach, Klienten, Sessions, Fakturierung, Content Hub, Wissensbasis, Assets,
3D Generator, Content-DB, Einstellungen, Systembrett (extern).

### 2. Navigation semantisch neu gruppieren

Die Sammelsektion „Werkstatt" wird aufgelöst und fachlich geteilt; das Akkordeon entfällt,
weil fünf Einträge kein Aufklappen mehr rechtfertigen. Systembrett wandert zu den Werkzeugen
— es *ist* ein Werkzeug, keine Infrastruktur. Content-DB wandert zu den Inhalten.

```
Dashboard · Postfach
GESCHÄFT      Klienten · Sessions · Fakturierung
INHALTE       Content Hub · Wissensbasis · Content-DB
WERKZEUGE     Assets · 3D Generator · Systembrett (extern)
SYSTEM        Einstellungen
```

Kein visuelles Redesign: Icons, Abstände, aktiver Zustand und die Stylesheets
(`admin-premium.css`, `admin-foundation.css`) bleiben unberührt.

### 3. Guard gegen die Regression

Ein Test prüft jeden Nav-`href` gegen die Redirect-Tabelle in `redirect-map.ts` und wird rot,
sobald ein Menü-Eintrag auf einen nach `/sdlc/` umgeleiteten Pfad zeigt. Der Guard misst das
**Ergebnis** der Auflösung (führt ein Eintrag in eine im prod-Build entfernte Route?), nicht
die Schreibweise eines Labels.

### 4. Drei SSOT-Deltas

- `website-core.md` — Requirement „Admin-Sidebar-Navigation" auf die zwölf realen Einträge
  und die neue Gruppierung umschreiben.
- `sdlc-cockpit.md` — Requirement „Genau eine SDLC-Fläche im Admin-Menü" entfällt: es gibt im
  Produktions-Admin-Menü **keine** SDLC-Fläche mehr.
- `admin-cockpit.md` — Requirement „AdminLayout-Navigation enthält nur freigegebene Routen"
  wird auf das Auflösungskriterium umgestellt; das Akkordeon-Requirement der Sidebar entfällt;
  das E2E-Szenario „genau ein Pipeline-Eintrag" wird entfernt. Das Akkordeon der
  **Cockpit-Ticketliste** (§ Cockpit Ticket-Expand-Row) bleibt ausdrücklich bestehen — es ist
  eine andere Oberfläche und wird hier nur explizit abgegrenzt, damit die Entfernung des
  Sidebar-Akkordeons nicht versehentlich auf sie bezogen wird.

## Auswirkung auf bestehende Tests

`tests/spec/admin-cockpit.bats:45–85` enthält sechs Tests, die nach dieser Änderung rot
werden — sie greppen die Quelldatei nach `sidebar-group-btn`, `accordion-arrow`,
`is-collapsed`, `Werkstatt` und `Infrastruktur`. Sie werden durch den Redirect-Guard
**ersetzt**, nicht ergänzt: es sind Source-Grep-Assertions der Art, die `CLAUDE.md`
§ Test-Resultats-Konvention (T002448-M4) als Antimuster führt — sie bestätigen die
Schreibweise eines Labels, nicht dass Navigation funktioniert. Sie im selben Zug zu
erhalten, in dem die Navigation umgebaut wird, würde das Antimuster zementieren.

## Wechselwirkung mit dem offenen Change `spec-bats-admin-ui`

Der offene Change `openspec/changes/spec-bats-admin-ui/` fordert in seinem Delta genau die
Assertions, die hier entfallen (Akkordeon-Steuerelemente, Sektionen „Werkstatt" und
„Infrastruktur"). Wird er nach diesem Change archiviert, schreibt er den alten Zustand als
SSOT zurück und macht die entfernten Tests wieder zur Pflicht.

Sein Delta ist deshalb vor seiner Archivierung um diese Assertions zu bereinigen. Der
vorliegende Change fasst ihn nicht an — er ist fremde, noch nicht abgeschlossene Arbeit —,
benennt die Abhängigkeit aber, damit sie beim Archivieren nicht übersehen wird.

## Nicht in diesem Scope

Die Gegenrichtung — Admin-Seiten **ohne** Menü-Eintrag (`buchhaltung`, `kalender`,
`meetings`, `projekte`, `steuer`, `termine`, `zeiterfassung`, `members`,
`einstellungen/*`) — bleibt unangetastet. Sie ist teilweise Absicht: `website-core.md`
verlangt ausdrücklich, „Mitglieder, Mandate, Kontierung" aus der Sidebar zu entfernen. Ob
der Rest verwaist oder gewollt versteckt ist, ist eine eigene Frage mit eigener Prüfung.

_Ticket: T003826_
