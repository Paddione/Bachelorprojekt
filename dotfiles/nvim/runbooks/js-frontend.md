---
page: js-frontend
ticket: T900658
status: complete
actions:
  - goto-page
  - goto-component
  - goto-layout
  - goto-route
  - goto-design
  - dev
  - preview
  - lint
  - type-check
  - build
  - test
  - lsp-status
---

## Voraussetzungen

- Neovim v0.12.5 mit der Dashboard-Foundation (T900655), den Editor-Faehigkeiten (T900656) und der JavaScript / Frontend Seite (T900658 p1).
- **Telescope** und **ToggleTerm** sind in `plugins/core.lua` enthalten (T900655) — kein neues Plugin noetig. Pruefen: `:Telescope` oeffnet den Picker, `:ToggleTerm` oeffnet/schliesst ein Terminal.
- Der aktuelle Buffer muss innerhalb eines Git-Repository liegen: Alle Aktionen loesen ihr Arbeitsverzeichnis zur Ausfuehrungszeit ueber `config.gitroot.root()` auf (nil-Guard: ohne Repository erscheint eine Warnung, keine Aktion startet).
- `node` plus `pnpm` im `PATH` fuer Website-Aktionen, `npm` fuer Brett- und Root-Aktionen (`node --version`, `pnpm --version`, `npm --version` liefern Versionen).
- Abhaengigkeiten sind je Paketgrenze einmal installiert: `pnpm install` innerhalb von `components/website`, `npm install` innerhalb von `components/brett` — niemals `npm install` innerhalb von `components/website` (dort liegt `pnpm-lock.yaml`).
- Die T900656 Editor-Faehigkeiten sind installiert, damit `lsp-status` Server und Parser zum Melden hat (Treesitter-Parser `astro`, `svelte`, `javascript`, `typescript`, `html`, `css`; LSP-Server `ts_ls`, `astro`, `svelte`, `html`, `cssls`).

## Geordnete Schritte

Die Seite erreichen Sie ueber das Dashboard (`<leader>h`, Kapitel `2` "JavaScript / Frontend") oder ueber die Dashboard-Suche (`<leader>hf`). Fokus-versus-Ausfuehrung: Den Cursor auf eine Zeile zu bewegen fokussiert nur und fuehrt **nichts** aus; erst Enter bzw. die angezeigte Taste startet die Aktion. Die Paketgrenze folgt dem aktuellen Buffer: Buffer unter `components/website/` laufen mit pnpm, Buffer unter `components/brett/` mit npm, alle anderen Repo-Buffer gelten als Root (nur Type-Check).

1. **goto-page**: Druecken Sie `p`. Der Telescope-Picker `find_files` oeffnet mit Wurzel `components/website/src/pages/` (Route-Pages wie `index.astro` und `[service].astro`). Mit Enter oeffnet sich die gewaehlte Page. Datei-zu-URL-Abbildung: `index.astro` entspricht `/`, `[service].astro` einem dynamischen Segment, `api/*.ts` entspricht `/api/*`.

2. **goto-component**: Druecken Sie `c`. Der Picker oeffnet mit Wurzel `components/website/src/components/` (Astro- plus Svelte-Komponenten). Mit Enter oeffnen Sie die Komponente.

3. **goto-layout**: Druecken Sie `l`. Der Picker oeffnet mit Wurzel `components/website/src/layouts/` (`Layout.astro`, `AdminLayout.astro`, `PortalLayout.astro`). Mit Enter oeffnen Sie das Layout.

4. **goto-route**: Druecken Sie `r`. Der Picker oeffnet mit Wurzel `components/website/src/pages/api/` (API-Routen, Abbildung auf `/api/*`). Mit Enter oeffnen Sie die Route.

5. **goto-design**: Druecken Sie `d`. Der Picker oeffnet ueber zwei Wurzeln: `design/leitstand-ds/` (Token-Quelle) plus `components/website/src/styles/` (Website-Kopie). Mit Enter oeffnen Sie die Ressource.

6. **dev**: Druecken Sie `v`. Startet den Dev-Server des Buffer-Ziels in einem horizontalen ToggleTerm: Website `pnpm --dir <root>/components/website dev` (`astro dev`), Brett `npm --prefix <root>/components/brett run dev` (Server plus Client). Auf einem Root-Buffer erscheint eine Warnung und nichts startet (dort existiert kein dev-Skript).

7. **preview**: Druecken Sie `w`. Vorschau der gebauten Seite — nur fuer Website-Buffer: `pnpm --dir <root>/components/website preview` (`astro preview`). Auf Brett- und Root-Buffern erscheint eine Warnung und nichts startet (kein preview-Skript dort).

8. **lint**: Druecken Sie `n`. Laeuft den Linter des Buffer-Ziels in einem horizontalen ToggleTerm: Website `pnpm --dir <root>/components/website lint` (`eslint . --max-warnings 0`), Brett `npm --prefix <root>/components/brett run lint` (`eslint .`). Auf einem Root-Buffer erscheint eine Warnung und nichts startet.

9. **type-check**: Druecken Sie `t`. Laeuft den Type-Checker des Buffer-Ziels in einem horizontalen ToggleTerm: Website `pnpm --dir <root>/components/website astro:check` (`astro check`), Brett `npm --prefix <root>/components/brett run typecheck` (Client- plus Server-Konfigurationen), Root `npm --prefix <root> run typecheck` (`tsc --build`). Dies ist die einzige Lifecycle-Aktion, die auf Root-Buffern laeuft.

10. **build**: Druecken Sie `b`. Baut das Buffer-Ziel in einem horizontalen ToggleTerm: Website `pnpm --dir <root>/components/website build` (`astro build`), Brett `npm --prefix <root>/components/brett run build` (`vite build` plus Server-tsc). Auf einem Root-Buffer erscheint eine Warnung und nichts startet.

11. **test**: Druecken Sie `e`. Laeuft die Test-Suite des Buffer-Ziels in einem horizontalen ToggleTerm: Website `pnpm --dir <root>/components/website test` (`node tests/api.test.mjs`), Brett `npm --prefix <root>/components/brett run test` (tsx-Suite). Auf einem Root-Buffer erscheint eine Warnung und nichts startet.

12. **lsp-status**: Druecken Sie `s`. Meldet je Sprache eine Statuszeile per `vim.notify`: `js-frontend: <sprache> — lsp <server> (<attached|absent>), treesitter <present|absent>` fuer `astro`, `svelte`, `javascript`, `typescript`, `html` und `css` (Server `astro`, `svelte`, `ts_ls`, `ts_ls`, `html`, `cssls`). Ohne installierte Clients melden alle Zeilen `absent`; die Aktion bleibt headless-sicher.

## Erwartetes Ergebnis

- Die Seite "JavaScript / Frontend" zeigt genau zwoelf Aktionen in dieser Reihenfolge: `goto-page`, `goto-component`, `goto-layout`, `goto-route`, `goto-design`, `dev`, `preview`, `lint`, `type-check`, `build`, `test`, `lsp-status` (Tasten `p/c/l/r/d/v/w/n/t/b/e/s`).
- Die fuenf Navigationsaktionen oeffnen den Telescope-Picker an den dokumentierten Wurzeln unter dem Git-Root des aktuellen Buffers.
- Die sechs Lifecycle-Aktionen oeffnen ein horizontales ToggleTerm im Projekt-Root und fuehren dort das exakte Paket-Skript der erkannten Grenze aus (Website per pnpm, Brett und Root per npm).
- `lsp-status` meldet sechs Zeilen (fuenf Server plus sechs Parser des T900656-Satzes).
- Es werden keine `BufWritePre`-Autocommands angelegt — keine Formatierung beim Speichern.

## Troubleshooting

- **Aktion startet nicht / Warnung "no project root"**: Der Buffer liegt ausserhalb eines Git-Repositories. `git rev-parse --show-toplevel` im Buffer-Verzeichnis pruefen; in ein Repository wechseln.
- **Warnung "telescope not loaded" bzw. "toggleterm not loaded"**: Die Plugins sind lazy (`cmd`). Einmal `:Telescope` bzw. `:ToggleTerm` ausfuehren, dann die Aktion wiederholen; per `:Lazy` sicherstellen, dass beide installiert sind (Teil von `plugins/core.lua`).
- **preview auf einem Brett-Buffer warnt**: Erwartet — Brett hat kein preview-Skript. Stattdessen `dev` nutzen oder auf einen Website-Buffer wechseln.
- **pnpm/npm-Verwechslung**: Website-Aktionen laufen immer mit pnpm (`pnpm-lock.yaml`), Brett/Root immer mit npm. Erscheint ein npm-Befehl fuer `components/website`, liegt der Buffer-Pfad ausserhalb der erkannten Grenze — `:echo expand('%:p')` pruefen.
- **`astro check` meldet Fehler**: Type- oder Inhaltsfehler in Astro-/Svelte-Dateien. Die Ausgabe im ToggleTerm nennt Datei und Zeile; nach dem Fix `type-check` erneut laufen lassen.
- **Design-Picker ist leer**: Der Styles-Checkout ist sparse oder unvollstaendig. Pruefen, ob `design/leitstand-ds/` und `components/website/src/styles/` im aktuellen Checkout existieren.

## Recovery

- Das Lifecycle-Terminal schliessen: `:ToggleTerm` toggelt das Terminal (erneuter Aufruf schliesst es); alternativ den Terminal-Buffer wie jeden Buffer schliessen (`:bd!` im Terminal).
- Die Aktionen schreiben keine Projektdateien (nur Terminal-Ausgabe): Ausser dem fluechtigen Terminal gibt es nichts zurueckzurollen.
- Seite entfernen = p1-Modul plus p3-Registrierung entfernen: `dotfiles/nvim/lua/config/js-frontend.lua` loeschen und den `js-frontend`-Block in `dotfiles/nvim/lua/config/dashboard.lua` entfernen (der Auto-Stub uebernimmt wieder).
