# Projekt-Cockpit — Asset-Manifest & Claude-Design-Prompts

> Deko-/UI-Assets für das **Projekt-Cockpit** (`/admin/cockpit`, T000748ff.).
> Vorbild & gleiche Strenge wie `website/public/factory/MANIFEST.md`.
> Asset-Erstellung = eigenes Ticket (siehe unten); die Cockpit-Features P1–P4
> (T000749–T000752) bauen **gegen die hier festgelegten stabilen Pfade**.

## ⚠️ KRITISCHER INTEGRATIONS-KONTRAKT (sonst rendern alle Assets unsichtbar)

Die Cockpit-Assets sind **dual-brand** und färben sich über `currentColor` /
CSS-Variablen ein (mentolder Brass-Gold, korczewski Sage). Damit das funktioniert,
**müssen sie INLINE ins DOM** — als roher SVG-Markup (`?raw`-Import / `set:html` /
Svelte-Snippet), **NICHT** über `<img src>` oder `background-image: url()`.

**Warum (verifiziert gegen den Code):** Ein SVG, das via `<img>` oder
`background-image` geladen wird, ist ein *isoliertes Dokument*. Es erbt **nicht**
die `color` der Host-Seite (→ `stroke="currentColor"` fällt auf Schwarz zurück) und
liest **nicht** deren CSS-Custom-Properties (→ `var(--cockpit-accent)` ist undefiniert).
Resultat: **schwarz-auf-schwarz, unsichtbar** auf `--color-dark` (#0b111c), ganz ohne
Fehler. Das `<img onerror>`-Pattern vom Factory-Floor (`FactoryFloor.svelte:293`)
funktioniert dort **nur**, weil die Farbe **monochrom Gold hartcodiert** ist
(single-brand). Für dual-brand geht das nicht.

- **Icons & Empty-States** → inline-SVG-Injection. Graceful Degradation =
  Fetch-/Render-Fehler-Fallback (CSS-Platzhalter), **nicht** `<img onerror>`.
- **Header-Backdrop** → CSS-**Mask**-Stencil: Host malt
  `background-color: var(--cockpit-backdrop-ink)` durch `mask-image: url(header-backdrop.svg)`.
  Das ist der einzige Weg, der externe URL **und** per-brand-Theming vereint.
- Defensiv: Host setzt `color:` immer explizit auf einen sichtbaren Brand-Ton, damit
  ein vergessenes/refaktoriertes `color` **sichtbar** statt schwarz scheitert.

> **An P3 (T000751 Frontend):** dieser Kontrakt ist als Injection (`--phase implement`)
> hinterlegt. Bitte Asset-Loader entsprechend bauen, **nicht** `<img>` verwenden.

## Palette (Tokens aus `website/src/styles/global.css`)

| Rolle | mentolder | korczewski (Kore) |
|------|-----------|-------------------|
| Vordergrund-Linie | `--color-fg` `#eef1f3` (über `currentColor`) | dito |
| Akzent | Brass-Gold `--color-gold` `oklch(0.80 0.09 75)` | Sage `--color-sage` `oklch(0.80 0.06 160)` |
| Health grün | Sage `oklch(0.80 0.06 160)` | Sage |
| Health amber | Brass/Gold `oklch(0.80 0.09 75)` | Brass/Gold |
| Health rot | Danger `#d77a6e` | Danger |
| Hintergrund (von Komponente) | Ink `#0b111c` / `#101826` | dito |

**Regel:** Im SVG **niemals** `oklch(...)`, `#d77a6e` o.ä. Brand-Literale schreiben.
Nur `fill="none"` und `stroke="currentColor"` bzw. `stroke="var(--cockpit-accent, currentColor)"`.
Health-Farbe kommt von der **Host-Pille** (`color`/`background` per Status), nicht aus dem Glyph
— die Glyphen unterscheiden sich per **Form** (a11y, nicht nur Farbe).

## Asset-Inventar (stabile Pfade — P3 baut hiergegen)

| Pfad | viewBox | Zweck | Alt-Text (DE) |
|------|---------|-------|---------------|
| `website/public/cockpit/empty/empty-portfolio.svg` | 0 0 240 160 | Empty state for an entirely empty Portfolio (no products/features yet) — invites creating the first project. | Leeres Portfolio: drei gepunktete Projektkartenumrisse mit einem Plus-Symbol als Hinweis, das erste Projekt anzulegen. |
| `website/public/cockpit/empty/product-no-features.svg` | 0 0 240 160 | Empty state for a Produkt container that holds zero Features — invites adding the first feature. | Produkt ohne Features: ein geöffneter, leerer Behälter mit gepunkteten Innenlinien und einem aufsteigenden Plus-Symbol. |
| `website/public/cockpit/empty/feature-no-tickets.svg` | 0 0 240 160 | Empty state for a Feature drilled into with zero leaf tickets — invites creating the first ticket/work package. | Feature ohne Tickets: ein Knoten mit Verzweigungen zu gepunkteten, noch leeren Ticket-Knoten und einem Plus-Knoten zum Anlegen. |
| `website/public/cockpit/empty/filter-no-results.svg` | 0 0 240 160 | Empty state for a Tabelle/search/filter that returned no matches — invites adjusting search or clearing the filter. | Keine Treffer: eine Lupe über gepunkteten, leeren Listenzeilen mit einem Hinweis, den Filter zurückzusetzen. |
| `website/public/cockpit/icons/lens-ueberblick.svg` | 0 0 24 24 | Segmented-toggle icon for the calm "Überblick" lens — a portfolio of feature/product cards seen from above. | Überblick-Ansicht: ruhige Portfolio-Kachelübersicht |
| `website/public/cockpit/icons/lens-werkbank.svg` | 0 0 24 24 | Segmented-toggle icon for the dense "Werkbank" lens — hands-on drill-in / tools view. | Werkbank-Ansicht: detaillierte Bearbeitung mit Werkzeugen |
| `website/public/cockpit/icons/mode-karten.svg` | 0 0 24 24 | Layout-mode toggle: switch to "Karten" (card list) layout. | Kartenansicht: Einträge als gestapelte Karten |
| `website/public/cockpit/icons/mode-tabelle.svg` | 0 0 24 24 | Layout-mode toggle: switch to "Tabelle" (rows) layout. | Tabellenansicht: Einträge als Zeilen |
| `website/public/cockpit/icons/drag-handle.svg` | 0 0 24 24 | Reorder affordance (drag handle) on ticket rows in Werkbank. | Ziehgriff zum Umsortieren |
| `website/public/cockpit/icons/bulk-select.svg` | 0 0 24 24 | Multi-select control / checkbox-stack for bulk actions in Werkbank. | Mehrfachauswahl: mehrere Einträge markieren |
| `website/public/cockpit/icons/reparent.svg` | 0 0 24 24 | Move a ticket into another Feature/Produkt (reparent) — arrow entering a bracket/container. | Ticket einem anderen Feature/Produkt zuordnen |
| `website/public/cockpit/icons/enqueue-factory.svg` | 0 0 24 24 | Send a ticket into the Software-Factory pipeline — arrow entering a cog. | An die Software-Factory übergeben |
| `website/public/cockpit/icons/drawer-open.svg` | 0 0 24 24 | Open the right-side detail drawer for a ticket. | Detail-Seitenleiste öffnen |
| `website/public/cockpit/health-green.svg` | 0 0 16 16 | Health badge: on-track / done. Closed full ring + crisp check. Themed via currentColor → sage on both brands. | Gesund — auf Kurs, abgeschlossen |
| `website/public/cockpit/health-amber.svg` | 0 0 16 16 | Health badge: in progress. Half/open ring arc + centered dot. Openness of the arc is the shape signal. | In Arbeit — läuft |
| `website/public/cockpit/health-red.svg` | 0 0 16 16 | Health badge: blocked. Ring + two vertical pause-bars (halt), deliberately not a warning triangle. | Blockiert — angehalten |
| `website/public/cockpit/chip-done.svg` | 0 0 16 16 | Leading glyph for the 'erledigt' count chip. Lone check, no ring, optically light. | Erledigt |
| `website/public/cockpit/chip-blocked.svg` | 0 0 16 16 | Leading glyph for the 'blockiert' count chip. Two pause-bars, no ring — same halt vocabulary as health-red. | Blockiert |
| `website/public/cockpit/chip-open.svg` | 0 0 16 16 | Leading glyph for the 'offen' count chip. Single hollow outline circle (not-yet-started token). | Offen |
| `website/public/cockpit/progress-ring.svg` | 0 0 24 24 | Reusable progress ring template: faint track + clockwise progress arc from 12 o'clock. JS overrides stroke-dasharray/dashoffset per card; comments document C=2·π·r and 0/25/50/75/100 offsets. Single asset, not five. | Fortschritt |
| `website/public/cockpit/header-backdrop.svg` | 0 0 1280 220 | Optional, extremely subtle decorative header backdrop behind the Projekt-Cockpit 'Überblick' top strip (page title + Überblick/Werkbank + Karten/Tabelle toggles). A faint blueprint/portfolio-grid line motif: fine minor + fainter major drafting grid, 3–5 outline-only abstract 'portfolio cards' (each with a title rule, value-prop rule, and a small progress-ring circle) weighted to the lower band, plus faint registration/axis lines and left-margin tick marks. Outline-only, hairline strokes, overall opacity ~0.05–0.10. Drives all color from currentColor / var(--cockpit-backdrop-ink) so a single asset themes to both brands (mentolder brass, korczewski sage). Crops/tiles gracefully (preserveAspectRatio xMidYMid slice) and degrades to nothing when absent (component onerror-hides). LOW PRIORITY / out-of-MVP polish. | Dezente Blaupausen-Rasterkulisse im Hintergrund der Projekt-Cockpit-Überblicksleiste |
| `website/public/cockpit/icons/drawer-close.svg` | 0 0 24 24 | Detail-drawer close/dismiss affordance (Werkbank right-side drawer) | (siehe promptSeed) |
| `website/public/cockpit/icons/bulk-remove.svg` | 0 0 24 24 | Destructive bulk action in the Werkbank multi-select bulk-action bar (remove/archive selected tickets) — reparent + enqueue-factory exist, but the most common bulk verb has no glyph | (siehe promptSeed) |

## Bewusst KEIN Asset (reines CSS — nicht generieren)

- Portfolio card frame / container shadow / rounded corners
- Colored left health border on cards (driven by var(--health) per card, 4px solid border-left)
- One-line value-proposition text and status-chip count labels (typography only)
- Status-chip pill backgrounds/shapes (chip-done/blocked/open supply only the leading glyph; the pill is CSS)
- Progress BAR variant (the linear analogue of progress-ring — a div with a width-% fill, no SVG needed)
- Segmented-toggle frame/track and the active-segment pill (Überblick|Werkbank, Karten|Tabelle) — lens-* and mode-* glyphs sit inside CSS segments
- Inline status/priority dropdown disclosure caret (classic CSS border-triangle or unicode ▾)
- Multi-select checkbox checked/indeterminate states (native input or CSS pseudo-element; bulk-select.svg is the bar control, not the per-row box)
- Tabelle row grid lines, zebra striping, sticky header rule
- Drag-in-progress ghost row / drop-target highlight (CSS outline + opacity during DnD)
- Bulk-action bar container/backdrop (CSS sticky bar; only its individual action glyphs are assets)

## Format-Regeln (für jeden Prompt verbindlich)

- Ein einzelnes `<svg>` pro Datei, transparenter Hintergrund, **kein** Raster/`<image>`/`<foreignObject>`/externe Fonts, **kein** `<text>` (Headlines leben im DOM).
- `viewBox` gesetzt, **keine** festen `width`/`height` (kollidieren mit CSS-Sizing).
- `fill="none"`, `stroke="currentColor"`; der eine Akzent: `stroke="var(--cockpit-accent, currentColor)"`.
- Ziel < 8 KB/Datei. States per **Form** unterscheidbar (a11y), nicht nur per Farbe.
- Inline-injizieren (siehe Integrations-Kontrakt oben) — **nie** `<img src>`.

---

# Die Prompts für Claude Design

> Jeder Block ist eigenständig copy-paste-fähig. Englisch (Generatoren reagieren besser),
> deutsche UI-Begriffe als Eigennamen erhalten. Alle vier wurden adversarisch auf
> Produktionstauglichkeit geprüft (der `<img>`-vs-`currentColor`-Bug ist darin bereits behoben).

## 1) Empty-State-Illustrationen (4 Dateien) — höchster visueller Wert

```text
You are authoring four hand-crafted line-art SVG empty-state illustrations for the **Projekt-Cockpit**, an internal admin project-management view (Astro + Svelte islands, dark theme). These are the highest visual-value assets in the cockpit: each one fills the calm, hopeful "nothing here yet" moment for a non-technical product owner (Gekko). They must feel crafted, invitational, and quietly confident — NOT error-like, NOT generic-AI-dashboard, NOT clip-art.

=== HOW THESE ARE RENDERED — READ FIRST, IT DRIVES EVERY COLOR DECISION ===
There is a hard browser rule that governs this whole task: an SVG loaded through an HTML `<img src="…">` tag is an isolated document. It CANNOT inherit the host page's `color` (so `stroke="currentColor"` would resolve to black) and CANNOT read the host page's CSS custom properties (so `var(--cockpit-accent)` would be undefined). On the cockpit's dark surface (`--color-dark` = #0b111c) that means an `<img>`-loaded asset renders black-on-black and invisible.

Therefore the cockpit component will **inline-inject** these SVGs (fetch the file, then render the SVG markup directly into the DOM via Svelte `{@html}` / `innerHTML`, NOT via `<img src>`), so that `currentColor` and CSS variables resolve against the host's styles and dual-brand theming works. You are authoring the SVG so that this inline-injection path themes perfectly. You do NOT need to write the component — but every color choice below assumes inline injection. Two consequences you MUST honor:

  (a) DUAL-BRAND THEMING via `currentColor` / CSS vars is the goal AND it only works inline — so use it (details in §4). 
  (b) BECAUSE `currentColor` falls back to a near-black value on a dark surface if the host ever forgets to set `color` (or a future refactor wrongly uses `<img>`), you MUST make the SVG fail to a VISIBLE hue, never to invisible black. Do this by setting a default `color` on the root `<svg>` itself via the `style` attribute: `style="color: var(--cockpit-fg, #c8ad7a)"`. This means: the host's brand `color` wins when present; otherwise it falls back to the CSS var; otherwise to a warm brass-neutral `#c8ad7a` that is clearly visible on dark. (`#c8ad7a` is a deliberately neutral warm grey-gold that flatters both brands as a *fallback only* — it is NOT a brand color and is never used as the primary fill anywhere else; all actual lines still reference `currentColor`, which now resolves to this default when unstyled.) This is the ONE place a hex literal is permitted, and only inside the `color:` fallback on the root element.

=== NON-NEGOTIABLE TECHNICAL CONTRACT (mirror the existing `website/public/factory/MANIFEST.md` rigor exactly) ===
1. Output = clean, hand-authored SVG. One single `<svg>` element per file. No `<image>`, no embedded raster/base64, no `<foreignObject>`, no external fonts, no `<text>` at all (headlines live in the DOM, not the asset). Target < 8 KB per file (aim for 3–5 KB).
2. viewBox = `0 0 240 160` on every file. NO fixed `width`/`height` attributes (they fight CSS sizing). Set `preserveAspectRatio="xMidYMid meet"`. Add `role="img"`. Provide an accessible name via a `<title>` element as the FIRST child of the `<svg>` (using the supplied German text) — do NOT also put an `aria-label` on the `<svg>` (the host wrapper owns the live a11y name; see §6 so the name is announced once, not twice). Include `xmlns="http://www.w3.org/2000/svg"`.
3. Transparent background — never draw a filled background rect. The component places these on `--color-dark` (#0b111c).
4. DUAL-BRAND THEMING IS LOAD-BEARING and works because the asset is inline-injected (see top section). Do NOT bake a brand hex as the only color anywhere. Concretely:
   - Root element carries the visible-fallback default: `<svg ... style="color: var(--cockpit-fg, #c8ad7a)">`. The host component overrides `color` per brand (mentolder → brass foreground, korczewski → Kore foreground).
   - Structural / primary line-art: `stroke="currentColor"` with `stroke-opacity` ramps (1.0 for the focal object, ~0.45 for secondary scaffolding, ~0.22 for faint/background dotted scaffolding). Because of the root `color:` default, `currentColor` is ALWAYS visible even with zero host CSS.
   - The ONE accent stroke per illustration: `stroke="var(--cockpit-accent, currentColor)"`. Mentolder leaves it unset (falls to currentColor = brass) or sets `--cockpit-accent: var(--color-gold)`; korczewski sets `--cockpit-accent: var(--color-sage)`. The `currentColor` fallback means the accent is always visible too.
   - NEVER write `oklch(...)`, `#d77a6e`, or any brand hex literally inside path strokes/fills. The ONLY hex literal permitted in the entire file is `#c8ad7a` inside the root `style="color: …"` fallback (§b above). The only other literal allowed is `none` for fills.
5. Stroke style throughout: `fill="none"`, `stroke-width="2"` for focal lines, `stroke-width="1.5"` for secondary, `stroke-width="1"` for faint scaffolding; `stroke-linecap="round"`, `stroke-linejoin="round"`. Use `stroke-dasharray` only for the deliberately "empty/placeholder" dotted outlines (e.g. `4 6`) — this dotted-vs-solid contrast is the core visual language of empty states. Keep total path count low and the composition sparse with generous negative space.
6. a11y / state legibility — TWO requirements:
   (i) The four illustrations must be distinguishable from each other by SHAPE and composition alone, never by color (a colorblind owner must tell "leeres Portfolio" from "keine Treffer" instantly). Encode the distinction structurally:
     - empty-portfolio → a wide empty shelf / grid of dotted card outlines (breadth, the whole board is bare).
     - product-no-features → ONE solid container/folder that is open and hollow inside (the box exists, its contents don't).
     - feature-no-tickets → a solid branch/node with dotted leaf stubs dangling (the parent exists, leaves don't).
     - filter-no-results → a magnifying-glass / funnel over a list whose rows have collapsed to dotted ghosts (a search gesture, results gone).
   (ii) Accessible-name placement: the SVG carries a `<title>` (first child) holding the German alt text, AND the host component sets the same German text as the wrapper element's accessible name (e.g. `aria-label` on the injecting `<div role="img">`, or `alt` if a future `<img>` path is used). To avoid the name being announced twice once injected inline, do NOT add `aria-label` to the `<svg>` itself — the `<title>` is sufficient inside the SVG and the wrapper owns the live name. (This deliberately differs from the factory floor's decorative `alt=""` icons, because an empty-state illustration carries meaning and must be named.)
7. Tone: hopeful, inviting, "ready for you to start", with exactly 1–2 accent strokes (a small plus-spark, an upward tick, a gentle highlight) that read as "add something here". Avoid sad faces, broken/cracked icons, ghosts-as-spooks, dust, tumbleweeds, error triangles, or any literal "404/empty box with a frown" cliché. Calm geometry over cuteness.
8. Optical framing: keep all artwork inside an inner margin of ~24px (i.e. roughly x:24–216, y:20–140) so nothing clips when the component scales it down to ~180px wide. Center the composition; let the bottom ~20px breathe (the DOM headline + subline sit directly beneath the image).

=== GRACEFUL DEGRADATION (the cockpit relies on this like the factory floor, adapted for inline injection) ===
Each file lives at a STABLE path under `website/public/cockpit/empty/`. The Svelte component fetches the file and inline-injects it; if the fetch fails or returns non-SVG, the component silently swaps in a CSS placeholder (the inline-injection analogue of the factory floor's `<img onerror>` fallback — note that `onerror` does NOT fire for inline-injected markup, so the component uses a fetch/parse-failure guard instead). Do not change these paths or filenames. Independently, because the root `<svg>` carries the `color: var(--cockpit-fg, #c8ad7a)` visible-fallback default, the asset ALSO degrades gracefully (visible, not black) if it is ever rendered with no host theming at all.

=== THE FOUR FILES — author each precisely as specified ===

1) FILE: `website/public/cockpit/empty/empty-portfolio.svg`
   viewBox `0 0 240 160`. DEPICTS: the whole Portfolio is bare. Draw a sparse 3-up row of card outlines as dotted/dashed rounded rectangles (`stroke-dasharray="4 6"`, currentColor @ ~0.4 opacity), each with two faint short dashed lines inside hinting at a title + value-prop that aren't written yet. Above/behind them, one very faint solid baseline shelf line (currentColor @ ~0.22). The single accent: in the first (leftmost) card, a small solid rounded "+" spark drawn with `stroke="var(--cockpit-accent, currentColor)"`, stroke-width 2 — the invitation to create the first project. Composition reads wide and calm. `<title>` text: "Leeres Portfolio: drei gepunktete Projektkartenumrisse mit einem Plus-Symbol als Hinweis, das erste Projekt anzulegen."
   Suggested DOM copy (NOT in the SVG): Headline „Noch keine Projekte" · Subline „Lege dein erstes Produkt an, um loszulegen."

2) FILE: `website/public/cockpit/empty/product-no-features.svg`
   viewBox `0 0 240 160`. DEPICTS: a Produkt container exists but holds zero Features. Draw ONE solid, open folder/container (rounded rectangle with a lifted tab/lid), currentColor solid stroke-width 2 — clearly a real, present box. Inside it: emptiness expressed as two or three short dotted shelf lines (`stroke-dasharray="4 6"`, ~0.35 opacity) where Feature rows would sit. Single accent: a gentle upward chevron/tick or a small "+" rising out of the open container, `stroke="var(--cockpit-accent, currentColor)"` — "add the first feature here". Distinct from #1 because it is ONE solid object, not a row of dotted ones. `<title>` text: "Produkt ohne Features: ein geöffneter, leerer Behälter mit gepunkteten Innenlinien und einem aufsteigenden Plus-Symbol."
   Suggested DOM copy: Headline „Dieses Produkt ist noch leer" · Subline „Füge das erste Feature hinzu."

3) FILE: `website/public/cockpit/empty/feature-no-tickets.svg`
   viewBox `0 0 240 160`. DEPICTS: a Feature drilled into, with zero leaf tickets. Draw a small solid parent node (rounded square or circle) near the top-center, currentColor solid stroke-width 2, with two or three solid connector lines branching downward — but the leaf ends terminate in DOTTED leaf-node outlines (small dotted circles/rounded squares, `stroke-dasharray="3 5"`, ~0.4 opacity): the branches reach toward tickets that don't exist yet. Single accent: one of the leaf stubs is a solid small "+" node in `stroke="var(--cockpit-accent, currentColor)"` — start the first ticket. Tree/branch silhouette makes it unmistakably different from the folder (#2) and the card-row (#1). `<title>` text: "Feature ohne Tickets: ein Knoten mit Verzweigungen zu gepunkteten, noch leeren Ticket-Knoten und einem Plus-Knoten zum Anlegen."
   Suggested DOM copy: Headline „Keine Tickets in diesem Feature" · Subline „Zerlege es in erste Arbeitspakete."

4) FILE: `website/public/cockpit/empty/filter-no-results.svg`
   viewBox `0 0 240 160`. DEPICTS: a Tabelle/search returned nothing. Draw a clean magnifying glass (solid circle lens + handle, currentColor stroke-width 2) hovering over a short stack of list rows whose content has collapsed to dotted ghost lines (`stroke-dasharray="4 6"`, ~0.3 opacity) — the rows exist as a list shape but hold no matches. Optionally a faint funnel hint behind the rows (currentColor @ ~0.22) to read as "filter active". Single accent: a small reset/clear gesture — e.g. a short curved arrow or a tiny "×" on the lens — in `stroke="var(--cockpit-accent, currentColor)"`, suggesting "clear the filter". The search-gesture silhouette is categorically different from the other three (no plus-to-create here; this one is about loosening a filter). `<title>` text: "Keine Treffer: eine Lupe über gepunkteten, leeren Listenzeilen mit einem Hinweis, den Filter zurückzusetzen."
   Suggested DOM copy: Headline „Keine Treffer" · Subline „Passe Suche oder Filter an."

=== OUTPUT FORMAT ===
Return the four files as four separate fenced code blocks, each preceded by its full path comment (`<!-- website/public/cockpit/empty/<name>.svg -->`). No prose between blocks beyond the path. Verify before returning: each file is a single SVG whose root is exactly `<svg viewBox="0 0 240 160" role="img" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="color: var(--cockpit-fg, #c8ad7a)">` with a `<title>` as the FIRST child (no `aria-label` on the `<svg>`); every primary line uses `stroke="currentColor"`; the single accent uses `stroke="var(--cockpit-accent, currentColor)"`; the ONLY hex literal in the file is `#c8ad7a` inside the root `style` `color:` fallback; no `oklch`/other brand hex/raster/external font/`<text>` anywhere; no `width`/`height`; and the byte size is well under 8 KB. The four must be mutually distinguishable by shape with all color stripped to a single hue. Final mental test: rendered inline with `color` unset, every line is visibly warm-neutral on #0b111c (not black); with the host setting brand `color` + `--cockpit-accent`, the whole asset and its single accent re-theme correctly for both mentolder and korczewski.
```

## 2) Control- & Edit-Icon-Set (Linsen, Modi, Drag, Bulk, Reparent, Factory, Drawer)

```text
You are authoring a **coherent monochrome SVG icon family** for the internal **Projekt-Cockpit** admin view (Astro + Svelte islands, dark theme, dual-brand). These are UI control / edit-affordance icons — lens toggles, layout toggles, row controls, and actions. Produce **9 hand-authored SVG files**, one `<svg>` per file. This is a precision line-icon set in the spirit of Lucide / Phosphor, NOT decorative illustration. Treat it as ONE family: every glyph must share identical stroke weight, corner radius, terminal style, arrowhead style, and optical density so they read as siblings on a toolbar.

=== CRITICAL INTEGRATION FACT — READ FIRST (determines theming correctness) ===
These icons are themed by the host page's CSS `color` (mentolder Brass-Gold `oklch(0.80 0.09 75)` vs korczewski Kore sage `oklch(0.80 0.06 160)`). `currentColor` ONLY inherits the host color when the SVG is **inlined into the DOM** (raw-import / `set:html` / a Svelte snippet) — which is exactly how this codebase themes its existing icons (see `TicketsTab.svelte`, `TestResultsPanel.svelte`, `InhalteEditor.svelte`, all `stroke="currentColor"` at `stroke-width="1.5"`). An SVG loaded via `<img src=…svg>` renders in an ISOLATED context where `currentColor` falls back to the SVG's own default (black) and CANNOT see the host color — so it would render black on BOTH brands and defeat the entire dual-brand goal. Therefore: author every file as a self-contained inline-injectable `<svg>` that themes purely through inherited `currentColor`. Do NOT bake any literal color. Do NOT assume `<img>` loading.

=== HARD CONSTRAINTS (every file) ===
- Output: clean, hand-authored SVG. Exactly ONE `<svg>` element per file. No `<image>`, no embedded raster/base64, no `<foreignObject>`, no external fonts, no `<text>`, no `<style>` block, no `class` attribute (avoid collisions with Svelte scoped-CSS / Tailwind on inline injection), no `id` that could clash across multiple inlined icons. Target **< 8 KB** per file (most should be well under 2 KB).
- Root attributes EXACTLY: `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="1.5"`, `stroke-linecap="round"`, `stroke-linejoin="round"`. NO `width`/`height` on the root (CSS sizes them). NO literal `color`/`stroke`/`fill` value anywhere other than `fill="none"` on the root and per-element `fill="currentColor"` where a glyph legitimately needs a fill (see dot/fill exception below). Children inherit stroke props from the root — do not repeat them per-path unless an element legitimately overrides.
- **Monochrome via `currentColor` ONLY.** Never introduce a second color, gradient, or opacity-based shading that implies a second tone. One asset must theme to BOTH brands by inheritance alone.
- Geometry sits on a clean grid with a ~2px optical safe-area inset (live area roughly `2..22`). Rounded, soft corners — `rx`/`ry` ≈ 2 on rects, gentle arcs on joins — kept CONSISTENT across all 9.
- **MINIMUM RENDER SIZE = 18px (range 18–24px).** Tune density so each glyph stays legible and crisp at 18px with a 1.5 stroke on a 24 viewBox (avoid sub-pixel clutter — fewer, cleaner strokes beat fine detail that smears at 18px). Do not design only for 24px.
- **FILL EXCEPTION (the only sanctioned fill):** filled dots in `drag-handle.svg` and the small filled accent(s) in `bulk-select.svg` use `fill="currentColor"`. All dots share ONE radius (≈1.1). Keep these filled elements optically LIGHT so #5/#6 do not read heavier than the stroke-only glyphs — match perceived mass, not bounding box. Every other glyph is stroke-only.

=== a11y ===
- Distinguishable by SHAPE, not color (single-color render → shape is the only signal). Each icon must be unambiguous as a pure silhouette at 18–24px.
- Accessibility name is supplied by the host component as `role="img"` + `aria-label` (German, listed per file). To avoid double-announcement, **OMIT `<title>` from the SVG file** — the component owns the accessible name. (If a hover-tooltip is later wanted, the integrator adds it; do not bake it.)
- German `alt`/`aria-label` text is specified per file in the FILE LIST below.

=== AESTHETIC ===
Calm, crafted, engineering-precise. Explicitly AVOID generic AI-dashboard / clip-art / gradient / drop-shadow / skeuomorphic looks. No filters, gradients, or masks unless truly unavoidable. Geometric, confident, minimal. Optically normalize visual weight: a grid icon and a single-arrow icon should feel equally "heavy" on the bar.

=== FILE PATHS (write exactly here) ===
All under `website/public/cockpit/icons/`. Stable paths so the component can degrade gracefully (see degradation note).

=== THE 9 GLYPHS (one family) ===
Lens toggle (segmented control "Überblick ↔ Werkbank"):
1. `lens-ueberblick.svg` — CALM OVERVIEW / portfolio. A tidy 2×2 grid of four rounded squares (rx≈2) with generous, even gutters — reads as a portfolio of cards seen from above. Airy/sparse (calm non-technical owner view). NOT a dense table.
2. `lens-werkbank.svg` — WORKBENCH / drill-in / tools. A wrench crossed with a flat-blade screwdriver (an "X" of two tools) OR a workbench bar with two small tools resting on it. Must read instantly as "hands-on / tools / detail work" and contrast clearly in silhouette against the calm grid of #1.

Layout-mode toggle ("Karten ↔ Tabelle"):
3. `mode-karten.svg` — CARDS layout. 2–3 stacked rounded rectangles, each with a short header line + one body line inside (a card with content) → "card list". Distinct from the 2×2 grid of #1: this is a VERTICAL STACK of content cards, not a symmetric portfolio grid.
4. `mode-tabelle.svg` — TABLE / rows layout. A rounded outer frame divided into 3–4 horizontal rows with one vertical divider near the left (a leading column) → a data table. Clearly denser/row-based vs the airy cards of #3.

Row / list controls (Werkbank ticket list):
5. `drag-handle.svg` — REORDER grip. A 6-dot grip (2 columns × 3 rows of small `fill="currentColor"` dots, radius ≈1.1) — the canonical drag affordance. Even spacing, vertically centered, optically light.
6. `bulk-select.svg` — MULTI-SELECT / checkbox-stack. A front rounded checkbox WITH a check mark, plus a second offset rounded square behind it (top-right) to signal "multiple / stack". The front box's check makes "selected" legible by shape alone. Check stroke uses the family weight; any filled accent uses `fill="currentColor"` and stays light.
7. `reparent.svg` — MOVE ticket to another Feature/Produkt. A horizontal arrow flying INTO a square bracket `[` / partial container outline open on the right (container on the right, arrow entering from the left). Reads as "move item into another container". Arrowhead identical to #8/#9.
8. `enqueue-factory.svg` — SEND TO SOFTWARE FACTORY pipeline. A gear/cog (≈6–7 teeth, hollow center) with a small arrow pointing INTO it from the left — "hand off into the automated pipeline". Ties to the existing Factory-floor cog visual language. Keep the cog optically light (stroke outline, not a heavy solid disc). Arrowhead identical to #7/#9.
9. `drawer-open.svg` — OPEN DETAIL SIDE PANEL. A rounded panel frame with a vertical divider creating a narrow RIGHT-hand column (the drawer), plus a small right-pointing chevron/arrow (at the divider or entering the column) → "slide the detail drawer open". Must contrast with `mode-tabelle.svg`: this is panel + side-column + directional cue, NOT multiple data rows. Arrowhead/chevron consistent with #7/#8.

=== FAMILY COHERENCE CHECK (do before finalizing) ===
- Lay all 9 side by side mentally at 18–20px: same stroke weight, same corner softness, same terminal rounding, same perceived mass. Adjust outliers — including ensuring the filled dots of #5 and the filled accent of #6 do NOT read heavier than the stroke glyphs.
- Directional arrows/chevrons in #7, #8, #9 share ONE arrowhead style (same head length + angle).
- All dots share ONE radius (≈1.1) and the same `fill="currentColor"` convention.
- Nothing relies on color to be understood. Verify each is a clear silhouette.

=== GRACEFUL DEGRADATION (for the integrator, not the SVG geometry) ===
Each icon lives at a stable path `/cockpit/icons/<name>.svg` and is **INLINED** into a host element whose CSS `color` is the brand accent (raw-import / `set:html` / Svelte snippet) so `currentColor` themes it per brand. If an icon fails to load/inline, the component hides the node and a CSS background-placeholder (a neutral square) takes over — same graceful pattern as the factory floor, but adapted to inline injection rather than `<img>`. Do NOT author anything that breaks `currentColor` inheritance (no literal `color`/`fill`/`stroke` on the root beyond `fill="none"`/`stroke="currentColor"`, no `<style>`, no `class`).

=== RETURN ===
Return all 9 SVGs as separate files at the exact paths above, plus a one-line confirmation that every file passes: viewBox `0 0 24 24`, root `fill="none"`+`stroke="currentColor"`, `stroke-width="1.5"`, currentColor-only (no literal colors), no `<style>`/`class`/`<title>`/`<text>`/raster, < 8 KB, legible silhouette at 18px, arrowheads unified across #7/#8/#9, dots unified across #5/#6.

FILE LIST:
[
  { "path": "website/public/cockpit/icons/lens-ueberblick.svg", "purpose": "Segmented-toggle icon for the calm \"Überblick\" lens — a portfolio of feature/product cards seen from above.", "viewBox": "0 0 24 24", "alt": "Überblick-Ansicht: ruhige Portfolio-Kachelübersicht" },
  { "path": "website/public/cockpit/icons/lens-werkbank.svg", "purpose": "Segmented-toggle icon for the dense \"Werkbank\" lens — hands-on drill-in / tools view.", "viewBox": "0 0 24 24", "alt": "Werkbank-Ansicht: detaillierte Bearbeitung mit Werkzeugen" },
  { "path": "website/public/cockpit/icons/mode-karten.svg", "purpose": "Layout-mode toggle: switch to \"Karten\" (card list) layout.", "viewBox": "0 0 24 24", "alt": "Kartenansicht: Einträge als gestapelte Karten" },
  { "path": "website/public/cockpit/icons/mode-tabelle.svg", "purpose": "Layout-mode toggle: switch to \"Tabelle\" (rows) layout.", "viewBox": "0 0 24 24", "alt": "Tabellenansicht: Einträge als Zeilen" },
  { "path": "website/public/cockpit/icons/drag-handle.svg", "purpose": "Reorder affordance (drag handle) on ticket rows in Werkbank.", "viewBox": "0 0 24 24", "alt": "Ziehgriff zum Umsortieren" },
  { "path": "website/public/cockpit/icons/bulk-select.svg", "purpose": "Multi-select control / checkbox-stack for bulk actions in Werkbank.", "viewBox": "0 0 24 24", "alt": "Mehrfachauswahl: mehrere Einträge markieren" },
  { "path": "website/public/cockpit/icons/reparent.svg", "purpose": "Move a ticket into another Feature/Produkt (reparent) — arrow entering a bracket/container.", "viewBox": "0 0 24 24", "alt": "Ticket einem anderen Feature/Produkt zuordnen" },
  { "path": "website/public/cockpit/icons/enqueue-factory.svg", "purpose": "Send a ticket into the Software-Factory pipeline — arrow entering a cog.", "viewBox": "0 0 24 24", "alt": "An die Software-Factory übergeben" },
  { "path": "website/public/cockpit/icons/drawer-open.svg", "purpose": "Open the right-side detail drawer for a ticket.", "viewBox": "0 0 24 24", "alt": "Detail-Seitenleiste öffnen" }
]
```

## 3) Health- & Status-Glyphen (green/amber/red als Form, Chips, Progress-Ring)

```text
— COPY-PASTE PROMPT FOR CLAUDE DESIGN —

ROLE
You are authoring a small set of production-grade, hand-written SVG status glyphs for an internal admin project-management view ("Projekt-Cockpit"). These glyphs label HEALTH and STATUS on a dark UI. They must be a11y-correct: health/state must be readable by SHAPE alone, never color alone, because they sit inside chips whose background is the only other color signal. Mirror the rigor of an existing in-repo manifest (`website/public/factory/MANIFEST.md`): "monochrom auf transparent, < 8 KB, reines SVG, kein Raster, States per Form trennbar (a11y)".

SCOPE: produce EXACTLY 7 files (the full FILE LIST below). The five progress percentages 0/25/50/75/100 are NOT separate files — they are ONE reusable progress-ring template driven by JS, documented in comments. Do not invent, split, or add any file beyond the 7 listed.

NON-NEGOTIABLE OUTPUT CONTRACT (every file)
- One single `<svg>` element per file. Hand-authored, clean, indented, commented sparingly. No `<image>`, no base64, no embedded raster, no `<foreignObject>`, no external fonts, no `<text>` (draw glyphs as paths/shapes so they render without any font).
- Transparent background — never draw a background rect. The chip/cell behind it provides the surface.
- `viewBox="0 0 16 16"` for all glyphs EXCEPT the progress ring template which is `viewBox="0 0 24 24"`. Do NOT set `width`/`height` attributes on the root `<svg>` — let CSS size it. Add `fill="none"` on the root and set stroke/fill per shape.
- DUAL-BRAND THEMING IS MANDATORY. Drive color from the cascade, not hardcoded brand hex. Default every visible stroke/fill to `currentColor` so the parent text/chip color themes it. Where a glyph genuinely needs a second tone (e.g. a dimmed track behind a progress arc), use ONE CSS-var-overridable color with a sane fallback, e.g. `stroke="var(--cockpit-track, currentColor)"` plus `stroke-opacity="0.22"`. NEVER bake a brand hex (no `oklch(...)`, no `#d77a6e`, no gold/sage literal) as the only color of a shape. The component sets `color:` to the health token:
    • on-track/done  → green  = sage  `oklch(0.80 0.06 160)` / `var(--color-sage)`
    • in-progress    → amber  = brass `oklch(0.80 0.09 75)`  / `var(--color-brass)`
    • blocked/danger → red    = `#d77a6e`  (no brand var; danger tone)
  Because color comes from `currentColor`, the SAME file works on both brands (mentolder Brass+Ink and korczewski Kore/sage) and in any chip — you author the SHAPE, the app paints it.
- a11y: add `role="img"` and an `<title>` (German) as the FIRST child of each `<svg>`; reference it with `aria-labelledby`. Keep `<title>` text exactly as given in the file list below. The decisive requirement: green, amber and red must be distinguishable with color removed (grayscale / colorblind). Bake the meaning into the silhouette.
- Optical sizing: design on a 16×16 grid with a ~1.5–2px visual stroke (use `stroke-width` ~1.6–1.8, `stroke-linecap="round"`, `stroke-linejoin="round"`), centered, ~1.5px safe margin from the edges so it never clips inside a tight chip. Pixel-snap to the grid where it sharpens edges. Keep each file well under 8 KB (these are tiny — aim for < 1.5 KB each).
- Crafted, calm, information-dense aesthetic. AVOID the generic AI-dashboard / clip-art look: no gradients, no drop-shadows, no glow, no rounded "sticker" badges, no emoji-style faces, no 3D. Think precise instrument-panel iconography.

THE SHAPE LANGUAGE (this is the whole point — encode health in the silhouette)
Pick three SILHOUETTES that stay distinct in grayscale and at 16px:
- GREEN / on-track / done  → a CLOSED, COMPLETE form: a full closed ring with a crisp CHECK inside it (closed loop + checkmark = "complete, all good"). The check alone must read even if the ring is faint.
- AMBER / in-progress     → a PARTIAL / IN-MOTION form: a ring drawn as a HALF arc (open at one side) with a single centered dot, OR a half-filled ring (pie at ~50%). The openness of the arc is the signal: clearly NOT a closed loop.
- RED / blocked          → a HALT form: two vertical PAUSE BARS (like a pause button) inside a ring, OR a bold diagonal SLASH (no-entry / prohibition) through a ring. Explicitly DO NOT use a generic warning triangle or an exclamation mark — those read as "caution", we need "stopped/blocked". The bars/slash are unmistakably "halted".
Keep all three on the SAME ring footprint so they line up in a row and only the interior glyph changes — that consistency makes the shape-difference the salient cue.

THE COUNT-CHIP LEADING GLYPHS (chip-done / chip-blocked / chip-open)
These are tiny leading glyphs that sit before a number inside small count chips (e.g. "✓ 12", "▌▌ 3", "○ 5"). They must echo the health language but be even simpler, optically lighter, and left-alignable:
- chip-done    → a lone crisp CHECK (no ring), the "complete" mark.
- chip-blocked → the two PAUSE BARS (no ring), the "halted" mark — same halt language as health-red so the user learns one vocabulary.
- chip-open    → a single hollow/outline CIRCLE (an empty, not-yet-started token) — distinct from done(check) and blocked(bars).
Same 16×16 viewBox, `currentColor`, same stroke weight as the health glyphs so a chip row reads as one typographic family.

THE PROGRESS RING TEMPLATE (progress-ring)
A reusable circular progress ring the component will drive by JS (it overrides `stroke-dasharray`/`stroke-dashoffset` per card). Author it as a clean, neutral template:
- `viewBox="0 0 24 24"`. Two concentric strokes on the SAME circle (cx=12, cy=12, r≈9.5):
    1) a faint TRACK circle: `stroke="var(--cockpit-track, currentColor)"`, `stroke-opacity="0.18"`, full circle.
    2) a PROGRESS arc on top: `stroke="currentColor"`, `stroke-linecap="round"`, drawn starting at 12 o'clock going clockwise. Set `stroke-dasharray` to the circle circumference (2·π·r) and `stroke-dashoffset` so the DEFAULT renders ~50% as a visual guide. Add `transform="rotate(-90 12 12)"` on the progress arc so 0% starts at top.
- Add HTML comments documenting the math so a dev can wire it: circumference C = 2·π·r, and for a fraction p the offset = C·(1−p). Annotate the canonical guidance stops in the comments: 0% (offset=C, arc invisible), 25% (offset=0.75·C), 50% (offset=0.5·C), 75% (offset=0.25·C), 100% (offset=0, full ring). Do NOT draw five separate rings — one template, comments only.
- The template alone (no fill text) must look intentional at any size.

GRACEFUL DEGRADATION
These are served from stable paths under `website/public/cockpit/` so the Svelte component can `onerror`-hide the `<img>` and fall back to a CSS placeholder (the exact pattern the factory floor uses: `<img src="/cockpit/health-green.svg" onerror={assetFallback} …>`). Use EXACTLY the file paths and `<title>` strings in the list below — the component hardcodes them.

DELIVER
Output each file as a separate fenced code block, prefixed by its path comment. Produce all 7 files listed below (no more, no fewer), each meeting the contract above. After the files, give a 2-line note confirming (a) every visible color is `currentColor` or a `var(--…, currentColor)` override (no baked brand hex) and (b) the three health silhouettes survive grayscale.

FILE LIST (path · viewBox · what to draw · German <title>/alt)
1. website/public/cockpit/health-green.svg · 0 0 16 16 · closed full ring with a crisp check inside (complete / on track) · "Gesund — auf Kurs, abgeschlossen"
2. website/public/cockpit/health-amber.svg · 0 0 16 16 · half/open ring arc with a single centered dot (in progress) · "In Arbeit — läuft"
3. website/public/cockpit/health-red.svg · 0 0 16 16 · ring with two vertical pause-bars (blocked / halted) — NOT a warning triangle · "Blockiert — angehalten"
4. website/public/cockpit/chip-done.svg · 0 0 16 16 · lone crisp check, no ring (count chip "erledigt") · "Erledigt"
5. website/public/cockpit/chip-blocked.svg · 0 0 16 16 · two vertical pause-bars, no ring (count chip "blockiert") · "Blockiert"
6. website/public/cockpit/chip-open.svg · 0 0 16 16 · single hollow outline circle (count chip "offen") · "Offen"
7. website/public/cockpit/progress-ring.svg · 0 0 24 24 · two concentric strokes: faint track + clockwise progress arc from 12 o'clock, default ~50%, dasharray/offset driven by JS, math documented in comments · "Fortschritt"

(7 files total. The five progress stops 0/25/50/75/100 are ONE reusable ring driven by JS — documented in comments — not separate assets.)
```

## 4) Dekoratives Header-Backdrop (OPTIONAL, out-of-MVP) — via CSS-Mask

```text
You are authoring ONE production-grade, hand-written SVG decorative asset for an internal admin tool called the **Projekt-Cockpit** (Astro + Svelte islands, dark theme). This is the OPTIONAL header backdrop that sits *behind* the page title on the cockpit's "Überblick" top strip — analogous to a faint blueprint/portfolio backdrop. It must be EXTREMELY SUBTLE: a low-opacity blueprint/portfolio-grid line motif that the eye reads as texture, never as content. The page title and toggles sit on top of it and must remain perfectly legible.

This is LOW PRIORITY / OUT-OF-MVP POLISH. If the file is absent the page must look completely fine — degrade to nothing. Author it so its absence is a non-event and its presence is a whisper.

=== DELIVERABLE ===
A single file: `website/public/cockpit/header-backdrop.svg`

=== ⚠️ CRITICAL THEMING CONSTRAINT — READ FIRST (this is the #1 thing prompts get wrong here) ===
This asset MUST theme to TWO brands (mentolder = brass-gold, korczewski = sage-green) from ONE file. The naive way — `stroke="currentColor"` and hoping the page's `color:` flows in — DOES NOT WORK for the way this component delivers the asset, and you must design around that:

- An SVG loaded via `<img src="...">` or via CSS `background-image: url(...)` is an **isolated replaced element**. It renders in its own context and **cannot inherit** the host document's `color` property OR the host document's CSS custom properties (`var(--cockpit-backdrop-ink)`). A `currentColor`-only SVG delivered that way falls back to the UA default (black) and is invisible on the dark ink background. Do NOT assume `currentColor` inheritance across an `<img>`/`background-image` boundary — it is a hard browser boundary, not a bug to work around.
- Therefore you MUST make the file **self-theming via a CSS mask**, which is the consumption path this component uses for dual-brand backdrops:
  - The host element sets `mask-image: url('/cockpit/header-backdrop.svg'); -webkit-mask-image: url('/cockpit/header-backdrop.svg'); mask-size: cover; mask-position: center; mask-repeat: repeat-x;` and paints itself with `background-color: var(--cockpit-backdrop-ink, currentColor);` plus `opacity: var(--cockpit-backdrop-opacity, 0.07);`. The brand then drives `--cockpit-backdrop-ink` (mentolder → brass `oklch(0.80 0.09 75)`, korczewski → sage `oklch(0.80 0.06 160)`) and ONE asset themes to both.
  - This means: in a mask, only the **alpha channel / luminance** of the SVG matters, NOT its stroke color. So inside the SVG, draw your line-work in a solid OPAQUE color (e.g. `stroke="#fff"` / `stroke="black"` per the mask mode chosen — see below) purely to define the mask shape. The actual brand hue is applied by the host's `background-color`. You are drawing a **stencil**, not a colored picture.
  - Use a LUMINANCE mask convention: set the host's `mask-type: luminance` expectation by drawing strokes in **white (`#fff`)** on the transparent SVG (white = fully revealed, transparent = hidden). Keep the SVG itself free of any brand hex — its only literal colors are the neutral stencil whites/greys that encode opacity, never `oklch(0.80 0.09 75)` or `oklch(0.80 0.06 160)`.
  - Bake the "very faint" look into the **stencil luminance** (use `stroke="#fff"` with low `stroke-opacity`, ~0.5–1.0, and rely on the host's `--cockpit-backdrop-opacity` default of 0.07 for the final whisper) — NOT by trying to inherit opacity tokens the same way as color (same isolation boundary applies). The minor grid should be a lower stencil luminance than the cards.

State this contract explicitly in a comment block at the top of the file so the integrating dev knows it is a mask, not a colored image, and must be consumed via `mask-image` + `background-color`, NOT a bare `<img>`.

=== GRACEFUL DEGRADATION (mask version) ===
Because it is consumed as a CSS mask on a host element, "absent file" degrades naturally: with no mask the host element simply paints nothing visible (give the host `mask-image` only, no `background` of its own beyond the masked paint; if the URL 404s the masked area is empty → nothing renders). The component does not need `<img onerror>` for this asset — note this in the file's comment so nobody wires it as an `<img>` (which would re-break theming).

=== HARD CONSTRAINTS (non-negotiable) ===
1. Output = clean, hand-authored SVG. Exactly ONE `<svg>` root element per file. No `<image>`, no base64, no embedded raster, no external fonts, no `<script>`, no filters (no blur/shadow). An internal `<style>` is allowed ONLY for self-contained rules (e.g. shared stroke attributes); it MUST NOT attempt to read document-level CSS custom properties (those don't cross the mask/img boundary). Pretty-printed, readable, commented sparingly.
2. Transparent background — never paint a full-bleed rect. Transparency IS the "hidden" part of the mask. The cockpit page supplies the dark ink background and the brand paint; this asset is line-work-on-transparency only.
3. Target file size < 8 KB. Favor compact, repeating geometry over hundreds of unique path nodes. Use `<pattern>`, or `<g>` + `<use>` referencing a small tiled module multiple times, to keep node count and bytes low. The grid in particular MUST be a `<pattern>` (two `<pattern>`s: minor 40px, major 160px), not hundreds of hand-placed lines.
4. `viewBox="0 0 1280 220"`. Do NOT set fixed `width`/`height` attributes on the root `<svg>`. Add `preserveAspectRatio="xMidYMid slice"` so it crops gracefully when the strip is wider/narrower/shorter than 1280×220. Design the left and right edges so a horizontal repeat (`mask-repeat: repeat-x`) and a center-crop both look intentional — the grid tiles seamlessly, and no abstract "card" is stranded as a lone half-glyph at either edge (keep the cards inset from the edges; let only the grid + axis lines run to the bleed).
5. Stencil luminance encodes the faintness: hairline strokes ≈0.5–1 user units at this viewBox scale, `stroke-linecap="round"`. Minor grid at the lowest stencil luminance (e.g. `stroke-opacity` ~0.4), major grid slightly higher, the abstract cards and registration lines highest — but ALL still subordinate to the host's 0.07 default opacity. The final composite must never compete with the title text.
6. a11y / robustness: this is purely decorative texture. The host element carries `aria-hidden="true"` / `role="presentation"`. Do NOT include a `<title>` or `<desc>` that an AT could announce — for a masked decorative asset they serve no purpose and risk being read. Because state is NOT encoded here (it's a backdrop, not a status glyph), the "states distinguishable by shape" rule does not apply to THIS file; just ensure it introduces nothing focusable or announceable. (Other cockpit assets — status chips, progress rings — DO carry the shape-not-color-alone rule; this one is exempt because it is texture.)

=== WHAT THE MOTIF SHOULD DEPICT ===
A calm, crafted "blueprint of a portfolio" — an architect's drafting sheet meeting a project board, WITHOUT literal clip-art icons:
- A faint underlying drafting grid: a fine minor grid (≈40 px cells) plus an even fainter—no, slightly stronger—major grid (≈160 px) for the engineering-paper feel. Both via `<pattern>`.
- Over the grid, a sparse arrangement of abstract "portfolio cards": 3–5 rounded rectangles of varying widths suggesting Feature/Produkt cards in a row, drawn as thin OUTLINES ONLY (`fill="none"`), each hinting at internal structure with one or two short horizontal rule lines (a title line + a value-prop line) and a small circle in a corner suggesting a progress ring. Abstractions, NOT real cards — generous spacing, weighted toward the LOWER band so the title sits in cleaner space up top. Keep them inset from both horizontal edges (see edge rule above).
- A couple of long, very faint horizontal "axis"/"registration" lines and a few short tick marks at the left margin, echoing a drafting sheet's measurement rail. Optionally one slim corner registration crosshair in a far corner.
- Composition: weighted to the lower ~60% of the 220-tall band and toward the edges, leaving upper-left/upper-center quiet for the page title (`Projekt-Cockpit`) and the "Überblick / Werkbank" + "Karten / Tabelle" toggles. Asymmetric and intentional — not a centered mandala, not a symmetric flourish.

=== AESTHETIC GUARDRAILS ===
- Calm, precise, draughtsman-like. Faint technical drawing, not decoration.
- Explicitly AVOID the generic AI-dashboard / SaaS-hero / clip-art look: no gradients-as-glow, no neon, no 3D, no isometric cubes, no swooshes, no bar-chart/pie-chart clip art, no rocket/lightbulb/gear icons, no drop shadows, no blur filters.
- Hairline strokes, `stroke-linecap="round"`, consistent corner radii on the rounded rects, rhythm in the spacing. Every line placed, not generated.
- Because color is applied by the host, judge the stencil by how the SHAPE/luminance reads; it must look equally at home once painted brass-on-ink (mentolder) or sage-on-ink (korczewski).

=== REFERENCE PATTERN (mirror its rigor) ===
The sibling asset set at `website/public/factory/MANIFEST.md` defines station/workpiece icons as "monochrom in Gold auf transparent, < 8 KB, reines SVG, kein Raster, States per Form trennbar (a11y)." Mirror that file-size/no-raster/clean-SVG rigor. NOTE the key difference: the factory icons are single-brand baked-in gold consumed via `<img>` (which is exactly why they can't theme). THIS asset is dual-brand and therefore uses the mask approach above instead. Do not copy the factory `<img>` consumption — copy only its craft and constraints.

=== OUTPUT FORMAT ===
Return only the complete SVG source for `website/public/cockpit/header-backdrop.svg`, ready to save, under 8 KB. At the top of the file include:
- a brief comment block stating: this is a CSS-MASK stencil (consume via `mask-image` + `background-color: var(--cockpit-backdrop-ink)`, NOT `<img>`; white stencil = revealed, transparent = hidden; brand hue + ~0.07 opacity applied by host);
- the German alt/description as an HTML comment for the MANIFEST: `<!-- alt: Dezente Blaupausen-Rasterkulisse im Hintergrund der Projekt-Cockpit-Überblicksleiste -->`.
Then, AFTER the SVG, on its own line, repeat the German alt text so it can be copied into the component's MANIFEST:
Dezente Blaupausen-Rasterkulisse im Hintergrund der Projekt-Cockpit-Überblicksleiste

FILE LIST:
[
  {
    "path": "website/public/cockpit/header-backdrop.svg",
    "purpose": "Optional, extremely subtle decorative header backdrop behind the Projekt-Cockpit 'Überblick' top strip (page title + Überblick/Werkbank + Karten/Tabelle toggles). A faint blueprint/portfolio-grid LUMINANCE-MASK stencil: minor (40px) + major (160px) drafting grid as <pattern>s, 3–5 outline-only abstract 'portfolio cards' (each with a title rule, value-prop rule, and a small progress-ring circle) weighted to the lower band, plus faint registration/axis lines and left-margin tick marks. Outline-only, hairline white strokes on transparency (stencil — white reveals, transparent hides). DUAL-BRAND by design: consumed as a CSS mask-image on a host element that paints `background-color: var(--cockpit-backdrop-ink)` (mentolder brass / korczewski sage) at `--cockpit-backdrop-opacity` ~0.07, so ONE file themes to both brands. NOT consumed as <img> and NOT reliant on currentColor inheritance (which does not cross the img/mask boundary). Crops/tiles gracefully (preserveAspectRatio xMidYMid slice, repeat-x seam-safe) and degrades to nothing when absent (no mask = no paint). LOW PRIORITY / out-of-MVP polish.",
    "viewBox": "0 0 1280 220",
    "alt": "Dezente Blaupausen-Rasterkulisse im Hintergrund der Projekt-Cockpit-Überblicksleiste"
  }
]
```

## 5) Ergänzungs-Glyphen (vom Completeness-Kritiker gefunden)

Zwei kleine Lücken im Icon-Set — dieselben Format-/Integrationsregeln wie Set 2:

### `website/public/cockpit/icons/drawer-close.svg`

Mirror of drawer-open.svg: a panel collapsing to the right edge — a vertical bar at the right with a chevron pointing rightward (out of view) plus a small inner content rule fading toward it; viewBox 0 0 24 24, stroke=currentColor hairline, shape-distinct from drawer-open (which points content INWARD); German alt: 'Detail-Bereich schließen'. The open/close pair must be tellable apart by chevron direction alone (a11y, not color).

### `website/public/cockpit/icons/bulk-remove.svg`

Bulk-archive/remove for the selected-rows action bar: a stack of two offset row-rectangles with a single clean diagonal strike-through OR a small open box-with-lid (Archiv) over them — deliberately NOT a trash-can clip-art and NOT a red warning; viewBox 0 0 24 24, stroke=currentColor hairline, transparent bg; reads as a row-batch operation, not a single delete; German alt: 'Ausgewählte Tickets archivieren'. Must share the offset-row-stack vocabulary of bulk-select.svg so the bar reads as one family.


---

## Liefer-Status (PR `feature/cockpit-assets`, T000756)

**Eingespielt (18/23)** — via Claude Design, gegen den Kontrakt oben verifiziert (currentColor, keine Brand-Literale, kein festes width/height, ein `<svg>`-Root, < 1.5 KB je Datei):

- Control-Icons (9): `lens-ueberblick`, `lens-werkbank`, `mode-karten`, `mode-tabelle`, `drag-handle`, `bulk-select`, `reparent`, `enqueue-factory`, `drawer-open` → `icons/`
- Health/Status (6): `health-green/amber/red`, `chip-done/blocked/open`
- `progress-ring.svg` (Template; JS überschreibt `stroke-dasharray`/`-dashoffset` pro Karte)
- `empty/empty-portfolio.svg` (Empty-State 1/4; setzt `style="color:var(--cockpit-fg,#c8ad7a)"` als sichtbaren Fallback statt Schwarz)
- `header-backdrop.svg` (CSS-Mask-Stencil; `<style>`-Luminanzstufen + Contract-Kommentar ergänzt, da im Handoff fehlend; OUT-OF-MVP)

**Brand-Theming-Tokens (P3 auf einem Brand-Vorfahren setzen, lt. Handoff-Readme):**
```css
[data-brand="mentolder"]  { --cockpit-fg:#cdb079; --cockpit-accent:var(--color-gold); }
[data-brand="korczewski"] { --cockpit-fg:#d0d9cf; --cockpit-accent:var(--color-sage); }
```
Icons erben über `color:` des Hosts; Empty-States/progress-ring nutzen zusätzlich `--cockpit-fg`/`--cockpit-accent`.

**Inline-Loader-Hinweis (P3):** `health-*`, `chip-*`, `progress-ring` tragen `<title id="…">` + `aria-labelledby`.
Beim **mehrfachen** Inline-Injizieren (progress-ring = 1×/Karte) entstünden doppelte `id`s → der Loader
muss beim Inlinen `<title>`/`id`/`aria-labelledby` strippen und der Host-Wrapper setzt `role="img"` + `aria-label`.
Die 9 Control-Icons haben bereits kein `<title>`/`id` und brauchen keine Behandlung.

**Noch offen (5)** — über Claude Design nachziehen (Prompts im Manifest):
- 3 Empty-States (`empty/product-no-features`, `empty/feature-no-tickets`, `empty/filter-no-results`) — Prompt 1. Das Design-Bundle spezifizierte alle 4, exportierte aber nur `empty-portfolio.svg`; die übrigen 3 sind nur als `<span data-src=…>`-Platzhalter in der Preview enthalten, nicht als Datei → erneut exportieren.
- `icons/drawer-close.svg`, `icons/bulk-remove.svg` — die 2 Lücken-Seeds (Set 5)

**Nicht eingespielt:** Preview-/Test-HTML aus den Bundles (`icons.card.html`, `_backdrop_test.html`, `_geom_check.html`) — Design-Harness, würde aus `public/` öffentlich ausgeliefert.
