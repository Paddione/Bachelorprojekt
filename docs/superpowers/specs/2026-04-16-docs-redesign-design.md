---
name: Docs Redesign — Mentolder Dark Theme
description: Visuelles Redesign der Docsify-Docs mit Mentolder Dark-Navy/Gold-Farbschema, verlinktem In-Page-TOC und einheitlichen Page-Hero-Sektionen
type: project
---

# Design: Docs Redesign — Mentolder Dark Theme

**Datum:** 2026-04-16
**Status:** Approved

## Ziel

Die Docsify-Dokumentation erhält ein grafisch ansprechendes Redesign, das das Mentolder-Farbschema (Dark Navy + Gold) konsequent verwendet. Jede Seite bekommt ein verlinktes Inhaltsverzeichnis und visuell hervorgehobene Abschnitte.

## Farbschema (Mentolder)

| Variable           | Wert                        | Verwendung                          |
|--------------------|-----------------------------|-------------------------------------|
| `--dark`           | `#0f1623`                   | Sidebar-Hintergrund, Code-Bg        |
| `--dark-light`     | `#1a2235`                   | Hero-Bg, TOC-Box-Bg                 |
| `--dark-lighter`   | `#243049` / `#1e2d45`       | Borders, Trennlinien, Hover         |
| `--gold`           | `#e8c870`                   | Akzentfarbe, aktive Links, Badges   |
| `--gold-light`     | `#f0d88a`                   | Hover-Gold                          |
| `--gold-dim`       | `rgba(232,200,112,0.10–.15)`| Subtile Gold-Flächen                |
| `--light`          | `#e8e8f0`                   | Haupt-Textfarbe                     |
| `--muted`          | `#aabbcc`                   | Sekundärer Text, Tabellenzellen     |
| `--muted-dark`     | `#8899aa`                   | Metadata, Tags                      |
| Schriften          | Inter (sans), Merriweather (serif) | UI / Überschriften             |

## Komponenten

### 1. Globales CSS — `index.html`

Das komplette Docsify-Styling wird in `index.html` per `<style>` definiert und überschreibt das Vue-Theme vollständig. Betrifft:

- **`body`, `#main`** — dunkler Hintergrund `#111827`, helle Schrift
- **`.sidebar`** — `#0f1623`, Gold-Akzent für aktive Links, Kategorie-Labels in Caps
- **`h1`–`h3`** — Merriweather, `#e8e8f0`
- **`a`** — `#e8c870`, Hover `#f0d88a`
- **`table`** — dunkle Header (`#0f1623` + Gold-Text), Zeilen mit subtiler Gold-Hover-Fläche
- **`code`, `pre`** — `#0f1623` Hintergrund, Gold-Text
- **`blockquote`** — Gold-Linker-Rand, gedimmter Hintergrund

### 2. Docsify-Plugin: Auto-TOC

Ein Docsify-`hook.afterEach`-Plugin liest nach dem Rendern jeder Seite alle `h2`-Überschriften aus und injiziert automatisch eine `.toc-box` direkt nach dem `.page-hero`-Block (falls vorhanden) oder nach dem ersten `h1`. Die TOC-Box:

- Nummerierte Einträge (`1.`, `2.`, …)
- `<a href="#...">` mit korrekten Docsify-Anker-IDs
- Grid-Layout 2-spaltig (ab 4 Einträgen)
- Goldener Titel „Auf dieser Seite" mit Trennlinie

### 3. Page-Hero-Klassen

Jede Docs-Seite bekommt am Anfang einen HTML-Block:

```html
<div class="page-hero">
  <span class="page-hero-icon">⚙️</span>
  <div class="page-hero-body">
    <div class="page-hero-title">Seitenname</div>
    <p class="page-hero-desc">Kurzbeschreibung</p>
    <div class="page-hero-tags">
      <span class="page-hero-tag">Tag1</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>
```

CSS: `linear-gradient(135deg, #1a2235, #0f1a2e)`, `border-left: 4px solid #e8c870`, `border-radius: 10px`.

Seiten, die bereits einen `page-hero`-Block haben: `services.md` — nur CSS-Anpassung nötig.
Seiten ohne Hero: alle anderen `.md`-Dateien in `k3d/docs-content/` — HTML-Block wird hinzugefügt.

### 4. Sektions-Header-Stil

`h2`-Überschriften erhalten automatisch über CSS:
- `border-bottom: 1px solid #1e2d45`
- Vorangestellte nummerierte Badge-Boxen werden vom Auto-TOC-Plugin eingefügt (`.section-num`)
- Margin-Top `32px`, Padding-Bottom `10px`

### 5. Callout-Blöcke

`> **Tipp:**`-Blockquotes → Gold-Linker-Rand + `rgba(232,200,112,.07)` Hintergrund

## Dateien

| Datei | Änderung |
|-------|----------|
| `k3d/docs-content/index.html` | Komplett neues CSS-Theme, Auto-TOC-Plugin |
| `docs-site/index.html` | Identische Änderung (Mirror) |
| `k3d/docs-content/*.md` | Page-Hero-Blöcke hinzufügen (alle ohne Hero) |
| `k3d/docs-content/README.md` | Bestehende Cards ans neue CSS anpassen |
| `docs/*.md` | Mirror-Änderungen (sofern vorhanden) |

## Was NICHT geändert wird

- Sidebar-Struktur (`_sidebar.md`) — bleibt unverändert
- Mermaid-Plugin und Panzoom — bleiben unverändert
- Inhalt der `.md`-Dateien — nur Metadaten-Block am Anfang

## Erfolgskriterien

1. Alle Seiten haben Gold-Akzentfarbe, dunklen Hintergrund, sichtbaren Page-Hero
2. Jede Seite zeigt automatisch ein verlinktes TOC (außer Seiten mit < 2 Überschriften)
3. Tabellen, Code-Blöcke, Blockquotes folgen dem Farbschema
4. Sidebar zeigt Gold-Akzent für aktiven Link, Kategorie-Labels klar abgesetzt
5. `docs-site/index.html` und `k3d/docs-content/index.html` sind identisch
