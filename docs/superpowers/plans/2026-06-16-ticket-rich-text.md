---
ticket_id: T000887
spec_ref: docs/superpowers/specs/2026-06-16-ticket-rich-text-design.md
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Implementierungsplan — Ticket Rich-Text & Sidekick-Refresh

Spec: `docs/superpowers/specs/2026-06-16-ticket-rich-text-design.md`. TDD-getrieben.

## Task 1 — Markdown-Renderer (pures Modul, TDD)

**Zuerst Test, dann Code.**

- `website/src/lib/markdown.test.ts` — Vitest-Cases:
  - escaped `<`, `>`, `&`, `"` in normalem Text
  - `<script>alert(1)</script>` wird als Text gerendert (kein `<script>`-Tag im Output)
  - Link `[x](javascript:alert(1))` → kein `href="javascript:` (als Text/`#`)
  - Link `[x](https://example.org)` → `<a href="https://example.org"`
  - relativer Link `[x](/admin)` erlaubt; `[x](mailto:a@b.de)` erlaubt
  - ungeordnete Liste `- a\n- b` → `<ul><li>`
  - **nummerierte Liste `1. a\n2. b` → `<ol><li>`**
  - bold `**x**` → `<strong>`, italic `*x*` / `_x_` → `<em>`
  - inline code `` `x` `` → `<code>` (Inhalt escaped)
  - Code-Block ` ```\ncode\n``` ` → `<pre><code>`
  - Blockquote `> x` → `<blockquote>`
  - leere/whitespace-Eingabe → `''`
  - gemischte Blöcke (Absatz + Liste + Überschrift) in korrekter Reihenfolge
- `website/src/lib/markdown.ts` — `export function renderMarkdown(src: string): string`.
  - escape-first; danach block-weise (fence/heading/quote/ul/ol/paragraph) + inline.
  - URL-Whitelist: `http:`/`https:`/`mailto:` oder Start mit `/` oder `#`.
  - **S1** `.ts`=600, frisch — weit unter Limit. **S2** keine Komponenten-Imports.
  - **S3** keine Host-Literale (nur Schema-Prefixe).
- Verify: `pnpm --dir website vitest run src/lib/markdown.test.ts` grün.

## Task 2 — `MarkdownEditor.svelte` (wiederverwendbar)

- `website/src/components/admin/MarkdownEditor.svelte` (Svelte-5-Runes).
  - Props: `value`=`$bindable('')`, `placeholder`, `rows`, `maxlength`, `id`, `testid`,
    `oninput?`, `onblur?`, `compact?`.
  - Toolbar: Bold/Italic/Code (wrap-Selektion), Überschrift/Liste/**Nummerierte
    Liste**/Zitat (line-prefix), Link (`[sel](url)`), Vorschau-Toggle (rendert
    `renderMarkdown(value)` via `{@html}`).
  - Helfer `wrapSelection(before, after)` + `prefixLines(prefix, ordered?)` an der
    referenzierten Textarea (`selectionStart/End`).
  - Importiert `markdown.css` für die Vorschau. **S1** `.svelte`=500, frisch.
- Verify: `pnpm --dir website astro check` ohne neue Fehler für die Datei.

## Task 3 — Geteilte Render-Styles

- `website/src/styles/markdown.css` — `.md-body` (h3–h5, ul/ol, code/pre,
  blockquote, a, p-Abstände), an Admin-Dark-Tokens angelehnt.
- **S4** wird in Task 2/4/5 importiert → keine Waise.

## Task 4 — Anzeige-Stellen verdrahten

- `pages/admin/tickets/[id].astro`: Import `renderMarkdown` + `markdown.css`;
  Beschreibung als `<div class="md-body" set:html={renderMarkdown(ticket.description)} />`.
  **S1 hart: ≤ 400 Zeilen halten** (Budget +10) — Render-Block minimal, CSS ausgelagert.
  `wc -l` nach Änderung prüfen.
- `components/admin/TicketActivityTimeline.svelte`: Kommentar-`body`
  (`<p white-space:pre-wrap>`) → `<div class="md-body" >{@html renderMarkdown(e.body)}</div>`;
  `markdown.css` importieren. **S1** 148/500 — viel Budget.

## Task 5 — Editor-Stellen verdrahten

- `components/admin/TicketDrawer.svelte`: Description-Textarea → `<MarkdownEditor
  bind:value={description} on:blur` (bzw. `onblur`-Prop). **S1** 165/500.
- `components/admin/TicketActionBar.svelte`: Kommentar- + Transition-Notiz-Textarea →
  `MarkdownEditor`. **S1** 206/500.
- `components/assistant/TicketSidekickView.svelte`: Description-Textarea →
  `MarkdownEditor`; **optischer Refresh netto ≤ 0 Zeilen** (S1-Budget 0 bei 624):
  toten `.field textarea`-CSS entfernen, Refresh über Edit bestehender Regeln.
  `wc -l` muss **≤ 624** bleiben.

## Task 6 — Verifikation (CI-Äquivalent)

1. `wc -l` aller geänderten Dateien gegen S1-Budgets (`[id].astro`≤400, Sidekick≤624).
2. `pnpm --dir website vitest run src/lib/markdown.test.ts` grün.
3. `pnpm --dir website astro check` — keine neuen Typfehler.
4. `task test:changed` grün.
5. `task test:inventory` (neuer Test) → `website/src/data/test-inventory.json` committen.
6. `task freshness:regenerate` && `task freshness:check` grün (S1–S4-Ratchet).
7. Manuelle Sichtprüfung der Vorschau im Editor (renderMarkdown-Roundtrip).

## Nicht-Ziele / Out of Scope

Kein WYSIWYG, kein Schema-Change, kein npm-Dep, kein Bildupload, keine API-Änderung.
