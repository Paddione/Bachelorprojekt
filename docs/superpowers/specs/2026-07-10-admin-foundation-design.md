---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-10
---

# Admin-Fundament — Konsolidierungs-Rework (Design-Spec)

**Branch:** `feature/admin-foundation` (Epic-Umbrella; jeder Strang bekommt später eigenen Change/PR)
**Datum:** 2026-07-10
**Scope-Entscheidung:** Epic mit PRD, **ein OpenSpec-Change pro Strang**, eigener PR — reviewbar und einzeln rollback-bar.
**Erste Welle (dieser Planungslauf):** Token · Modal/Drawer · Redirect-Stubs.
**Ausgegliedert:** T001784 (CDN-React in `coaching/studio.astro`) — eigenes Bug-Ticket, **nicht** Teil dieses Reworks.

## Intent (WARUM)

Die Admin-GUI (`website/src/**/admin*`, ~47.000 LOC, 91 Svelte-Komponenten) ist über Monate
gewachsen, ohne dass gemeinsame Muster durchgesetzt wurden. Zwei Codebase-Explorationen (2026-07-10)
ergaben: es gibt **keinen einzigen toten Svelte-Component**. Die technische Schuld ist also kein Müll
zum Löschen, sondern **Muster-Duplikation** — gute Abstraktionen wurden gebaut und nie durchgesetzt.

Das wiederkehrende Muster (dreimal belegt):
- `components/admin/ui/AdminTabs.svelte` existiert, hat aber nur **4 Consumer**; `PlatformHub`,
  `WissenHub`, `InhalteEditor`, `AdminEinstellungenTabs` bauen Tab-Logik jeweils neu.
- `lib/admin-api.ts` (`apiCall` mit Retry/401/Toast) hat nur **5 Consumer**; **71 Komponenten**
  nutzen rohes `fetch()`.
- Die `--admin-*`-Alias-Schicht in `admin-foundation.css` wird nur in **24 von 52** Komponenten
  mit `<style>`-Block benutzt. Ein Guard-Test (`admin-token-alias.test.ts`) bewacht die Naht,
  statt das Problem aufzulösen.

**Ziel:** Das schon vorhandene `ui/`-Fundament konsequent verwenden statt Neues bauen. Erst wenn das
Fundament trägt, folgt der Visual-Layer (react-bits als React-Islands, Welle 4).

## Ist-Zustand (verifizierte Befunde)

| Schuld | Fläche | Risiko | Kernbefund |
|---|---|---|---|
| Token-Chaos | 3 Ebenen | hoch | Dieselbe Farbe heißt `--color-fg` (Tailwind `@theme`), `--fg` (factory-tokens), `--admin-text`. 17 doppelte Basisnamen zwischen `global.css` und `factory-tokens.css`; `--sidebar-width` in `admin-foundation.css` definiert, aber cross-file in `admin-premium.css` genutzt. |
| Keine Modal-Basis | 8 Modals + 4 Drawer | mittel | Nur `TicketCreateModal` hat `role="dialog"` + Escape. `KnowledgeSourceModal`/`WebCrawlSourceModal` haben kein Backdrop-Markup. **Echter A11y-Defekt.** |
| Redirect-Stubs | 23 Dateien | niedrig | 11 zeigen auf `/admin/inhalte`; `astro.config.mjs` hat **keine** `redirects`-Config. **16 der 23 haben Query-Strings im Ziel.** |
| Auth-Copy-Paste | 62 Seiten | niedrig | Derselbe 3-Zeilen-Block (`getSession`/`isAdmin`/redirect). Kein `requireAdmin()`-Helper. Redirect-Ziel inkonsistent (`/admin` vs. `/portal`). |
| Kein API-Client | 71 `fetch()` | mittel | `admin-api.ts`: 5 Consumer. Fehleranzeige gespalten: 28× `let error`, 6× `alert()`, `admin-toast` 0× in Komponenten. `content-client.ts` = 4. Fetch-Pfad. |
| 5 Tab-Shells | 4 Hubs | mittel | `ui/AdminTabs` (4 Consumer) vs. Eigenlogik in `PlatformHub`/`WissenHub`/`InhalteEditor`/`AdminEinstellungenTabs`. |

**Styling-Kontext:** Tailwind v4 (`@tailwindcss/vite`) aktiv, aber **0× `@apply`**, keine `tailwind.config`
(v4 CSS-first). Admin läuft primär auf 3 globalen `admin-*.css`-Sheets + scoped `<style>` (52 von 113
Komponenten). Kore-Design-System (`components/kore/`) und Admin sind getrennte Token-Welten (nur Brand-Flag
`isKore` verbindet). **Keine Motion-Library** installiert (kein `motion`/`gsap`/`three`/`ogl`, 0× `svelte/transition`).
Kein Dark/Light-Umschalter — Admin ist hart dunkel (`--admin-bg = var(--ink-900)`). Svelte **5.56** (Runes +
Snippets verfügbar; nur 3 Admin-Dateien nutzen `{#snippet}` bisher). Astro **7.0.7**, `output: 'server'`,
Node-Adapter standalone.

## Kernentscheidungen (aus Brainstorming 2026-07-10)

### T1 — Token-Zielarchitektur: Tailwind `@theme` als einzige Quelle

`factory-tokens.css` wird **ersatzlos aufgelöst**; seine 17 Basisnamen wandern als `@theme`-Einträge nach
`global.css`. `admin-foundation.css` behält nur echte Admin-Spezifika (`--space-*`, `--z-*`,
`--admin-transition-*`, Component-Tokens) und verliert **alle Farb-Aliase**. Die
`--sidebar-width`/`--sidebar-collapsed-width`-Definition (heute einmalig in `admin-foundation.css`,
aber cross-file in `admin-premium.css` genutzt) wandert nach `admin-premium.css` — dem Owner der
Sidebar-Optik.

**Konsequenzen:**
- `admin-token-alias.test.ts` wird neu gefasst: bewacht künftig, dass jedes `--admin-*`-Farbtoken ein
  `@theme --color-*` aliast **und** dass `factory-tokens.css` nicht mehr existiert (keine zweite
  `:root`-Farbquelle) — statt der bisherigen Alias-Kette gegen `factory-tokens`.
- Die 16 `--admin-*`-Farb-Aliase werden in einem `:root`-Block in `global.css` deklariert (jeweils
  `var(--color-*)`). Die **36** Dateien, die `--admin-*`-Farben nutzen, bleiben dadurch unverändert
  gültig — nur die Quelle der Aliase wechselt.
- CSS ist im S1-Ratchet **ungated** (`_ext_limit` liefert 0 für `.css`) → kein Zeilenbudget-Problem.
- **Snapshot-Risiko geringer als zunächst angenommen:** `tests/e2e/specs/visual-sweep.spec.ts` vergleicht
  keine eingecheckten Pixel-Baselines, sondern erzeugt eine Galerie und gated nur auf Route-Fehler
  (HTTP ≥ 400); die migrierten Farbwerte sind computed-deckungsgleich. Der Strang läuft trotzdem
  **zuerst** (die Token-Basis soll vor den Komponenten-Migrationen stehen), und Task 7 des Plans macht
  eine bewusste Galerie-Sichtung/Rebaseline, falls je `toHaveScreenshot`-Baselines hinzukommen.

### T2 — Redirect-Mechanik: `REDIRECT_MAP` in `middleware.ts`

Astros `redirects`-Config ist als „Route → Pfad"-Mapping dokumentiert und **schweigt zu Query-Strings**
im Ziel — 16 der 23 Stubs brauchen aber genau das. Statt darauf zu wetten: eine `REDIRECT_MAP`
(`Record<string, string>`, Pfad → Vollziel inkl. Query) in `src/middleware.ts`.

**Begründung:** `middleware.ts` (heute 15 Zeilen, nur Locale + Logging) ist genau der Ort, an dem in
**Welle 2** der `requireAdmin()`-Guard landet. Query-Strings sind dort trivial; die Map ist als reiner
Unit-Test prüfbar (keine Route-Renderung nötig); beide Wellen teilen eine Datei statt zweimal am Routing
zu schrauben. S1-Limit `.ts` = 600 → Wachstum von 15 auf ~60 Zeilen unkritisch. Die 23 Stub-`.astro`-
Dateien werden **gelöscht**.

**Verhalten:** Match in `REDIRECT_MAP` → `301`-Redirect auf das Vollziel, **bevor** die Route rendert.
Kein Match → bestehende Locale/Logging-Kette unverändert. Der Guard-Test verifiziert, dass jeder der 23
alten Pfade auf sein exaktes bisheriges Ziel (inkl. Query) mappt.

### T3 — AdminModal-API: natives `<dialog>` + Svelte-Snippets

Der Browser liefert Focus-Trap, Escape, `::backdrop` und `inert`. Der A11y-Defekt in 7 von 8 Modals wird
**durch die Plattform** behoben, nicht durch eigenen JS-Code. `TicketAttachmentsPanel.svelte` und
`ProjectMeetingsTab.astro` belegen bereits, dass natives `<dialog>` im Repo funktioniert.

**Ziel-API (`components/admin/ui/AdminModal.svelte`):**
```svelte
<AdminModal bind:open title="Rechnung anlegen">
  {#snippet body()}   <InvoiceForm />              {/snippet}
  {#snippet footer()} <button>Speichern</button>   {/snippet}
</AdminModal>
```
- `open` als `$bindable(false)`; Öffnen ruft `dialogEl.showModal()`, Schließen `dialogEl.close()`.
- `title`-Prop → `<h2>` mit `id`, per `aria-labelledby` am `<dialog>` verknüpft.
- `body`- und `footer`-Snippets; `footer` optional.
- Escape und Backdrop-Klick schließen (dialog-nativ); `on:close` propagiert nach außen.
- `AdminDrawer.svelte` = dünne Variante desselben Musters (seitlich statt zentriert; gleiche a11y-Basis).

**Bewusst in Kauf genommen:** `::backdrop` ist ein Pseudo-Element und nur eingeschränkt animierbar. Wenn
react-bits-Motion (Welle 4) Overlays erfassen soll, ist das die Grenze — Seiteninhalte/Karten bleiben
unberührt. `AdminModal` wird zugleich das **Referenzbeispiel** für Snippets (bisher 3 von 91 Dateien).

**Migrations-Reihenfolge der 8 Modals:** `TicketCreateModal` (schon a11y-konform) zuletzt als Regressions-
Anker; `KnowledgeSourceModal`/`WebCrawlSourceModal` (kein Backdrop) zuerst, da größter A11y-Gewinn.

## Strang-Schnitt (Wellen)

**Welle 1 (dieser Lauf) — 3 Changes:**
1. `admin-token-consolidation` — T1. Zuerst (Snapshot-Risiko isolieren).
2. `admin-ui-modal-drawer` — T3. `AdminModal` + `AdminDrawer` + 8 Modal- + 4 Drawer-Migrationen.
3. `admin-redirect-map` — T2. `REDIRECT_MAP` + 23 Stub-Löschungen.

**Welle 2:** `requireAdmin()`-Guard (62 Seiten) · `AdminTabs` in 4 Hubs durchsetzen.
**Welle 3:** 71 `fetch()` → `apiCall` · einheitliche Fehleranzeige über `admin-toast`.
**Welle 4:** react-bits als React-Islands · Motion-Layer.

Die Wellen sind **weitgehend unabhängig**; einzige harte Reihenfolge innerhalb Welle 1: Token vor
allem, was Snapshots berührt. Modal und Redirect sind untereinander unabhängig.

## Risiken & Failure-Modes

- **Visual-Regression (niedrig–mittel):** `visual-sweep.spec.ts` gated auf Route-Fehler (HTTP ≥ 400),
  nicht auf eingecheckte Pixel-Baselines; die migrierten Farbwerte sind computed-deckungsgleich.
  Gegenmaßnahme: Token-Strang zuerst (stabile Basis für Modal/Redirect); bewusste Galerie-Sichtung in
  Plan-Task 7; Rebaseline nur, falls je `toHaveScreenshot`-Baselines existieren.
- **Selektor-Bruch (mittel):** Modal-Migration ändert DOM-Struktur (`<div class="modal-overlay">` →
  `<dialog>`). E2E-Specs, die auf alte Selektoren zielen, brechen still. Gegenmaßnahme: vor der Migration
  betroffene Selektoren in den 101 Admin-E2E-Specs inventarisieren; `<dialog>` mit stabilen
  `data-testid` versehen.
- **Query-Redirect-Regression (mittel):** Wenn `REDIRECT_MAP` einen der 16 Query-Ziele falsch mappt,
  landen Altlinks auf der falschen Content-Sektion. Gegenmaßnahme: failing Unit-Test mit allen 23
  Pfad→Ziel-Paaren als Tabelle, rot→grün.
- **Snippet-Ungewohntheit (niedrig):** Nur 3 Dateien nutzen `{#snippet}`. `AdminModal` wird Referenz;
  Migrations-Doku im Change.
- **Backwards-Compat Redirects:** Alte Bookmarks/externe Links auf die 23 Pfade müssen weiter
  funktionieren → `301` (permanent) mit exakt bisherigem Ziel, verifiziert per Test.

## Verifikation (pro Change im Plan zu konkretisieren)

Jeder Change endet mit `task test:changed`, `task freshness:regenerate`, `task freshness:check`
(CI-Äquivalent inkl. S1–S4-Ratchet). Bei Test-Änderungen zusätzlich `task test:inventory` + Commit des
Inventars. Vor Commit: `task test:openspec` grün. Modal- und Redirect-Change bringen einen rot→grün
Failing-Test (`expected: FAIL`); der Token-Change verifiziert primär über Snapshot-Rebaseline +
`admin-token-alias.test.ts`-Neufassung.

## Nicht-Ziele

- Kein Visual-Redesign in Welle 1 (kommt in Welle 4).
- Keine `fetch()`→`apiCall`-Migration in Welle 1 (Welle 3).
- Kein Dark/Light-Umschalter (nicht angefragt).
- T001784 (CDN-React) wird **nicht** hier gefixt.
