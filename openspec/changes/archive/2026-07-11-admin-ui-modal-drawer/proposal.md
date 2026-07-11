# Proposal: admin-ui-modal-drawer

_Ticket: T001788 · Epic: T001786 · Design-Spec: docs/superpowers/specs/2026-07-10-admin-foundation-design.md §T3_

## Why

Die Admin-GUI hat **8 Modals + 4 Drawer**, jeder mit eigenem Overlay-Markup. Nur
`TicketCreateModal` hat `role="dialog"` + Escape-Handling; `KnowledgeSourceModal` und
`WebCrawlSourceModal` haben nicht einmal Backdrop-Markup. Das ist ein **echter
Accessibility-Defekt**: Modals ohne Fokus-Falle und `role="dialog"` sind für Screenreader- und
Tastaturnutzer kaputt. Das `components/admin/ui/`-Verzeichnis existiert bereits (6 Primitiven),
aber eine Modal-/Drawer-Basis fehlt.

## What

- **`components/admin/ui/AdminModal.svelte`** auf Basis von nativem `<dialog>` + Svelte-5-Snippets:
  - `open` als `$bindable(false)`; Öffnen → `dialogEl.showModal()`, Schließen → `dialogEl.close()`.
  - `title`-Prop → `<h2 id>` per `aria-labelledby` am `<dialog>` verknüpft.
  - `{#snippet body()}` (Pflicht) + `{#snippet footer()}` (optional).
  - Escape + Backdrop-Klick schließen (dialog-nativ); `onclose` propagiert nach außen.
  - Der Browser liefert Focus-Trap, `::backdrop` und `inert` für den Hintergrund gratis.
- **`components/admin/ui/AdminDrawer.svelte`** = dünne Variante desselben Musters (seitlich statt
  zentriert, gleiche a11y-Basis).
- **8 Modals + 4 Drawer migrieren.** Reihenfolge: `KnowledgeSourceModal`/`WebCrawlSourceModal`
  zuerst (größter A11y-Gewinn, kein Backdrop heute); `TicketCreateModal` zuletzt (Regressions-Anker,
  schon a11y-konform).
- Stabile `data-testid` am `<dialog>` gegen Selektor-Bruch in den Admin-E2E-Specs.

**Vorbild im Repo:** `TicketAttachmentsPanel.svelte` (Z. 81–83) nutzt bereits natives `<dialog>`.
`AdminModal` wird zugleich das Referenzbeispiel für Snippets (bisher 3 von 91 Admin-Dateien).
**Bewusst in Kauf genommen:** `::backdrop` ist nur eingeschränkt animierbar (Grenze für
react-bits-Motion in Welle 4).
