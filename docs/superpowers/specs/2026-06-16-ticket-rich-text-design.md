---
ticket_id: T000887
plan_ref: docs/superpowers/plans/2026-06-16-ticket-rich-text.md
domains: [website]
status: active
---

# Ticket Rich-Text & Sidekick-Refresh — Design-Spec

## Problem

Die gesamte Ticket-Verwaltung (Cockpit-Drawer, Vollbild `/admin/tickets/[id]`,
Sidekick-Anfragen, Kommentare) speichert und rendert **reinen Plaintext**. Es gibt
keine einzige Markdown-Dependency im Projekt. Konkrete Schmerzpunkte:

1. **Vollbild bietet zu wenig.** Beschreibungen lassen sich nicht strukturieren —
   keine Listen, keine nummerierten Listen, keine Hervorhebungen. Patrick will
   reichhaltige Infos an ein Ticket hängen, um mit **Gekko** (dem PM-Persona)
   *und* der Software-Factory zu kommunizieren.
2. **Sidekick-Ticket-Submenü (`TicketSidekickView.svelte`) wirkt veraltet** — die
   nackte Textarea und das Listendesign sind nicht auf dem Stand des restlichen
   Cockpit-/Kore-Looks.
3. **Kein Rich-Text-Kanal zu Gekko.** Kommentare (`tickets.ticket_comments`,
   public/internal — existiert bereits) sind der natürliche Kommunikationskanal,
   rendern aber Plaintext.

## Ziel & Nicht-Ziele

**Ziel:** Ein wiederverwendbarer, leichtgewichtiger Markdown-Editor + sicherer
Markdown-Renderer für die Ticket-UI. Anwendbar auf Beschreibung (Drawer + Vollbild),
Kommentare (Gekko-Kanal) und das Sidekick-Create-Formular. Plus optischer Refresh
des Sidekick-Submenüs.

**Nicht-Ziele:** Kein WYSIWYG (Tiptap/ProseMirror). Keine DB-Schema-Änderung. Kein
npm-Dependency. Kein Bildupload im Editor (Anhänge existieren separat). Keine
Änderung an den API-Endpunkten oder am Speicherformat.

## Architektur-Entscheidungen (mit Begründung)

### E1 — Markdown statt WYSIWYG
Beschreibungen/Kommentare bleiben **Plaintext-Markdown** in der DB. Markdown *ist*
Plaintext → das `tickets`-Schema bleibt unverändert, und — entscheidend — Gekko und
die Factory können den Rohinhalt direkt lesen/parsen (agentic-friendly, vgl.
Memory `feedback_prefer_agentic_options`). Ein WYSIWYG würde HTML/JSON persistieren,
das Agenten schlechter konsumieren.

### E2 — Eigener Subset-Renderer, kein npm-Dependency
`website/src/lib/markdown.ts` ist ein **pures Modul** (`renderMarkdown(src): string`).
Begründung: (a) das Projekt hat null Markdown-Deps und einen CI-Security-Scan;
(b) pures Modul = Vitest-testbar + S2-konform (keine Import-Zyklen, importiert nur
nichts aus Komponenten); (c) wir brauchen nur ein klar umrissenes Subset.

**XSS-Sicherheit by construction:** Der Renderer escaped **zuerst** alle
HTML-Entities (`& < > "`), wendet **danach** Transformationen an, die ausschließlich
ein bekanntes Tag-Set erzeugen. Link-URLs werden auf `http:`/`https:`/`mailto:` oder
relative (`/`…, `#`…) Schemata whitelisted; alles andere (z. B. `javascript:`) wird
als Text gerendert. Damit kann kein nutzergesteuertes HTML/Script entstehen.

**Unterstütztes Subset:**
- Überschriften `#`, `##`, `###` → `<h3>/<h4>/<h5>` (gedämpft, kein H1)
- Bold `**x**`, Italic `*x*` / `_x_`, Inline-Code `` `x` ``
- Code-Blöcke ` ```…``` `
- Ungeordnete Listen `- ` / `* `
- **Nummerierte Listen `1. `** (explizit gefordert)
- Blockquotes `> `
- Links `[text](url)` (URL-whitelisted)
- Absätze + Zeilenumbrüche

### E3 — Eine wiederverwendbare Editor-Komponente
`website/src/components/admin/MarkdownEditor.svelte` (Svelte-5-Runes, passend zum
neueren Code). Textarea + Toolbar + Vorschau-Umschalter. Toolbar-Buttons
manipulieren die Textarea-Selektion (wrap / line-prefix):
Bold · Italic · Code · Überschrift · Liste · **Nummerierte Liste** · Zitat · Link.
Props (bindable `value`): `placeholder`, `rows`, `maxlength`, `id`, `testid`,
`oninput`, `onblur`, `compact`. Nutzbar aus Legacy- *und* Runes-Eltern (Svelte 5
kompiliert beide Modi gemeinsam).

### E4 — Geteilte Render-Styles
`website/src/styles/markdown.css` (`.md-body …`) — importiert von Vollbild,
Timeline und der Editor-Vorschau. Hält die `.astro`-Datei unter dem 400-Zeilen-Limit
(Budget dort nur +10).

## Anwendungsstellen

| Stelle | Datei | Änderung |
|--------|-------|----------|
| Vollbild-Beschreibung | `pages/admin/tickets/[id].astro` | `renderMarkdown()` statt `<p whitespace-pre-wrap>`; `markdown.css` importieren |
| Kommentar-Anzeige (Gekko-Kanal) | `components/admin/TicketActivityTimeline.svelte` | Kommentar-`body` als Markdown rendern |
| Beschreibung im Drawer | `components/admin/TicketDrawer.svelte` | Textarea → `MarkdownEditor` |
| Kommentar + Transition-Notiz | `components/admin/TicketActionBar.svelte` | Textareas → `MarkdownEditor` |
| Sidekick-Beschreibung + Refresh | `components/assistant/TicketSidekickView.svelte` | Textarea → `MarkdownEditor`; optischer Refresh **netto ≤ 0 Zeilen** (S1-Budget 0 → toten `.field textarea`-CSS entfernen) |

## Datenfluss

Editor (Markdown-Text) → bestehende PATCH/POST-APIs (`/api/admin/tickets/[id]`,
`/comments`, `/transition`) → DB-Spalten `description` / `ticket_comments.body`
(unverändert) → Anzeige rendert `renderMarkdown(value)` per `{@html}` / `set:html`.

## Gate-Konformität (S1–S4)

- **S1:** `[id].astro` 390/400 → Render-Block minimal + CSS ausgelagert. SidekickView
  624 (Budget 0) → netto ≤ 0 durch Entfernen toter Textarea-Styles. Drawer/ActionBar
  weit unter 500. Neue Dateien frisch unter Limit.
- **S2:** `markdown.ts` ist pures Modul ohne Komponenten-Imports → keine Zyklen.
- **S3:** keine Brand-Domain-Literale; Link-Whitelist nutzt Schema-Prefixe, keine Hosts.
- **S4:** alle neuen Dateien werden referenziert (Editor in 3 Komponenten, `markdown.ts`
  in Editor/Timeline/Astro, `markdown.css` in Astro/Timeline/Editor) → keine Waisen.

## Tests

- `website/src/lib/markdown.test.ts` (Vitest): Escaping/XSS (`<script>`,
  `javascript:`-Link, `onerror`), ungeordnete + **nummerierte** Listen, bold/italic,
  inline + block code, Links (erlaubt vs. abgelehnt), Blockquote, gemischte Blöcke,
  Leereingabe.
- Verifikation: `task test:changed`, `task freshness:regenerate`, `task freshness:check`,
  `task test:inventory` (+ Commit) falls Tests neu.

## Risiken

- **Svelte-5/4-Mix:** MarkdownEditor (Runes) wird aus Legacy-Komponenten genutzt —
  in dieser Codebase bereits etablierter Mix; `bind:value` über `$bindable()` getestet.
- **`{@html}`-Vertrauen:** hängt vollständig an der Korrektheit von `renderMarkdown`
  → deshalb escape-first + dedizierte XSS-Unit-Tests als Gate.
