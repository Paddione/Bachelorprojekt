---
title: "Docs-Seite: human-consumable HTML (UX-Politur)"
status: draft
domains: [docs]
ticket_id: T001233
plan_ref: openspec/changes/docs-ux-polish/tasks.md
created: 2026-06-27
---

# Docs-Seite: human-consumable HTML — UX-Politur

## Ziel

Die bestehende, auto-generierte Docs-Seite (`docs.<domain>`, gebaut von
`scripts/build-docs.mjs` + `scripts/docs-gen/`) so verfeinern, dass der
*vorhandene* HTML-Output für Menschen angenehm lesbar und navigierbar wird —
ohne SSG-Rewrite, ohne neuen Content, ohne Änderung der Serving-Kette.

Originalanfrage: „refine automatic docs generation into automatic
html-conversion to create a humanly consumable HTML-docs". Im Brainstorming
(2026-06-27) als **UX-Politur der bestehenden Seite** präzisiert.

## Problem / Ist-Zustand (verifiziert gegen den Code)

Die HTML-Site-Pipeline produziert ~93–225 self-contained HTML-Seiten in einem
dunklen Editorial-Theme, hat aber konkrete Lese-/Navigations-Lücken:

- **Suche:** `search.json` ist ein Array `{slug, title, excerpt}` (389 Einträge,
  ~78 KB; gebaut in `build-docs.mjs` ~L235–238, Excerpt via `excerptFromHtml`
  ~L49–52). Der Client (`theme.mjs` `SEARCH_JS` ~L365–409) macht reinen
  Substring-Match auf Titel/Excerpt — kein Body, kein Ranking, keine
  Tokenisierung.
- **Navigation:** Die Page-Shell (`templates.mjs` `renderPage` ~L276–302) hat
  nur Breadcrumbs. Keine Sidebar, kein Prev/Next. Das TOC (`render-markdown.mjs`
  `buildToc` ~L231–241) erfasst nur **h2** (`addHeadingIds` ~L219 vergibt IDs
  nur an h2); h3 ist weder verankert noch im TOC.
- **A11y/Lesbarkeit:** Vorhanden sind semantische Landmarks, h2-Anchors, Ctrl-K,
  Copy-Buttons, Diagramm-`figcaption`. Es fehlen: Skip-Link, `:focus-visible`,
  ARIA am Such-Overlay, ein WCAG-AA-Kontrast-Audit der Dark-Tokens.

Das CSS ist sauber token-basiert (`theme.mjs` `editorialCss` ~L45–298;
`:root`-Custom-Properties ~L47–60, `--maxw: 760px`), Breakpoint bei 820px.

## Scope

**In Scope** (drei Schnitte):

1. **Volltextsuche** — Bespoke Inverted-Index (zero neue Deps).
2. **Navigation & Orientierung** — sektion-fokussierte Sidebar + Prev/Next +
   h3-TOC.
3. **Lesbarkeit & A11y** — Skip-Link, `:focus-visible`, Such-ARIA, WCAG-AA-
   Kontrast, responsive Sidebar.

**Out of Scope** (explizit):

- Light-Mode / Theme-Toggle.
- JSON-Artefakte als HTML-Dashboards (api-map, repo-index, graph, test-inventory).
- „Seam-Closing" (Kopplung `freshness:regenerate` → `build-docs.mjs`), Auto-Deploy
  generierter Artefakte.
- Publizieren bisher ausgeschlossener Surfaces (`openspec/specs/`,
  `docs/agent-guide/maps/`).
- Neuer Content / inhaltliches De-Stalen (z. B. Keycloak→Pocket-ID *in den Doku-
  Texten* — eigenes Content-Ticket).
- i18n / Englisch (UI bleibt deutsch).

## Constraints (designbestimmend)

- **S1-Ratchet (.mjs-Limit = 500 Zeilen, verifiziert gegen `docs/code-quality/baseline.json`):**
  - `scripts/docs-gen/templates.mjs` = 687 (baselined 687) → **Netto ≤ 0**, ideal
    Richtung 500 schrumpfen.
  - `scripts/docs-gen/theme.mjs` = **498** → **Budget +2 Zeilen**. Such-Client
    (`SEARCH_JS`) und neue A11y/Sidebar-CSS **müssen** in neue Sibling-Module raus;
    `theme.mjs` zieht seine großen String-Konstanten heute inline → diese werden
    extrahiert, sodass `theme.mjs` netto **nicht** wächst.
  - `scripts/docs-gen/render-markdown.mjs` = 387 → Budget +113.
    `scripts/build-docs.mjs` = 380 → Budget +120.
  - Neue Module (`navigation.mjs`, `tokenize.mjs`, `search-client.mjs`, CSS-Split)
    je **< 500**.
  → Navigations- **und** Such-Client-/CSS-Logik gehören in neue Module; weder
    `templates.mjs` noch `theme.mjs` dürfen netto wachsen (Extraktion zuerst).
- **Serving-Kette unangetastet:** static-web-server-Image
  (`scripts/docs.Dockerfile`, `k3d/docs.yaml`), Pocket-ID-OIDC
  (`k3d/oauth2-proxy-docs.yaml`), `docs.<domain>`-Ingress, read-only rootfs. Wir
  ändern nur, was `docs-gen/` an HTML/CSS/JS emittiert.
- **Zero neue Runtime-/Build-Deps:** kein WASM, keine Such-Lib. Tokenizer und
  Index sind eigener Node-Code.
- **CI-Gate:** `.github/workflows/build-docs.yml` triggert auf `docs/**`,
  `scripts/build-docs.mjs`, `scripts/docs-gen/**`; baut + deployt das Image auf
  beide Brands. Smoke-Tests `scripts/docs-gen/*.test.mjs` existieren → erweitern.
- **Reihenfolge/Sektionen aus Vorhandenem:** Sidebar-Tree + Prev/Next werden aus
  dem existierenden `domain`-Feld der Page-Registry + den render-time-Gruppen
  (`DOC_GROUPS` ~L473–495, `CATEGORY_ORDER` ~L69–77, `AGENT_GROUPS` ~L405–415)
  abgeleitet — **kein neues Frontmatter**, keine Quelldatei-Edits.

## Architektur

Ein neues Modul, vier Touchpoints. Quell-Discovery und Serving bleiben identisch.

```
registry/discover  ──►  render-markdown.mjs  (h3-TOC)   ─┐
        │           ──►  navigation.mjs  ★NEU            ─┼─►  templates.mjs (schlanker)  ─►  *.html
        │           ──►  build-docs.mjs  (+Index-Builder) ─┘                                     ▲
        └──────────────────────────────────────────────────►  search-index.json ★NEU           │
                                  theme.mjs  (CSS · Such-Client · A11y ★) ───────────────────────┘
```

### Modul: `scripts/docs-gen/navigation.mjs` (neu)

Reine, seiteneffektfreie Funktion mit klarem Interface — unabhängig testbar:

```
buildNavModel(pages) -> {
  sections: [{ key, label, pages: [{slug,title}], }],  // geordnet
  order:    [slug, ...],                                 // global, deterministisch
  prevNext: { [slug]: { prev?: {slug,title}, next?: {slug,title} } },
  sectionOf:{ [slug]: sectionKey },
}
```

- Sektion-Zuordnung: zuerst über die existierenden render-time-Gruppen
  (Docs/Skills/Agents), darunter `domain`. Seiten ohne Gruppe → Fallback-Bucket
  „Sonstige" (alphabetisch). Innerhalb jeder Sektion alphabetisch nach Titel
  (heutiges Verhalten beibehalten).
- `order` = Sektionen in kanonischer Reihenfolge, Seiten je Sektion sortiert →
  daraus deterministisch `prevNext`.
- `templates.mjs` konsumiert `buildNavModel` und rendert Sidebar (sektion-
  fokussiert) + Prev/Next. Die heutige Gruppierungs-Logik wandert nach
  `navigation.mjs`, sodass `templates.mjs` **netto schrumpft** (S1).

### Such-Index-Builder (in `build-docs.mjs` + Tokenizer-Modul)

- Neuer build-time-Schritt: über `bodyMarkdown` jeder Page einen **umlaut-aware
  Tokenizer** (eigenes kleines Modul, z. B. `scripts/docs-gen/tokenize.mjs`)
  laufen lassen; Inverted-Index `token -> [{slug, headingId, weight}]` bauen.
- Trimming: Min-Tokenlänge, Dedup, optional Stopword-Liste; Titel/Heading-Tokens
  höher gewichtet. **Akzeptanz: `search-index.json` ≤ 2 MB.** Falls überschritten:
  Postings + separater Snippet-Store on-demand statt Volltext inline.
- Schema `search-index.json`:
  ```
  { pages: [{slug,title,sectionPath}], index: { token: [postings] }, snippets?: {...} }
  ```

## Feature A — Volltextsuche

- **Build:** Tokenizer + Inverted-Index wie oben.
- **Client (`theme.mjs` `SEARCH_JS` neu):** ranked Lookup (Titel/Heading-Boost,
  Term-Frequenz), Ergebnis-Snippet mit `<mark>`-Highlight, Klick springt zum
  Heading-Anchor (`#<headingId>`). Ctrl/⌘-K bleibt. Leerer Query: Top-Seiten wie
  heute.
- **A11y:** Overlay `role="dialog"`, Input `role="searchbox"`/`type="search"`,
  Ergebnisliste `role="listbox"` + `aria-live="polite"`, Treffer `role="option"`.
- **Wo:** `build-docs.mjs` (Index-Builder), neues `tokenize.mjs`, neues
  `search-client.mjs` (ranked Lookup + Snippet + ARIA — ausgelagert aus `theme.mjs`,
  das bei 498/500 keinen Platz hat). `theme.mjs` referenziert/inlined das neue Modul
  und **ersetzt** die alte `SEARCH_JS`-Konstante (netto-neutral). Such-Styles als
  neuer CSS-Baustein (siehe Feature C).

## Feature B — Navigation & Orientierung

- **Sidebar (sektion-fokussiert):** nur die aktuelle Sektion aufgeklappt, andere
  Sektionen als kollabierte Top-Level-Einträge (vermeidet die ~389-Einträge-
  Wand). Aktuelle Seite hervorgehoben. Mobil (<820px) kollabiert die Sidebar in
  ein Disclosure/Burger.
- **Prev/Next:** am Seitenende, aus `prevNext` (deterministische globale Order).
- **TOC h3:** `render-markdown.mjs` `addHeadingIds` + `buildToc` auf h3 erweitern
  (verschachtelt, h3 bekommt Anchor-IDs). Slug-Logik (`slugifyHeading`, umlaut-
  safe) wiederverwenden.
- **Breadcrumbs:** unverändert.
- **Wo:** neues `navigation.mjs`; `templates.mjs` `renderPage` (Sidebar +
  Prev/Next, Gruppierungs-Logik ausgelagert → netto-Schrumpfung);
  `render-markdown.mjs` `buildToc`/`addHeadingIds`; `theme.mjs` (Sidebar/TOC-
  Styles, Mobile-Disclosure).

## Feature C — Lesbarkeit & A11y

- **Skip-Link** `<a class="skip" href="#main">Zum Inhalt springen</a>` als erstes
  Element im Body (`templates.mjs`), sichtbar bei `:focus`.
- **`:focus-visible`** Fokusring (Gold-Token) für alle interaktiven Elemente
  (`theme.mjs` `editorialCss`).
- **Such-ARIA:** siehe Feature A.
- **WCAG-AA-Kontrast-Audit** der Dark-Tokens — insb. `--muted`/`--faint` gegen
  `--paper`; betroffene Tokens auf ≥ 4.5:1 (Text) bzw. ≥ 3:1 (großer Text)
  anheben. Gleicher Maßstab wie der gerade gemergte Footer-Fix (T001206), der nur
  die *Website* betraf, nicht `theme.mjs`.
- **Responsive/Motion:** Sidebar kollabiert <820px; `prefers-reduced-motion`
  respektiert (keine erzwungenen Transitions).
- **Wo:** A11y-CSS (Skip-Link, `:focus-visible`, Kontrast-Token-Tweaks,
  Mobile-Sidebar) als **neuer CSS-Baustein** (Sibling-Modul, da `theme.mjs` bei
  498/500); `theme.mjs` komponiert die Bausteine netto-neutral. `templates.mjs`-Shell
  (Skip-Link-Markup, `role`-Attribute an `nav`/`aside`) — innerhalb der Netto-≤0-
  Schranke durch Auslagerung der Gruppierungslogik nach `navigation.mjs`.

## Modulgrenzen & Interfaces

- `navigation.mjs` — pure `buildNavModel(pages)`, kennt nur die Registry-Form,
  emittiert kein HTML (Rendering bleibt in `templates.mjs`). Unabhängig testbar.
- `tokenize.mjs` — pure `tokenize(text) -> string[]` (umlaut-aware, lowercased,
  min-length). Geteilt zwischen Index-Build und (optional) Client-Query-Normal.
- Keine Import-Zyklen: `templates.mjs` → `navigation.mjs`; `build-docs.mjs` →
  `tokenize.mjs`. Helfer als reine Module ohne Rückwärts-Import (S2).

## Test-Strategie

Erweiterung der bestehenden `scripts/docs-gen/*.test.mjs` (Node test runner) +
ggf. `tests/spec/<spec>.bats` falls eine SSOT-Spec passt:

- `navigation.test.mjs` (neu): `buildNavModel` baut Sektionen; jede Seite genau
  einer Sektion zugeordnet; `prevNext` ist konsistent (a.next.slug ⇒
  b.prev.slug == a); Fallback-Bucket greift für gruppenlose Seiten.
- `tokenize.test.mjs` (neu): Umlaute korrekt (`Schlüssel` → Token mit
  `schluessel`/`schlussel`-Normalisierung wie `slugifyHeading`), Min-Length,
  Punctuation-Strip.
- Such-Index-Smoke (in `build-smoke.test.mjs`): `search-index.json` existiert,
  enthält Body-Tokens (nicht nur Titel), Größe ≤ 2 MB.
- TOC-Smoke: gerenderte Seite mit h3 enthält h3-Anchor-IDs und h3-TOC-Einträge.

## Risiken & Failure-Modes

| Risiko | Gegenmaßnahme |
|---|---|
| Index zu groß (naiv 5–15 MB) | Stopwords + Min-Length + Dedup + Cap/Seite; Hard-Acceptance ≤ 2 MB; sonst Postings+Snippet-Store |
| `templates.mjs` reißt S1 | Nav **und** Gruppierungs-Logik auslagern → `templates.mjs` schrumpft; `wc -l` vorher/nachher im Verify-Task |
| Gruppenlose Seiten | Fallback-Bucket „Sonstige" alphabetisch; Prev/Next bleibt deterministisch |
| Diagramm-Fallback-Regression | Keine Änderung an Mermaid/Graphviz-Pfad; nur additive Styles |
| Kontrast-Tweak bricht Theme-Look | Nur Token-Werte minimal anheben, visuell gegen Bestand prüfen |

## Akzeptanzkriterien

- [ ] Volltextsuche liefert Body-Treffer mit Ranking + `<mark>`-Snippet, springt
      zum Heading; `search-index.json` ≤ 2 MB.
- [ ] Sektion-fokussierte Sidebar + Prev/Next auf jeder Content-Seite; aktuelle
      Seite hervorgehoben; mobil kollabierbar.
- [ ] TOC enthält h3 (mit Anchor-IDs).
- [ ] Skip-Link, `:focus-visible`, Such-ARIA vorhanden; Dark-Token-Kontrast
      WCAG-AA.
- [ ] `scripts/docs-gen/templates.mjs` ist **nicht** über seinem S1-Baseline-Wert
      (netto ≤ 687); `scripts/docs-gen/theme.mjs` ≤ 500 Zeilen (Konstanten
      ausgelagert); **kein** docs-gen-Modul reißt das .mjs-500-Limit.
- [ ] Neue/erweiterte `docs-gen`-Tests grün; `task test:changed` +
      `task freshness:regenerate` + `task freshness:check` grün.
- [ ] Zero neue Runtime-/Build-Deps in `package.json`.

## Offene Fragen

Keine — Scope, Such-Engine (Bespoke Inverted-Index) und Sidebar-Umfang
(sektion-fokussiert) sind im Brainstorming (2026-06-27) entschieden.
