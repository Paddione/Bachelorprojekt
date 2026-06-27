---
title: "docs-ux-polish — UX-Politur der Docs-Seite"
ticket_id: T001233
domains: [docs]
status: implemented
---

# docs-ux-polish — Implementation Plan

OpenSpec-Tasks für Change `docs-ux-polish`. UX-Politur der bestehenden `docs-gen`-HTML-Pipeline (Ticket T001233). Drei Schnitte:
A) Volltextsuche (Bespoke Inverted-Index), B) Navigation (Sidebar + Prev/Next + h3-TOC),
C) Lesbarkeit/A11y. **Extraktionen zuerst**, damit `templates.mjs` (687, baselined → Budget 0)
und `theme.mjs` (498, nicht baselined → Limit 500, Budget +2) durch die Additions **nicht** netto
wachsen. Zero neue Runtime-/Build-Deps; Serving-Kette unangetastet; neue Module sind reine,
zyklusfreie, importierte Module < 500 Zeilen.

S1-Schwellen (verifiziert, `wc -l` Vorher-Stand):
- `scripts/docs-gen/templates.mjs` = 687 · baseline 687 → **Budget 0** (netto ≤ 0, ideal schrumpfen).
- `scripts/docs-gen/theme.mjs` = 498 · nicht baselined → Limit 500 → **Budget +2** (Extraktion erzwingen).
- `scripts/docs-gen/render-markdown.mjs` = 387 · nicht baselined → Limit 500 → **Budget +113**.
- `scripts/build-docs.mjs` = 380 · nicht baselined → Limit 500 → **Budget +120**.
- Neue Module (`tokenize.mjs`, `navigation.mjs`, `search-client.mjs`, CSS-Split) je **< 500**.

**Headroom-Reconciliation `templates.mjs` (kumulativ, nicht unabhängig):** Die Extraktion in
1.2 ist die **einzige** Quelle freier Zeilen, gegen die **drei** spätere Additionen (2.3 Such-ARIA,
3.2 Sidebar+Prev/Next — die größte, 4.1 Skip-Link) **kumulativ** laufen. Darum gilt ein laufendes
Budget statt drei unabhängiger „durch 1.2 gedeckt"-Behauptungen:
1. Nach 1.2 den Ist-Stand per `wc -l scripts/docs-gen/templates.mjs` **festhalten** (Checkpoint).
   **Ziel-Checkpoint: ≤ 635** (≥ 52 Zeilen netto raus — `CATEGORY_ORDER`+`AGENT_GROUPS`+`DOC_GROUPS`
   + Bucket-Zuordnung minus Import-Zeilen).
2. Die Additionen aus 2.3 + 3.2 + 4.1 müssen `templates.mjs` **kollektiv** beim oder unter dem
   Post-1.2-Checkpoint halten (Arbeits-Decke = Checkpoint, harte Decke = 687). Vor jeder dieser
   Additionen `wc -l` prüfen.
3. Reicht der Headroom für die Sidebar (3.2) nicht, wird ihr Markup-Builder als **reiner,
   string-zurückgebender** Helfer aus dem Nav-Model ausgelagert (siehe 3.2), sodass `templates.mjs`
   nur eine Aufrufstelle gewinnt — die Seiten-Komposition bleibt in `templates.mjs`.

---

## File Structure

Neue Module (rein, importiert, je < 500 Zeilen):
- `scripts/docs-gen/tokenize.mjs` — `foldGerman()` + `tokenize()` (Umlaut-Faltung, einzige Quelle)
- `scripts/docs-gen/navigation.mjs` — `buildNavModel(pages)` (Sektion-Tree, Order, Prev/Next) + reine Markup-Helfer
- `scripts/docs-gen/search-client.mjs` — ranked Client-Such-JS (aus `theme.mjs` extrahiert)
- `scripts/docs-gen/styles-ux.mjs` — CSS-Bausteine `navCss()`/`searchCss()`/`a11yCss()`
- `scripts/docs-gen/tokenize.test.mjs`, `scripts/docs-gen/navigation.test.mjs` — Co-Tests (neu)

Geänderte Dateien (netto-budgetiert, siehe S1-Schwellen):
- `scripts/docs-gen/templates.mjs` (687 → schrumpft) · `scripts/docs-gen/theme.mjs` (498 → ≤ 500)
- `scripts/docs-gen/render-markdown.mjs` (h3-TOC) · `scripts/build-docs.mjs` (Index-Builder)
- `scripts/docs-gen/build-smoke.test.mjs`, `scripts/docs-gen/render-markdown.test.mjs` (Smoke-Erweiterungen)

Neues Build-Artefakt: `search-index.json` (≤ 2 MB). Serving-Kette (Image, OIDC, Ingress) unverändert.

---

## Phase 1 — Extraktionen & reine Helfer-Module (Headroom schaffen, locked Files schrumpfen)

- [x] 1.1 Neues reines Tokenizer-Modul `scripts/docs-gen/tokenize.mjs` mit zwei Exports: `foldGerman(text) -> string` (lowercase + ä→ae/ö→oe/ü→ue/ß→ss — die **einzige** Quelle der Umlaut-/Eszett-Faltung) und `tokenize(text) -> string[]` (nutzt `foldGerman`, dann Punctuation-Strip + Min-Length). **`render-markdown.mjs` `slugifyHeading` (L54) wird refaktoriert**, sodass es `foldGerman` aus `tokenize.mjs` importiert und wiederverwendet (statt die Faltung erneut zu implementieren) — Query-Folding (tokenize) und Heading-Anchor-Folding (slugify, das die `headingId` der Postings liefert) teilen damit **eine** byte-konsistente Faltung. + Co-Test.
  - target_files: `scripts/docs-gen/tokenize.mjs` (neu), `scripts/docs-gen/tokenize.test.mjs` (neu), `scripts/docs-gen/render-markdown.mjs` (`slugifyHeading` reuse, zeilenneutral)
  - S1-budget: neues Modul, Ziel < 120 Zeilen (Reserve unter Limit 500); Test importiert das Modul → **nicht orphan** (S4 erfüllt via `test:docs-gen`); `render-markdown.mjs` netto neutral (Inline-Faltung ↔ Import).
  - tdd (red→green): Co-Test `tokenize.test.mjs` **zuerst** schreiben und ausführen — expected: FAIL (rot, Modul existiert noch nicht) — dann `tokenize.mjs` implementieren, bis der Test grün ist. Gleiches red→green-Vorgehen für `navigation.test.mjs`/`navigation.mjs` (1.2).
  - accept: `node --test scripts/docs-gen/tokenize.test.mjs` grün; Cases `Schlüssel`→enthält `schluessel`-normalisiert, Punctuation entfernt, Tokens < Min-Length verworfen; **`tokenize` und `slugifyHeading` rufen denselben `foldGerman`** (kein dupliziertes ä→ae-Regex; `render-markdown.test.mjs` weiter grün); Import-Richtung `render-markdown.mjs → tokenize.mjs` (Leaf, kein Zyklus, S2).

- [x] 1.2 Neues Modul `scripts/docs-gen/navigation.mjs` mit reiner `buildNavModel(pages)` durch **Verschieben** der render-time-Gruppierungslogik aus `templates.mjs` (`CATEGORY_ORDER` L69, `AGENT_GROUPS` L405, `DOC_GROUPS` L473 + Bucket-Zuordnung). `navigation.mjs` wird die **einzige Quelle** dieser Gruppendefinitionen, keyed by page type (skills→`CATEGORY_ORDER`/`categoryForSkill`, agents→`AGENT_GROUPS`, docs→`DOC_GROUPS`). Sowohl die spätere Sidebar (3.2) **als auch** die bestehenden Index-Renderer (`renderSkillsIndex` L356, `renderAgentsIndex` L424, `renderDocsIndex` L521) konsumieren `buildNavModel().sectionOf`/`.sections` statt Sektions-Mitgliedschaft erneut abzuleiten — **ein** Klassifikator, damit Sidebar und Index-Seiten nicht divergieren. `templates.mjs` importiert die Gruppen aus `navigation.mjs` statt sie zu definieren. + Co-Test.
  - target_files: `scripts/docs-gen/navigation.mjs` (neu), `scripts/docs-gen/templates.mjs` (schrumpft, Index-Renderer auf `sectionOf` umgestellt), `scripts/docs-gen/navigation.test.mjs` (neu)
  - S1-budget: `templates.mjs` 687/687 → **muss netto SCHRUMPFEN**; **Checkpoint-Ziel ≤ 635** (`wc -l` festhalten — dieser Wert ist die Arbeits-Decke für die kumulativen Additionen aus 2.3+3.2+4.1, siehe Headroom-Reconciliation oben); `navigation.mjs` neu < 250.
  - accept: `buildNavModel` liefert `{sections, order, prevNext, sectionOf}`; jede Page genau einer Sektion (Fallback-Bucket „Sonstige" alphabetisch für gruppenlose Seiten); Index-Renderer liefern dieselbe Mitgliedschaft wie `sectionOf` (kein zweiter Klassifikationspfad); `prevNext`-Konsistenz (`a.next.slug==b.slug ⇒ b.prev.slug==a.slug`); `order` deterministisch; bestehende `templates.test.mjs` grün; `wc -l scripts/docs-gen/templates.mjs` ≤ 635 (festgehaltener Checkpoint) und < 687.

- [x] 1.3 Such-Client aus `theme.mjs` extrahieren: neues `scripts/docs-gen/search-client.mjs` exportiert die (zunächst verhaltensgleich übernommene) Such-Client-JS-Konstante; `theme.mjs` entfernt die inline `SEARCH_JS` (L365-409), importiert sie aus dem neuen Modul und nutzt sie weiter in `clientJs()` (L496-497).
  - target_files: `scripts/docs-gen/search-client.mjs` (neu), `scripts/docs-gen/theme.mjs` (schrumpft ~ -44)
  - S1-budget: `theme.mjs` 498 → nach Extraktion deutlich < 498 (Headroom für Feature-A/C-CSS); `search-client.mjs` neu < 200.
  - accept: `clientJs()`-Ausgabe enthält weiterhin den Such-Client; `theme.test.mjs` grün; `wc -l scripts/docs-gen/theme.mjs` < 498; kein Import-Zyklus (`theme.mjs` → `search-client.mjs`, keine Rückkante).

- [x] 1.4 CSS-Split: neues `scripts/docs-gen/styles-ux.mjs` exportiert CSS-Bausteine (`navCss()`, `searchCss()`, `a11yCss()` — zunächst leer/Platzhalter, gefüllt in Phasen 2-4); `theme.mjs` `editorialCss()` (L45) konkateniert diese Bausteine, sodass neue Styles dort statt inline landen. Optional einen vorhandenen großen CSS-Block (z. B. Such-Trigger/Overlay-Regeln ~L207-224) mit verschieben, um `theme.mjs` ≤ 500 mit Reserve zu halten.
  - target_files: `scripts/docs-gen/styles-ux.mjs` (neu), `scripts/docs-gen/theme.mjs` (netto-neutral/schrumpft)
  - S1-budget: `theme.mjs` bleibt < 500 (ideal < 480 nach 1.3+1.4); `styles-ux.mjs` neu < 250.
  - accept: `editorialCss()`-Ausgabe in diesem Task **byte-äquivalent** zum Vorher-Stand (nur Verschiebung, kein visueller Diff); `theme.test.mjs` grün; `wc -l scripts/docs-gen/theme.mjs` ≤ 500; `styles-ux.mjs` von `theme.mjs` importiert (S4).

## Phase 2 — Feature A: Volltextsuche

- [x] 2.1 Build-time Inverted-Index in `build-docs.mjs` (**nur Bauen/Emittieren des Artefakts — der Client-Fetch-Cutover gehört allein zu 2.2**): über `page.bodyMarkdown` jeder Page mit `tokenize.mjs` Postings `token -> [{slug, headingId, weight}]` bauen (Titel/Heading-Tokens höher gewichtet, Stopword/Min-Length/Dedup/Cap je Seite), als neues Artefakt `search-index.json` emittieren. Das `sectionPath`-Feld pro Page stammt aus `buildNavModel(pages).sectionOf` (`build-docs.mjs` importiert dazu **`navigation.mjs`** zusätzlich zu `tokenize.mjs`) — Such-Index und Sidebar teilen damit **dasselbe** Sektionsmodell, kein zweiter Klassifikationspfad. `search.json`-Inkremental-Pfad bleibt unberührt (out of scope).
  - **Limitation (explizit dokumentieren):** `search-index.json` wird **nur im Full-Build** geschrieben. Der Einzelseiten-Fast-Path (`rebuildPage` ~L261-315 → `refreshSearchIndexFromOutDir` ~L301) aktualisiert weiterhin nur das alte `search.json`, **nicht** `search-index.json`. Nach einem inkrementellen `rebuildPage` ist `search-index.json` daher veraltet — die neue Such-Experience erfordert einen Full-Build (im Task-Kommentar/PR-Body vermerken, damit Watch-Mode-Nutzer keine stale Treffer für ein Mysterium halten). Kein Re-Emit im Fast-Path in diesem Schnitt.
  - target_files: `scripts/build-docs.mjs` (importiert `tokenize.mjs` **und** `navigation.mjs`), neues Output-Artefakt `search-index.json`
  - S1-budget: `build-docs.mjs` 380/Limit 500 → **Budget +120**; Index-Builder ~ +50 Zeilen, Ziel ≤ 440.
  - accept: `search-index.json` wird im Full-Build geschrieben, Schema `{pages:[{slug,title,sectionPath}], index:{token:[postings]}}` mit `sectionPath` aus `buildNavModel().sectionOf`; enthält **Body**-Tokens (nicht nur Titel); `tokenize.mjs` **und** `navigation.mjs` importiert (nicht orphan); Hard-Acceptance **Dateigröße ≤ 2 MB** (im Smoke geprüft, Task 5.1); 2.1 fasst `search-client.mjs` **nicht** an (Fetch-Cutover = 2.2).

- [x] 2.2 Ranked Lookup im `search-client.mjs` (aus 1.3) — **alleiniger Owner des Client-Fetch-Cutovers**: stellt den Such-Client von `search.json` auf `search-index.json` um (einzige Stelle, die die Fetch-URL/das Konsum-Schema ändert) und implementiert Term-Frequenz + Titel/Heading-Boost, Ergebnis-Snippet mit `<mark>`-Highlight, Klick springt zum Heading-Anchor (`#<headingId>`); Ctrl/⌘-K bleibt; leerer Query → Top-Seiten wie heute.
  - target_files: `scripts/docs-gen/search-client.mjs`
  - S1-budget: `search-client.mjs` < 300 (Reserve unter 500).
  - accept: Client rankt nach Score (Body-Treffer erscheinen), rendert `<mark>`-Snippet, Treffer-`href` enthält `#<headingId>`; keine neuen Deps; reiner Browser-JS-String.

- [x] 2.3 Such-Overlay-ARIA im Shell-Markup `templates.mjs` `renderPage` (L276) bzw. zentralem Overlay-Markup: Overlay `role="dialog"` + `aria-modal`, Input `type="search"`/`role="searchbox"`, Ergebnisliste `role="listbox"` + `aria-live="polite"`, Treffer `role="option"`.
  - target_files: `scripts/docs-gen/templates.mjs`
  - S1-budget: kleine Addition; zählt zum **kumulativen** templates.mjs-Budget (2.3+3.2+4.1 zusammen ≤ Post-1.2-Checkpoint ≤ 635, hart < 687) — vor der Addition `wc -l` prüfen.
  - accept: gerendertes Overlay trägt die genannten `role`/`aria-*`-Attribute; `templates.test.mjs` grün.

- [x] 2.4 Such-Styles (`<mark>`-Highlight, Ergebnis-Snippet-Layout) in `styles-ux.mjs` `searchCss()` füllen.
  - target_files: `scripts/docs-gen/styles-ux.mjs`
  - S1-budget: `styles-ux.mjs` < 250.
  - accept: `editorialCss()`-Ausgabe enthält `.search-result mark`/Snippet-Regeln; `theme.mjs` weiterhin ≤ 500.

## Phase 3 — Feature B: Navigation & Orientierung

- [x] 3.1 h3-TOC in `render-markdown.mjs`: `addHeadingIds` (L217, heute nur h2) **und** `buildToc` (L231, heute nur h2) auf h3 erweitern (verschachtelt, h3 bekommt Anchor-IDs via vorhandener umlaut-safer `slugifyHeading` L54); `renderMarkdown` (L331) sammelt h2 **und** h3 mit.
  - **Interface-Pin (Vertrag explizit neu festlegen):** `buildToc` kann nicht länger ein flaches `string[]` (nur h2-Texte) entgegennehmen — die **neue Signatur ist `buildToc(headings: Array<{level: 2|3, text: string}>)`** (Dokumentreihenfolge), die verschachteltes Markup erzeugt. Entsprechend wird `RenderResult.headings` (heute `@property {string[]} headings — h2 text` L46) zur **reicheren Struktur `Array<{level: 2|3, text}>`**; der `@property`-Doc-Block L46 **muss** auf diese Form aktualisiert werden, damit alle Consumer **einen** Vertrag sehen (kein stilles Ändern der h2-only-Zusage). Falls ein bestehender Consumer das alte flache `string[]` braucht, im selben Task auf die neue Form anpassen.
  - target_files: `scripts/docs-gen/render-markdown.mjs`
  - S1-budget: `render-markdown.mjs` 387/Limit 500 → **Budget +113**; Erweiterung ~ +30, Ziel ≤ 420.
  - accept: gerenderte Seite mit h3 trägt h3-`id`s und verschachtelte h3-TOC-Einträge; `buildToc` nimmt `{level,text}[]`; `RenderResult.headings` + L46-`@property` dokumentieren die `{level,text}[]`-Form konsistent; bestehende h2-Tests in `render-markdown.test.mjs` weiterhin grün (ggf. an die neue Signatur angepasst).

- [x] 3.2 Sidebar + Prev/Next in `templates.mjs` `renderPage` (**größte `templates.mjs`-Addition — gegen die Arbeits-Decke aus 1.2 prüfen**): `buildNavModel` (aus `navigation.mjs`) konsumieren — sektion-fokussierte `<aside>`-Sidebar (nur aktuelle Sektion aufgeklappt, andere kollabiert; aktuelle Seite hervorgehoben), Prev/Next am Seitenende aus `prevNext`. `build-docs.mjs` reicht das Nav-Model an `renderPage` durch.
  - **Headroom-Guard:** Vor dieser Addition `wc -l scripts/docs-gen/templates.mjs` prüfen; zusammen mit 2.3+4.1 muss der Endwert beim/unter dem Post-1.2-Checkpoint (≤ 635) bleiben, hart < 687. **Reicht das nicht**, den Sidebar-/Prev-Next-Markup-Builder als **reine, string-zurückgebende** Helfer (`renderSidebar(navModel, currentSlug)` / `renderPrevNext(navModel, currentSlug)`) neben das Nav-Model auslagern (in `navigation.mjs` als seiteneffektfreie, vom Model abgeleitete String-Helfer — relaxiert die „navigation emittiert kein HTML"-Designnotiz auf reine Model→String-Fragmente), sodass `templates.mjs` nur die **Aufrufstellen** gewinnt; die Seiten-Komposition bleibt in `renderPage`.
  - target_files: `scripts/docs-gen/templates.mjs`, `scripts/build-docs.mjs`, `scripts/docs-gen/navigation.mjs` (`prevNext` + optional reine Markup-Helfer)
  - S1-budget: `templates.mjs` ≤ Post-1.2-Checkpoint (≤ 635) inkl. 2.3+4.1, hart < 687; `build-docs.mjs` < 460; etwaige Markup-Helfer in `navigation.mjs` < 250-Gesamtbudget des Moduls.
  - accept: gerenderte Content-Seite enthält `<aside>`-Sidebar mit aktueller Sektion + markierter aktueller Seite und deterministische Prev/Next-Links; `<aside>`/`<nav>` mit passenden `role`/`aria-label`; `templates.test.mjs` grün; `wc -l scripts/docs-gen/templates.mjs` ≤ Checkpoint.

- [x] 3.3 Sidebar-/TOC-/Prev-Next-/Mobile-Disclosure-Styles in `styles-ux.mjs` `navCss()`: Layout neben `--maxw`-Spalte, `<820px`-Kollaps in Disclosure/Burger.
  - target_files: `scripts/docs-gen/styles-ux.mjs`
  - S1-budget: `styles-ux.mjs` < 350.
  - accept: `editorialCss()`-Ausgabe enthält Sidebar-Regeln + `@media (max-width:820px)`-Kollaps; `theme.mjs` ≤ 500.

## Phase 4 — Feature C: Lesbarkeit & A11y

- [x] 4.1 Skip-Link `<a class="skip" href="#main">Zum Inhalt springen</a>` als erstes Body-Element in `templates.mjs` `renderPage` (vor `#app`).
  - target_files: `scripts/docs-gen/templates.mjs`
  - S1-budget: ~1 Zeile; zählt zum **kumulativen** templates.mjs-Budget (2.3+3.2+4.1 zusammen ≤ Post-1.2-Checkpoint ≤ 635, hart < 687) — vor der Addition `wc -l` prüfen.
  - accept: gerenderte Seite hat Skip-Link als erstes Body-Element mit `href="#main"`; `templates.test.mjs` grün.

- [x] 4.2 A11y-CSS in `styles-ux.mjs` `a11yCss()` + `theme.mjs` `:root`-Token-Tweaks (L47-60): `:focus-visible`-Fokusring (Gold/Accent-Token) für alle interaktiven Elemente; Skip-Link sichtbar bei `:focus`; **WCAG-AA-Kontrast** der Dark-Tokens (`--muted`/`--faint`/`--ink-mute` gegen `--paper`/`--paper-2`) auf ≥ 4.5:1 (Text) bzw. ≥ 3:1 (großer Text) anheben; `prefers-reduced-motion` respektieren.
  - target_files: `scripts/docs-gen/styles-ux.mjs`, `scripts/docs-gen/theme.mjs` (`:root`-Tokenwerte, zeilenneutral)
  - S1-budget: `theme.mjs` ≤ 500 (nur Tokenwerte geändert, keine neuen Zeilen); `styles-ux.mjs` < 400.
  - accept: `editorialCss()` enthält `:focus-visible`-Regel + `@media (prefers-reduced-motion)`; Skip-Link `:focus`-sichtbar; geänderte Token-Kontrastwerte dokumentiert ≥ 4.5:1 (Rechnung im PR-Body/Kommentar).

## Phase 5 — Tests & Verifikation

- [x] 5.1 Smoke-Tests in **bestehenden** Test-Dateien erweitern (keine neuen Dateien außer den Co-Tests aus 1.1/1.2): in `scripts/docs-gen/build-smoke.test.mjs` einen Such-Index-Smoke (`search-index.json` existiert, enthält Body-Tokens, **Größe ≤ 2 MB**); in `scripts/docs-gen/render-markdown.test.mjs` einen h3-TOC-Smoke (Seite mit h3 → h3-Anchor-IDs + h3-TOC-Einträge).
  - target_files: `scripts/docs-gen/build-smoke.test.mjs`, `scripts/docs-gen/render-markdown.test.mjs`
  - S1-budget: Test-Dateien (keine .mjs-Prod-Limits relevant, aber < 500 halten).
  - accept: `node --test scripts/docs-gen/*.test.mjs` grün inkl. der neuen Smokes; `search-index.json`-Größenassertion ≤ 2 MB scheitert nicht.

- [x] 5.2 **Finaler Verifikations-Task** (Reihenfolge einhalten, alle grün vor Commit):
  - `task test:changed` — gezielte Tests für geänderte Domains (docs-gen Node-Tests + quality).
  - `task freshness:regenerate` — generierte Artefakte aktualisieren.
  - `task freshness:check` — CI-Äquivalent: Freshness + `quality:check` (S1-S4-Ratchet) + Baseline-Key-Count-Assertion.
  - `task test:inventory` — Test-Inventar neu generieren (Tests wurden geändert) **und** `website/src/data/test-inventory.json` mitcommitten.
  - `bash scripts/openspec.sh validate 2>&1` — zeigt **KEINE `docs-ux-polish`-FAIL-Zeile** (dieser Change validiert: `## ADDED Requirements`-Header, ≥ 1 `### Requirement:` H3, `.ticket` → T001233). Das Skript hat **keinen** Per-Change-Filter und ist all-or-nothing; ein global grünes `validate` (rc=0) hängt von ~8 **unverwandten**, vorbestehenden Change-Dirs ohne `specs/`-Delta ab (bats-coverage-batch1, cockpit-bulk-status, cockpit-filter-presets, cockpit-mobile-view, mentolder-react-rebuild, s1-violations-batch1, test-slug, ticket-mcp-go) und ist **nicht** Teil der Akzeptanz dieses Changes.
  - `wc -l`-Assertion: `scripts/docs-gen/templates.mjs` ≤ 687 **und** `scripts/docs-gen/theme.mjs` ≤ 500 **und** kein neues Modul (`tokenize.mjs`, `navigation.mjs`, `search-client.mjs`, `styles-ux.mjs`) ≥ 500.
  - target_files: — (Verifikation; ggf. `website/src/data/test-inventory.json`)
  - accept: alle obigen Kommandos grün; `wc -l`-Schranken eingehalten; keine neuen Einträge in `docs/code-quality/baseline.json`; keine neuen Deps in `package.json`.
