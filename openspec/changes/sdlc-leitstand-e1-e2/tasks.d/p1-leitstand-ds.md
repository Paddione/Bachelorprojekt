# p1 — Leitstand Design System (Token-Set, Showcase, DesignSync-Bundle)

**Rolle:** bachelorprojekt-website
**target_files:**
- `components/website/src/styles/sdlc-leitstand.css` (neu)
- `components/website/src/pages/sdlc/design-system.astro` (Umbau)
- `design/leitstand-ds/**` (neu)

_Ticket: T007559 · Partial p1 (parallel zu p2, keine Datei-Überlappung) · deckt das
ADDED-Requirement "Leitstand Design Token Set" aus
`openspec/changes/sdlc-leitstand-e1-e2/specs/sdlc-cockpit.md` ab · Design: S4 in
`openspec/changes/sdlc-leitstand-e1-e2/design.md`._

BUILD_TARGET-Isolation ist bereits strukturell gegeben und wird hier NICHT neu gebaut:
`design-system.astro` liegt unter `components/website/src/pages/sdlc/`, und
`components/website/src/integrations/build-target.mjs` (`keepRoute()`) filtert jede `/sdlc/`-Route aus
dem `BUILD_TARGET=prod`-Manifest; abgesichert durch das bestehende
`components/website/src/integrations/build-target.test.ts`. Dieser Partial fügt keine neue
Isolationslogik hinzu — die Stylesheet-Isolation folgt allein daraus, dass der einzige
Importer unter `pages/sdlc/` liegt.

## Test-Kontrakt (bindend — aus `tasks.d/p3-tests.md`, T1–T7 in
`tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats`)

p3 committet die Guards VOR diesem Partial (RED-Beleg) und legt damit folgende Namen/Formen
verbindlich fest — nicht stillschweigend abweichen:

- Signal-Tokens exakt `--ls-signal-green`, `--ls-signal-amber`, `--ls-signal-red`,
  `--ls-signal-info` (T1).
- Mind. 2 `--ls-surface-<suffix>` Tokens **mit Suffix** (T2 regex `--ls-surface-[a-z0-9]+:` —
  ein bloßes `--ls-surface:` ohne Suffix zählt NICHT) → dieser Plan nutzt
  `--ls-surface-base` / `--ls-surface-raised`.
- Mind. 1 `--ls-line*`-Token, mind. 2 `--ls-text-<suffix>`-Token (Suffix ohne Bindestrich),
  mind. 1 Token mit `mono` im Namen, mind. 3 `--ls-space-<n>`-Token, jeder `--ls-radius-*`-Wert
  in `[2px, 4px]` (T2).
- **Jede** Zeile, die das Wortfragment `glow` oder `pulse` (Kleinschreibung) enthält, muss im
  selben bzw. im zuletzt öffnenden `{`-Selektor auch `running` enthalten (T3) — daher
  `@keyframes ls-running-pulse` (nicht `ls-pulse-glow`!) und `.ls-running { animation:
  ls-running-pulse …; }`.
- Print-Light lebt ausschließlich innerhalb eines `@media print { … }`-Blocks, der mindestens
  ein `--ls-*`-Token redefiniert; außerhalb von `@media print` darf `data-theme` oder
  `theme-light` nirgends vorkommen (T4).
- `design-system.astro` referenziert `sdlc-leitstand.css` per `grep -qF` (T5).
- Der `<style>`-Block von `design-system.astro` enthält **null** Hex-Farbwerte
  (`#rgb`/`#rrggbb`), auch nicht in Kommentaren — ausschließlich `var(--ls-*)` (T6).
- Kein Importer von `sdlc-leitstand.css` liegt außerhalb `pages/sdlc/` (T7).

- [x] **Task 1 — `components/website/src/styles/sdlc-leitstand.css` anlegen (Token-Set + Glow-Disziplin
      + Print-Light).**

```css
/*
 * Leitstand Design System -- Control-Room token set (E1, T007559).
 * SSOT fuer alle `--ls-*` Custom Properties. Wird AUSSCHLIESSLICH von SDLC-Seiten
 * geladen (Importer liegen unter components/website/src/pages/sdlc/**) -- BUILD_TARGET=prod
 * buendelt nie eine Route, die diese Datei importiert, weil jeder Importer unter
 * /sdlc/ liegt (components/website/src/integrations/build-target.mjs keepRoute()).
 *
 * Bewusster Stilbruch zur Kore-Marke (kein Brass) -- eigenstaendiges Set,
 * siehe openspec/changes/sdlc-leitstand-e1-e2/design.md S4.
 */

:root {
  /* Surfaces (dunkel, kuehl; Bereich #0a0c10-#12161d) */
  --ls-bg:             #0a0c10;
  --ls-surface-base:   #0e1117;
  --ls-surface-raised: #12161d;

  /* Linien */
  --ls-line:        #1d232c;
  --ls-line-strong: #232a35;

  /* Text-Stufen */
  --ls-text-primary:   #e7ecf3;
  --ls-text-secondary: #a9b2c0;
  --ls-text-muted:     #707b8a;
  --ls-text-disabled:  #4a5361;

  /* Signal-Set (semantischer Kern) */
  --ls-signal-green: #22e06c;
  --ls-signal-amber: #ffb020;
  --ls-signal-red:   #ff4d4f;
  --ls-signal-info:  #4da3ff;

  --ls-signal-green-dim: color-mix(in oklab, var(--ls-signal-green) 16%, var(--ls-surface-base));
  --ls-signal-amber-dim: color-mix(in oklab, var(--ls-signal-amber) 16%, var(--ls-surface-base));
  --ls-signal-red-dim:   color-mix(in oklab, var(--ls-signal-red) 16%, var(--ls-surface-base));
  --ls-signal-info-dim:  color-mix(in oklab, var(--ls-signal-info) 16%, var(--ls-surface-base));

  /* Typografie */
  --ls-font-sans: ui-sans-serif, "Inter", "Segoe UI", system-ui, sans-serif;
  --ls-font-mono: ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Consolas, monospace;

  /* Radien (kantig, 2-4px) */
  --ls-radius-sm: 2px;
  --ls-radius-md: 3px;
  --ls-radius-lg: 4px;

  /* Abstands-Schritte (kompakt) */
  --ls-space-1: 2px;
  --ls-space-2: 4px;
  --ls-space-3: 6px;
  --ls-space-4: 8px;
  --ls-space-5: 12px;
  --ls-space-6: 16px;
  --ls-space-7: 24px;

  /* Bewegung */
  --ls-dur-fast: 120ms;
  --ls-dur-base: 200ms;
  --ls-ease: cubic-bezier(.2, .7, .2, 1);
}

/* Glow/Puls -- AUSSCHLIESSLICH fuer "laeuft gerade"-Zustaende (Disziplin-Regel gegen
   Christbaum-Effekt, design.md S4). Keine Komponente ausserhalb von .ls-running darf
   diese Animation binden -- Keyframe- und Klassenname tragen deshalb beide "running". */
@keyframes ls-running-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, currentColor 55%, transparent); }
  50%      { box-shadow: 0 0 0 6px transparent; }
}

.ls-running {
  animation: ls-running-pulse 1.6s var(--ls-ease) infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ls-running { animation: none; }
}

/* Print-Light -- NUR Report-Stylesheet (@media print), kein zweites interaktives
   Theme. Gilt ausschliesslich innerhalb von @media print + der expliziten
   .ls-report-Ansicht -- kein Toggle, kein [data-theme]. */
@media print {
  .ls-report {
    --ls-bg:             #ffffff;
    --ls-surface-base:   #f4f5f7;
    --ls-surface-raised: #ffffff;
    --ls-line:            #d8dce2;
    --ls-line-strong:     #b9c0ca;
    --ls-text-primary:   #12161d;
    --ls-text-secondary: #3a4250;
    --ls-text-muted:     #6b7480;
    --ls-text-disabled:  #9aa2ad;
    background: var(--ls-bg);
    color: var(--ls-text-primary);
  }
  .ls-running { animation: none !important; box-shadow: none !important; }
}
```

  `.css` trägt kein S1-Limit (kein Eintrag in `docs/code-quality/gates.yaml` → `s1.limits`) —
  keine Budget-Zahl zu diesem Task.

- [x] **Task 2 — `components/website/src/pages/sdlc/design-system.astro` zum Leitstand-DS-Showcase
      umbauen (vollständiger Ersatz des Inhalts).**

  Entferne die bisherigen Imports (`PilotLight`, `WorkpieceCard`, `PhaseBadge`,
  `FactoryTicket`-Typ) und beide `sampleTickets*`-Arrays — die alte "Factory Design
  System"-Demo zeigte `--factory-*`-Tokens des abgelösten Cockpit-Designs
  (Prior-Art-Bindung in `design.md`: Kanban-Floor-View/TicketDrawer sind "weiterhin
  verworfen"). Die drei Svelte-Komponenten selbst bleiben unangetastet (nicht Teil dieses
  Partials) — nur diese eine Seite hört auf, sie zu importieren.

  Neuer Frontmatter:

  ```astro
  ---
  import Layout from '../../layouts/Layout.astro';
  import '../../styles/sdlc-leitstand.css';
  ---
  ```

  `<Layout title="Leitstand Design System" rawTitle>` als Wrapper, Root `<div
  class="ls-showcase">`. Abschnittsfolge, je ein `<section class="ls-showcase__section">`
  mit `<h2>`:

  1. **Surfaces & Linien** — Swatch-Raster (Klassen `ls-swatch`/`fill`/`meta`/`nm`/`vl`,
     siehe Task 3 `_card.css`) für `--ls-bg`, `--ls-surface-base`, `--ls-surface-raised`,
     `--ls-line`, `--ls-line-strong`; Hintergrundfarbe je Swatch per Inline-`style={\`background:
     var(--ls-bg)\`}` (Inline-`style`-Attribute liegen außerhalb des `<style>`-Blocks und
     fallen nicht unter das Hex-Verbot aus T6 — hier wird ohnehin nur `var()` referenziert).
  2. **Text-Stufen** — 4 Zeilen (primary/secondary/muted/disabled), Beispieltext
     "Leitstand" in `color: var(--ls-text-<stufe>)`.
  3. **Signal-Set** — 4 `<span class="ls-signal-dot">` mit `style={\`color:
     var(--ls-signal-<x>)\`}` + Label + Token-Name, Hintergrund der Zelle
     `var(--ls-signal-<x>-dim)`.
  4. **Mono-Typografie** — Beispielzeile mit Ticket-ID `T007559` und Countdown `00:42:07`,
     `font-family: var(--ls-font-mono)`.
  5. **Radien & Abstand** — 3 Kästchen (`--ls-radius-sm/md/lg`) + 7 Balken wachsender Breite
     (`--ls-space-1` … `--ls-space-7`), jeweils mit Token-Namen beschriftet.
  6. **Glow/Puls — nur "läuft"** — zwei Beispiele nebeneinander:

     ```astro
     <div class="ls-showcase__row">
       <div class="ls-showcase__pulse-demo">
         <span class="ls-signal-dot ls-running" style={`color: var(--ls-signal-amber)`}></span>
         <span class="ls-showcase__mono">läuft</span>
       </div>
       <div class="ls-showcase__pulse-demo">
         <span class="ls-signal-dot" style={`color: var(--ls-signal-amber)`}></span>
         <span class="ls-showcase__mono">ruhig</span>
       </div>
     </div>
     ```

     `ls-running` ist eine globale Klasse aus `sdlc-leitstand.css` (nicht im Scoped-Style
     dieser Seite neu definiert) — die Animation greift allein durch den Import.
  7. **Print-Light (Report-Ansicht)** —

     ```astro
     <div class="ls-report ls-showcase__report-demo">
       <p class="ls-showcase__eyebrow">Report-Ansicht</p>
       <p>Dieser Block nutzt <code>.ls-report</code> — ausschließlich unter
         <code>@media print</code> wirksam. Kein zweites interaktives Theme: auf dem
         Bildschirm hat die Klasse keine Wirkung, öffnen Sie die Druckvorschau des Browsers
         (Strg/Cmd+P), um die Farben zu sehen.</p>
     </div>
     ```

  8. **Komponenten-Vorschau** — vier Mini-Previews mit denselben Klassen und demselben
     Beispielinhalt wie die vier Karten aus Task 4 (`ls-band` Statusband, `ls-station`
     Stations-Karte, `ls-kpi`×3 KPI-Kacheln, `ls-chip`×3 Ticket-Chips) — Wortlaut identisch
     mit `design/leitstand-ds/cards/statusband-preview.html`,
     `station-card.html`, `kpi-tile.html`, `ticket-chip.html` aus Task 4, damit Showcase und
     DesignSync-Bundle nicht divergieren.

  Scoped `<style>`-Block am Dateiende definiert `.ls-showcase` (Wrapper: `max-width: 1100px;
  margin: 0 auto; padding: var(--ls-space-7) var(--ls-space-6); background: var(--ls-bg);
  color: var(--ls-text-primary); font-family: var(--ls-font-sans);`) plus alle in den
  Abschnitten benutzten Klassen (`ls-showcase__section`, `ls-showcase__row`, `ls-swatch`,
  `.fill`, `.meta`, `.nm`, `.vl`, `ls-signal-dot`, `ls-showcase__mono`, `ls-showcase__eyebrow`,
  `ls-showcase__pulse-demo`, `ls-showcase__report-demo`, `ls-band`, `.item`, `.lbl`, `.val`,
  `ls-station`, `ls-kpi`, `ls-chip`) — 1:1 dieselben Deklarationen wie `_card.css` aus Task 3
  (gleiche Klassennamen, gleiche `var(--ls-*)`-Referenzen). **Zwingend: kein einziger
  Hex-Farbwert irgendwo im `<style>`-Block, auch nicht in Kommentaren (T6)** — jede Farbe
  ausschließlich über `var(--ls-*)`.

  S1-Budget siehe Index-Plan `tasks.md` (Ist 230 · Budget 770) — der Umbau bleibt darunter.

- [x] **Task 3 — `design/leitstand-ds/` DesignSync-Bundle-Grundgerüst anlegen** (Static-Card-
      Pattern wie `design-system/` — mentolder Brand Foundations —, kein Component-Compile).

  `design/leitstand-ds/config.json`:

  ```json
  {
    "name": "SDLC Leitstand Design System",
    "projectId": null,
    "localDir": "design/leitstand-ds",
    "uploadGlobs": ["cards/**"],
    "tokenSource": "components/website/src/styles/sdlc-leitstand.css",
    "cards": [
      "tokens-overview", "signal-set", "statusband-preview",
      "station-card", "kpi-tile", "ticket-chip"
    ]
  }
  ```

  `design/leitstand-ds/_card.css` (gemeinsames Karten-Layout, injiziert von `build.mjs`):

  ```css
  /* _card.css -- shared Leitstand-DS card chrome. Injected into every card (local build input). */
  body.ls-ds-card { background: var(--ls-bg); color: var(--ls-text-primary); font-family: var(--ls-font-sans);
    margin: 0; padding: 48px; -webkit-font-smoothing: antialiased; }
  .ls-ds-wrap { max-width: 960px; margin: 0 auto; }
  .ls-ds-head { margin: 0 0 28px; }
  .ls-ds-head .eyebrow { font-family: var(--ls-font-mono); font-size: 11px; letter-spacing: .12em;
    text-transform: uppercase; color: var(--ls-text-muted); }
  .ls-ds-head h1 { font-size: 28px; line-height: 1.1; margin: 8px 0 6px; color: var(--ls-text-primary); }
  .ls-ds-head p { color: var(--ls-text-secondary); max-width: 64ch; margin: 0; }
  .ls-ds-grid { display: grid; gap: var(--ls-space-6); }
  .cols-3 { grid-template-columns: repeat(3,1fr); } .cols-4 { grid-template-columns: repeat(4,1fr); }
  .ls-swatch { border: 1px solid var(--ls-line-strong); border-radius: var(--ls-radius-md); overflow: hidden; }
  .ls-swatch .fill { height: 72px; }
  .ls-swatch .meta { padding: var(--ls-space-4) var(--ls-space-5); background: var(--ls-surface-base);
    display: flex; flex-direction: column; gap: 3px; }
  .ls-swatch .nm { font: 500 13px/1.2 var(--ls-font-sans); color: var(--ls-text-primary); }
  .ls-swatch .vl { font: 400 11px/1.3 var(--ls-font-mono); color: var(--ls-text-muted); }
  .ls-signal-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: currentColor; }
  .ls-icon-cell { display: flex; flex-direction: column; align-items: center; gap: var(--ls-space-4);
    padding: var(--ls-space-5); background: var(--ls-surface-base); border: 1px solid var(--ls-line);
    border-radius: var(--ls-radius-md); }
  .ls-icon-cell svg { width: 22px; height: 22px; color: var(--ls-text-primary); }
  .ls-icon-cell .cap { font: 400 11px/1.3 var(--ls-font-mono); color: var(--ls-text-muted); }
  .ls-chip { display: inline-flex; align-items: center; gap: var(--ls-space-3); padding: var(--ls-space-2) var(--ls-space-4);
    border-radius: var(--ls-radius-lg); border: 1px solid var(--ls-line-strong); background: var(--ls-surface-base);
    font: 500 12px/1 var(--ls-font-mono); color: var(--ls-text-primary); }
  .ls-kpi { border: 1px solid var(--ls-line-strong); border-radius: var(--ls-radius-md); background: var(--ls-surface-base);
    padding: var(--ls-space-5); }
  .ls-kpi .val { font: 600 26px/1 var(--ls-font-mono); color: var(--ls-text-primary); }
  .ls-kpi .lbl { font: 400 11px/1.3 var(--ls-font-sans); color: var(--ls-text-muted); text-transform: uppercase; letter-spacing: .06em; }
  .ls-station { border: 1px solid var(--ls-line-strong); border-radius: var(--ls-radius-md); background: var(--ls-surface-base);
    padding: var(--ls-space-4); display: flex; align-items: center; justify-content: space-between; gap: var(--ls-space-4); }
  .ls-band { display: flex; gap: var(--ls-space-6); align-items: center; padding: var(--ls-space-4) var(--ls-space-5);
    border: 1px solid var(--ls-line-strong); border-radius: var(--ls-radius-md); background: var(--ls-surface-base); }
  .ls-band .item { display: flex; flex-direction: column; gap: 2px; }
  .ls-band .item .lbl { font: 400 10px/1.2 var(--ls-font-sans); color: var(--ls-text-muted); text-transform: uppercase; letter-spacing: .06em; }
  .ls-band .item .val { font: 500 14px/1.2 var(--ls-font-mono); color: var(--ls-text-primary); }
  ```

  `design/leitstand-ds/build.mjs` — kopiere `design-system/build.mjs` unverändert als Basis
  (liefert `injectRegion`, `extractTokens`, `copyAssets`, `svgGrid`, `assembleCard`, `main`
  mit identischen Signaturen und identischer Kontrollstruktur) und wende diesen Diff an:

  - `BRAND`-Konstante entfällt, ersetze durch:
    ```js
    const REPO_ROOT = join(HERE, '..', '..');
    const TOKEN_SOURCE = join(REPO_ROOT, 'website', 'src', 'styles', 'sdlc-leitstand.css');
    const ICON_SOURCE_DIR = join(REPO_ROOT, 'website', 'public', 'cockpit');
    const ICON_NAMES = ['health-green.svg', 'health-amber.svg', 'health-red.svg', 'chip-open.svg', 'chip-blocked.svg', 'chip-done.svg'];
    ```
  - `extractTokens()`: liest `TOKEN_SOURCE` statt der mentolder-Brand-CSS; Header-Kommentar
    nennt `design/leitstand-ds/build.mjs` + `components/website/src/styles/sdlc-leitstand.css`.
  - `copyAssets()`: die `props`/`logos`-Doppelschleife entfällt, ersetzt durch eine einzelne
    Schleife über `ICON_NAMES` nach `assets/icons/` (`mkdirSync(..., {recursive:true})` +
    `copyFileSync(join(ICON_SOURCE_DIR, name), join(to, name))` je Name).
  - `assembleCard()`: die `props-grid`/`logos-grid`-Zweige entfallen, ersetzt durch einen
    einzigen Zweig für Region `icons-grid` → `svgGrid(join(HERE, 'assets', 'icons'))`.
  - `svgGrid()` inhaltlich unverändert, nur die erzeugte Zellklasse ändert sich zu
    `<div class="ls-icon-cell">…</div>` (statt `icon-cell`).
  - `main()` unverändert (`extractTokens(); copyAssets();` dann jede `cards/*.html` durch
    `assembleCard()` ersetzen, `console.log` der Anzahl).

  `design/leitstand-ds/validate.mjs` — kopiere `design-system/validate.mjs` unverändert als
  Basis (`validateCard()`/`main()`, dieselbe `@dsCard`-Regex, dieselbe
  `tokens:start/end`-Prüfung, derselbe Exit-Code-Vertrag: 0 bei allen Karten OK, sonst 1) und
  ersetze nur die `props-grid`/`logos-grid`-Prüfschleife durch eine einzelne Prüfung der
  Region `icons-grid` (`grid[1].includes('<svg')`); `CARDS` zeigt lokal auf `join(HERE,
  'cards')`.

  `design/leitstand-ds/build.test.mjs` — kopiere `design-system/build.test.mjs` unverändert
  (node:test, `injectRegion`- und `svgGrid`-Tests wörtlich gleich) bis auf zwei Stellen: der
  `svgGrid`-Testpfad wird `new URL('./assets/icons', import.meta.url)` (statt
  `./assets/props`) und die erwartete Zellklasse im letzten Assert wird `/ls-icon-cell/`
  (statt `/icon-cell/`).

  `design/leitstand-ds/NOTES.md`:

  ```markdown
  # SDLC Leitstand Design System -- design-sync notes

  Viertes design-sync-Ziel im Repo, Foundations-Stil wie `design-system/` -- statische
  HTML-Karten, keine Component-Compile-Pipeline.

  ## Re-build / re-sync

  1. `node design/leitstand-ds/build.mjs` -- kopiert die Token-CSS verbatim nach
     `_tokens.css`, kopiert die 6 Cockpit-Glyphen nach `assets/icons/`, injiziert
     Tokens+Card-CSS+Icon-Grid in jede Karte (idempotent).
  2. `node design/leitstand-ds/validate.mjs` -- prueft `@dsCard`-Marker + Regionen.
  3. `node --test design/leitstand-ds/` -- Unit-Tests (setzt Schritt 1 voraus).
  4. Push (interaktiv): `create_project` "SDLC Leitstand Design System" ->
     `finalize_plan { writes:["cards/**"], localDir:"design/leitstand-ds" }` ->
     `write_files`. Nur `cards/**` wird hochgeladen. `projectId` danach in `config.json`
     eintragen.

  ## Quirks

  - Token-DRYness ist an der Quelle garantiert -- nach Token-Aenderung Schritt 1 erneut
    ausfuehren.
  - Die Icon-Glyphen sind bereits T000756-konform (currentColor, kein Root-width/height) --
    reine Kopie, keine Neuzeichnung.
  - DesignSync-Push ist interaktiv; nicht verfuegbar -> Schritt ueberspringen, das Bundle
    bleibt committed und der Push kann spaeter nachgeholt werden.
  ```

  `.mjs` trägt ein S1-Limit von 800 Zeilen (gates.yaml) — alle drei neuen `.mjs`-Dateien
  liegen bei ~50–90 Zeilen, keine Split-Planung nötig.

- [x] **Task 4 — die 6 Preview-Karten unter `design/leitstand-ds/cards/` anlegen** (jede
      beginnt mit `<!-- @dsCard group="Leitstand" name="…" -->` als erster Zeile,
      enthält leere `tokens:start/end`- und `card:start/end`-Regionen, die `build.mjs`
      aus Task 3 füllt).

  `design/leitstand-ds/cards/tokens-overview.html`:

  ```html
  <!-- @dsCard group="Leitstand" name="Token-Uebersicht" -->
  <!DOCTYPE html>
  <html lang="de"><head><meta charset="utf-8"><title>Token-Uebersicht - Leitstand DS</title>
  <!-- tokens:start --><!-- tokens:end -->
  <!-- card:start --><!-- card:end -->
  </head>
  <body class="ls-ds-card">
    <div class="ls-ds-wrap">
      <header class="ls-ds-head">
        <span class="eyebrow">Leitstand Design System</span>
        <h1>Token-Uebersicht</h1>
        <p>Surfaces, Linien und Text-Stufen des Control-Room-Sets (--ls-*). Bewusster Stilbruch zur Kore-Marke.</p>
      </header>
      <section class="ls-ds-grid cols-3">
        <div class="ls-swatch"><div class="fill" style="background: var(--ls-bg);"></div>
          <div class="meta"><span class="nm">Background</span><span class="vl">--ls-bg</span></div></div>
        <div class="ls-swatch"><div class="fill" style="background: var(--ls-surface-base);"></div>
          <div class="meta"><span class="nm">Surface Base</span><span class="vl">--ls-surface-base</span></div></div>
        <div class="ls-swatch"><div class="fill" style="background: var(--ls-surface-raised);"></div>
          <div class="meta"><span class="nm">Surface Raised</span><span class="vl">--ls-surface-raised</span></div></div>
        <div class="ls-swatch"><div class="fill" style="background: var(--ls-line);"></div>
          <div class="meta"><span class="nm">Line</span><span class="vl">--ls-line</span></div></div>
        <div class="ls-swatch"><div class="fill" style="background: var(--ls-line-strong);"></div>
          <div class="meta"><span class="nm">Line Strong</span><span class="vl">--ls-line-strong</span></div></div>
        <div class="ls-swatch"><div class="fill" style="background: var(--ls-surface-base); display:flex; align-items:center; justify-content:center; color: var(--ls-text-primary); font-family: var(--ls-font-mono);">Aa 01</div>
          <div class="meta"><span class="nm">Text Primary</span><span class="vl">--ls-text-primary</span></div></div>
      </section>
    </div>
  </body></html>
  ```

  `design/leitstand-ds/cards/signal-set.html` — Kopf identisch (Titel "Signal-Set"), Body:

  ```html
    <section class="ls-ds-grid cols-4">
      <div class="ls-swatch"><div class="fill" style="background: var(--ls-signal-green-dim); display:flex; align-items:center; justify-content:center;"><span class="ls-signal-dot" style="color: var(--ls-signal-green);"></span></div>
        <div class="meta"><span class="nm">Green</span><span class="vl">--ls-signal-green</span></div></div>
      <div class="ls-swatch"><div class="fill" style="background: var(--ls-signal-amber-dim); display:flex; align-items:center; justify-content:center;"><span class="ls-signal-dot" style="color: var(--ls-signal-amber);"></span></div>
        <div class="meta"><span class="nm">Amber</span><span class="vl">--ls-signal-amber</span></div></div>
      <div class="ls-swatch"><div class="fill" style="background: var(--ls-signal-red-dim); display:flex; align-items:center; justify-content:center;"><span class="ls-signal-dot" style="color: var(--ls-signal-red);"></span></div>
        <div class="meta"><span class="nm">Red</span><span class="vl">--ls-signal-red</span></div></div>
      <div class="ls-swatch"><div class="fill" style="background: var(--ls-signal-info-dim); display:flex; align-items:center; justify-content:center;"><span class="ls-signal-dot" style="color: var(--ls-signal-info);"></span></div>
        <div class="meta"><span class="nm">Info</span><span class="vl">--ls-signal-info</span></div></div>
    </section>
  ```

  `design/leitstand-ds/cards/ticket-chip.html` — Titel "Ticket-Chip", Body:

  ```html
    <section class="ls-ds-grid cols-3">
      <span class="ls-chip" style="color: var(--ls-signal-green);">T007559 - erledigt</span>
      <span class="ls-chip" style="color: var(--ls-signal-amber);">T007560 - laeuft</span>
      <span class="ls-chip" style="color: var(--ls-text-secondary);">T007561 - offen</span>
    </section>
    <section class="ls-ds-grid cols-4" style="margin-top: var(--ls-space-6);">
      <!-- icons-grid:start --><!-- icons-grid:end -->
    </section>
  ```

  `design/leitstand-ds/cards/statusband-preview.html` — Titel "Statusband-Preview", Body:

  ```html
    <div class="ls-band">
      <div class="item"><span class="lbl">Tick</span><span class="val">00:42</span></div>
      <div class="item"><span class="lbl">Queue</span><span class="val" style="color: var(--ls-signal-amber);">7</span></div>
      <div class="item"><span class="lbl">Fleet</span><span class="val" style="color: var(--ls-signal-green);">26/26</span></div>
      <div class="item"><span class="lbl">Kill</span><span class="val" style="color: var(--ls-signal-red);">aus</span></div>
      <div class="item"><span class="lbl">Budget</span><span class="val">62%</span></div>
    </div>
  ```

  `design/leitstand-ds/cards/station-card.html` — Titel "Stations-Karte", Body:

  ```html
    <div class="ls-station">
      <div class="item"><span class="lbl">Station</span><span class="val">Verify</span></div>
      <span class="ls-signal-dot" style="color: var(--ls-signal-amber);"></span>
      <span class="ls-chip" style="color: var(--ls-text-secondary);">4 Tickets</span>
    </div>
  ```

  `design/leitstand-ds/cards/kpi-tile.html` — Titel "KPI-Kachel", Body:

  ```html
    <section class="ls-ds-grid cols-3">
      <div class="ls-kpi"><span class="val">14</span><br/><span class="lbl">Lead Time (h)</span></div>
      <div class="ls-kpi"><span class="val" style="color: var(--ls-signal-green);">96%</span><br/><span class="lbl">Deploy Success</span></div>
      <div class="ls-kpi"><span class="val" style="color: var(--ls-signal-red);">2</span><br/><span class="lbl">CFR (Wochen)</span></div>
    </section>
  ```

  Für die letzten 5 Karten gilt derselbe Kopf/Rahmen wie `tokens-overview.html` (DOCTYPE,
  `<head>` mit dem jeweiligen Titel, `tokens:start/end` + `card:start/end` leer, `<body
  class="ls-ds-card"><div class="ls-ds-wrap"><header class="ls-ds-head">…</header>` gefolgt
  vom oben gezeigten Body, `</div></body></html>` schließend) — der `@dsCard`-Kommentar in
  Zeile 1 trägt jeweils den Kartennamen aus `config.json` (`name="Signal-Set"`,
  `name="Ticket-Chip"`, `name="Statusband-Preview"`, `name="Stations-Karte"`,
  `name="KPI-Kachel"`).

- [x] **Task 5 — lokale Verifikation (nicht das mandatory Verify-Gate — das trägt p3/der
      Index-Plan; hier nur lokale Absicherung vor Übergabe).**

  ```bash
  node design/leitstand-ds/build.mjs
  node design/leitstand-ds/validate.mjs
  node --test design/leitstand-ds/
  # Spot-Check gegen den p3-Test-Kontrakt (informell, kein Ersatz für p3s BATS-Datei):
  grep -cE -- '--ls-surface-[a-z0-9]+:' components/website/src/styles/sdlc-leitstand.css   # >= 2
  grep -qF 'sdlc-leitstand.css' components/website/src/pages/sdlc/design-system.astro
  ```

- [x] **Task 6 — DesignSync-Push (interaktiv, optional/überspringbar).**
      _Übersprungen: DesignSync im ausführenden Kontext nicht verfügbar — Bundle liegt
      committed unter `design/leitstand-ds/`, Push kann nachgeholt werden (kein Blocker)._

  Interaktiver Schritt mit dem DesignSync-Tool: `create_project` (Name "SDLC Leitstand
  Design System") → `finalize_plan { writes: ["cards/**"], localDir: "design/leitstand-ds"
  }` → `write_files`; zurückgegebene `projectId` in `design/leitstand-ds/config.json`
  eintragen. **Ist DesignSync im ausführenden Kontext nicht verfügbar, wird dieser Schritt
  übersprungen** — das Bundle liegt bereits committed unter `design/leitstand-ds/` und der
  Push kann später nachgeholt werden; kein Blocker für p2/p3 oder den Merge dieses Changes.

## Koordination mit p3 (nicht Teil dieses Partials)

Formale BATS-Abdeckung (`tests/spec/sdlc-cockpit/leitstand-ds-tokens.bats`, T1–T7) liegt in
`tasks.d/p3-tests.md` — außerhalb der `target_files` dieses Partials (D1, disjunkte Splits).
Dieser Partial liefert ausschließlich die drei oben genannten Pfade und richtet Token-Namen
sowie Glow/Print-Struktur exakt nach dem Test-Kontrakt oben aus. Die drei mandatory
Verify-Commands (`task test:changed`, `task freshness:regenerate`, `task freshness:check`)
stehen im Index-Plan `tasks.md` und in `tasks.d/p3-tests.md` — hier nicht dupliziert.
