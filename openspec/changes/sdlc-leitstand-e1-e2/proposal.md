# Proposal: sdlc-leitstand-e1-e2

## Why

Das SDLC-Cockpit wird zum **Leitstand** umgebaut (Epic T007553, Design-Doc in
`openspec/changes/sdlc-leitstand-e1-e2/design.md`): Leitstand-first, eine integrierte
Fläche, neues Interaktionsmodell (Stationen-Achse + Deck-Umschalter), Control-Room-Stil.
Dieser Change liefert die zwei **Fundament-Etappen**, auf denen die Shell (E3) später
aufsetzt — beide sind disjunkt und parallelisierbar:

- **E1 · Leitstand-Design-System:** Das Cockpit hat heute verstreute Ad-hoc-Styles
  (`--pl-*`, `--phase-*` in einzelnen Svelte-Komponenten) und kein zentrales Token-Set.
  Ohne gemeinsame Tokens würde jede Shell-Komponente ihre Farben erneut erfinden.
- **E2 · API-/Connector-Inventar:** Die SDLC-API-Fläche (~135 Endpunkt-Dateien unter
  `website/src/pages/sdlc/api/`) ist unkartiert — `mcp.yaml` deckt nur MCP-Server ab.
  Handkuratierung driftet; das Repo-Muster dafür ist ein generiertes Inventar mit
  CI-Drift-Gate (`test-inventory.json`).

MESSUNG (2026-08-15, gegen origin/main b8bdc651e):

```bash
find website/src/pages/sdlc/api -name '*.ts' | wc -l
```

## What

- **E1:** `website/src/styles/sdlc-leitstand.css` — Token-Set als CSS-Custom-Properties
  (Control Room: dunkle kühle Grundtöne, Signal-Ampel grün/amber/rot/info als
  semantischer Kern, Mono-Ziffern, Radien 2–4 px, kompakte Dichte; Glow/Puls nur für
  Läuft-Zustände). Print-Light ausschließlich als Report-Stylesheet (`@media print`).
  `website/src/pages/sdlc/design-system.astro` wird zum Showcase des Token-Sets.
  Design-Projekt-Bundle (Token-Karten + Komponenten-Previews) unter
  `design/leitstand-ds/` für den DesignSync-Push ins neue Claude-Design-Projekt
  „SDLC Leitstand Design System".
- **E2:** Scanner `scripts/sdlc/api-inventory.mjs` (SDLC-API-Routen + Methoden +
  Backend-Klassifikation, plus MCP-Server aus `docs/agent-guide/registry/mcp.yaml`,
  plus factory-mcp-Tools) → deterministisches `website/src/data/api-inventory.json`;
  kuratierte Felder aus `docs/agent-guide/registry/api-overlay.yaml` gemergt
  (Overlay-Eintrag ohne gescannten Endpunkt = Fehler); Task + CI-Drift-Gate nach dem
  test-inventory-Muster.
- **Tests (eigenes Partial, RED-first):** BATS-Guards für Token-Datei-Semantik und
  Inventar-Drift (Output-Verifikation, T002448-M4/T002716).

**Nicht in diesem Change:** Umbau von `cockpit.astro` (E3), Decks/Lücken (E4),
Help-Overlay/Redirects (E5) — siehe Etappenplan im Design-Doc.

_Ticket: T007559_
