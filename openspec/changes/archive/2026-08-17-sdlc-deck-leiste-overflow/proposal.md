# Proposal: sdlc-deck-leiste-overflow

## Why

Im SDLC-Leitstand (`/sdlc/cockpit?deck=plattform`) läuft die rechte Deck-Leiste (Z5)
horizontal aus dem Viewport: die zweite Kartenspalte des ControlPanels und der
StatusStrip sind abgeschnitten. Ursache sind drei für volle Seitenbreite gebaute
Komponenten (`ControlPanel`, `FactoryObservability`, `FactoryBudgetPage`), die seit
T008016/E4 in der 240–320 px schmalen DeckLeiste stecken, deren Breakpoints aber die
Viewport-Breite statt der Container-Breite messen. Die SSOT-Spec `sdlc-cockpit`
definiert die Z5-Panel-Größe „Deck" als kompakt — der Ist-Zustand verletzt das.

Symptom beobachtet und reproduziert (Screenshot 2026-08-17, Viewport 1513×812);
Ursache per Code-Analyse belegt (Details in `design.md`).

## What

- `.deck-leiste__body` in `DeckLeiste.svelte` wird Query-Container
  (`container-type: inline-size`).
- `ControlPanel.svelte`, `FactoryObservability.svelte` und `FactoryBudgetPage.svelte`
  erhalten `@container`-Regeln, die in schmalen Containern (< 480 px) auf
  einspaltige, kompakte Layouts umstellen (reduzierte Paddings/Gaps, scrollbare
  Tabellen) — kein horizontaler Overflow mehr in Z5.
- BATS-Guard `tests/spec/sdlc-cockpit/deck-kompakt-layout.bats` sichert die
  Container-Query-Konvention gegen Drift ab.

_Ticket: T011498_
