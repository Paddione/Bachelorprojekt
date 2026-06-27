---
title: "mentolder — Brand Foundations Design System"
date: 2026-06-27
status: draft
domains: [website, design-system]
ticket: TBD
---

# mentolder — Brand Foundations Design System

## Problem & Ziel

Es existieren bereits zwei `design-sync`-Setups, die jeweils **vorhandenen Code** in
ein claude.ai/design-Projekt spiegeln:

| Setup | Pfad | Projekt-ID | Inhalt |
|---|---|---|---|
| `mentolder-web` (React) | `.design-sync/` | `01e9f022-213c-4e8b-8f33-38222947565f` | 3 Komponenten-Previews |
| `mentolder-website` (Astro/Svelte) | `website/.design-sync/` | `5afb3eef-e9a4-43db-a111-03e308d5f0b8` | 21 Komponenten-Previews |

Beide enthalten **ausschließlich Komponenten-Karten** — es gibt keine Foundation-Seiten
(Farb-Paletten, Typo-Specimen, Spacing-/Radius-/Shadow-Skalen, Icon-Sheet, Motion). Genau
diese Grundlagen-Assets fehlen, um aus den Komponenten ein vollständig dokumentiertes
Design-System zu machen.

**Ziel:** Ein **neues, drittes** Design-System-Projekt auf claude.ai/design
(`mentolder — Brand Foundations`), das die mentolder-Token-Grundlagen als visuelle
Karten dokumentiert — lokal versioniert als self-contained HTML-Bundle und via
`DesignSync` gepusht.

## Scope

**In Scope:** 14 Foundation-Karten (Farbe / Typo / Spacing / Radius / Elevation / Motion /
Iconography / Brand), je als self-contained HTML-Datei; lokales `design-system/`-Bundle;
Anlage des claude.ai/design-Projekts + Push via `DesignSync`.

**Out of Scope:** Neue UI-Primitive (Buttons/Inputs/…), neue grafische Brand-Assets
(SVG-Illustrationen, Logo-Varianten), Änderungen an den zwei bestehenden Syncs, jede
Änderung an Produktions-Code unter `website/` oder `mentolder-web/`.

## Ansatz

**Self-contained statisches HTML pro Karte (Ansatz A).** Jede Foundation ist eine
eigenständige `.html`-Datei:

- **Zeile 1:** `<!-- @dsCard group="<Gruppe>" name="<Name>" -->` — das DesignSync-Tool baut
  den Karten-Index direkt aus diesem Marker (kein explizites `register_assets` nötig).
- **`<head>`:** der kanonische `:root`-Token-Block + Google-Fonts-`@import`, **zur Build-Zeit
  inline eingebettet** aus `website/public/brand/mentolder/colors_and_type.css` (Single Source of
  Truth) — keine handkopierten Hex-Werte, kein relativer `@import` (jede Karte wird auf
  claude.ai/design isoliert gerendert, daher müssen die Token im Dokument selbst liegen).
- **`<body>`:** handgebautes Markup, das Swatches / Specimen / Skalen rendert; gesetzt auf den
  Marken-Ink-Grund (`background: var(--ink-900); color: var(--fg)`), da der Marken-Text hell ist.
- **Eingebettete SVGs:** Icon-Sheet/Logo-Karten betten die SVG-Quellen **inline als `<svg>`-Markup**
  ein (nicht `<img src>`), damit die Karte ohne externe Datei eigenständig rendert.

Kein Build-Step, keine Komponenten-Compile-Pipeline. Begründung: Foundations sind statisch
(keine Props/State/Interaktivität); statisches HTML ist das native DesignSync-Karten-Format.
Die `.ds-sync/gen.mjs`-Pipeline der Website (Svelte→React, esbuild, Tailwind, headless Chromium)
wäre hier reiner Overhead ohne Mehrwert (Ansatz B, verworfen).

### DRY-Token-Quelle

Ein kleines Node-Skript `design-system/build-tokens.mjs` extrahiert den `@import`- und
`:root{…}`-Block aus `website/public/brand/mentolder/colors_and_type.css` und schreibt ihn nach
`design-system/_tokens.css`. Ein Assembly-Schritt (Teil von `build-tokens.mjs` oder ein zweites
`build-cards.mjs`) bettet diesen Block beim Build **inline in den `<head>` jeder Karte** ein
(zwischen Marker-Kommentaren, damit ein Re-Run ihn idempotent ersetzt). So ist die DRY-Garantie
an der **Quelle** (eine SSOT), während jede ausgelieferte Karte trotzdem self-contained bleibt;
ein Re-Run nach Token-Änderungen aktualisiert alle Karten in einem Rutsch. `_tokens.css` und
`assets/` sind reine **lokale Build-Eingaben** — sie werden nicht hochgeladen.

## Karten-Inventar

| # | Gruppe | Karte (`name`) | Inhalt |
|---|--------|------|--------|
| 1 | `Colors` | Surfaces | Ink-Ramp `ink-900/850/800/750` als Flächen + Token + Rolle |
| 2 | `Colors` | Text | `fg / fg-soft / mute / mute-2` auf Ink-Grund, Kontrast-Hinweise |
| 3 | `Colors` | Brass (Primär) | `brass / brass-2 / brass-d / brass-deep / brass-hex`, Usage CTA/Hover/Tint |
| 4 | `Colors` | Sage + Semantik | `sage`, `success`, `danger`, `info` |
| 5 | `Colors` | Paper / Print | Warme Papier-Palette (`paper*`) für PDF/E-Mail-Kontext |
| 6 | `Type` | Familien | Newsreader / Geist / Geist Mono Specimen + Gewichte |
| 7 | `Type` | Skala | `h1 → eyebrow/kicker/stat`, je in echter Größe + Specs |
| 8 | `Type` | Editorial-Details | Brass-`<em>`-Kursiv, Eyebrow-Tick-Regel, `.t-stat` |
| 9 | `Spacing` | Skala + Layout | `space-1…8` als Balken + `gutter/maxw`-Rhythmus |
| 10 | `Radius` | Skala | `radius-xs/sm/md/lg/(22)/pill` als Kacheln |
| 11 | `Elevation` | Shadows + Hairlines | `shadow-portrait/card` + „Hairline-statt-Schatten"-Philosophie |
| 12 | `Motion` | Easing + Dauer | `ease-soft/out`-Kurven + `dur-fast/base/slow/portrait` animiert |
| 13 | `Iconography` | Icon-Sheet | Grid der vorhandenen `props/*.svg` (compass, shield, target …) auf Ink |
| 14 | `Brand` | Logo + Mark | `lockup-dark`, `mark`, `app-icon`, `brass-pulse` gerendert |

**Icon-Sheet (Karte 13)** und **Logo (Karte 14)** beziehen vorhandene SVGs unter
`website/public/brand/mentolder/{props,logos}/`. Der Build kopiert sie nach
`design-system/assets/` (lokale Build-Eingabe) und bettet ihr Markup **inline** in die
jeweilige Karte ein, damit diese ohne externe Datei rendert.

## Verzeichnis-Layout

```
design-system/
├── config.json          # { projectId, name, localDir, cards[] } — projectId nach Anlage
├── NOTES.md             # Re-sync-Checkliste + Quirks (analog bestehender Setups)
├── build-tokens.mjs     # extrahiert :root-Block aus colors_and_type.css → _tokens.css
├── _tokens.css          # generiert (DRY-Token-Quelle)
├── assets/              # kopierte SVGs (props/*, logos/*) für Karten 13/14
└── cards/
    ├── colors-surfaces.html
    ├── colors-text.html
    ├── colors-brass.html
    ├── colors-sage-semantic.html
    ├── colors-paper-print.html
    ├── type-families.html
    ├── type-scale.html
    ├── type-editorial.html
    ├── spacing-scale.html
    ├── radius-scale.html
    ├── elevation-shadows.html
    ├── motion-easing.html
    ├── icons-sheet.html
    └── brand-logo.html
```

`design-system/` ist der `localDir` für `DesignSync.finalize_plan` (eigenes Top-Level-Verzeichnis,
da nicht an ein Code-Paket gebunden).

## Push-Flow (DesignSync)

1. `list_projects` → prüfen, dass `mentolder — Brand Foundations` noch nicht existiert.
2. `create_project` (name) → liefert `projectId`; in `config.json` persistieren.
3. `finalize_plan` mit `writes: ["cards/**"]`, `localDir: design-system/` → liefert `planId`
   (User sieht die Pfad-Liste im Permission-Prompt). `_tokens.css`/`assets/` sind nur lokale
   Build-Eingaben und werden **nicht** in den Plan aufgenommen.
4. `write_files` (planId, je Karte `localPath`) → Upload; Inhalte landen nie im Kontext.
5. Karten-Index entsteht automatisch aus den `@dsCard`-Markern (kein `register_assets` nötig).

## Verifikation

- **Lokaler Render-Check:** jede `cards/*.html` rendert eigenständig in einem Browser
  (dunkler Ink-Grund, Fonts laden, Swatches/Specimen sichtbar) — manuelle Sichtprüfung
  bzw. headless-Screenshot via vorhandenem chrome-devtools-Tooling.
- **Marker-Lint:** ein kleiner Check stellt sicher, dass jede Karte eine valide Zeile-1
  `@dsCard`-Annotation hat und `group`/`name` gesetzt sind.
- **Token-Drift-Check:** `build-tokens.mjs` neu ausführen → `_tokens.css` darf sich nicht ändern
  (Beweis, dass das committete `_tokens.css` mit der SSOT übereinstimmt).
- **Repo-Gate:** `task test:all` (Offline-Tests müssen grün bleiben; rein additive Dateien).

## Fehlerfälle

- **Projekt existiert schon** (`list_projects` findet den Namen): nicht erneut anlegen — mit
  dem User klären, ob in das vorhandene Projekt gepusht oder umbenannt wird.
- **`create_project` ist `type`-immutable:** ein versehentlich angelegtes Nicht-Design-System-Projekt
  lässt sich nicht nachträglich umwandeln — vor `write_files` via `get_project` den `type` prüfen.
- **Token-CSS-Format ändert sich:** falls `colors_and_type.css` umstrukturiert wird, bricht
  `build-tokens.mjs`; der Extractor matcht robust auf `@import …;` + den ersten `:root{…}`-Block
  und failt laut (kein stilles Teil-Ergebnis).

## Offene Punkte

- Ticket-Nummer (`TBD`) — wird in der Plan-/Execute-Phase vergeben.
- Ob `design-system/` zusätzlich in CI (z. B. ein Marker-Lint-Schritt) verankert wird, oder
  vorerst nur lokal verifiziert wird — Entscheidung im Plan.
