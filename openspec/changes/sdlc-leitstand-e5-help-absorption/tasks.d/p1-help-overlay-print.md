# p1 — Help-Overlay + Print-Light + Politur (Rolle: website)

_Voraussetzung: E3 (T007957) gemerged — Statusband, Registry, Zonen-Shell existieren._

## Tasks

- [ ] **Anker-Kontrakt in der Registry festziehen.** In
      `lib/sdlc/leitstand-purpose-registry.ts` sicherstellen, dass jeder Registry-Schlüssel
      als `data-purpose-id`-Wert taugt (kebab-case, exportierte Typ-Hilfe
      `PurposeId = keyof typeof registry`); Registry-Einträge um optionale
      `position`-Hinweise NICHT erweitern — die Position kommt zur Laufzeit aus dem
      DOM-Anker (`getBoundingClientRect`), damit Registry und Layout entkoppelt bleiben.
- [ ] **`HelpOverlay.svelte` anlegen.** Bei aktivem Toggle: Fläche mit halbtransparentem
      Layer überziehen (`pointer-events` fängt Klicks ab — keine Write-Aktion darunter
      auslösbar), pro `[data-purpose-id]`-Element eine Karte mit `zweck`, `datenquelle`,
      `aktionen[]` an dessen Position rendern. Leitstand-DS-Tokens, kantige Radien,
      Kompakt-Dichte. Deaktivierung entfernt den Layer ohne Reload.
- [ ] **`LeitstandStatusband.svelte` umbauen.** Den in E3 angelegten `[?]`-Toggle mit einem
      Store (`helpOverlayActive`) verdrahten; Toggle-Zustand trägt `aria-pressed`.
- [ ] **`cockpit.astro` umbauen.** `HelpOverlay` als oberste Ebene der Shell mounten;
      `.report`-Ansicht: Query-Parameter `?report=1` setzt die `.report`-Klasse auf dem
      Wurzelelement (Export-Vorschau der Print-Darstellung).
- [ ] **`sdlc-leitstand.css` erweitern.** Den bestehenden `@media print`-Block (ab Z. 80) zur
      vollwertigen Report-Darstellung ausbauen und als gemeinsame Regeln mit `.report`
      teilen (helle Grundtöne, Signal-Farben druckfest, Deck-Umschalter/Action-Slots/
      Help-Toggle ausgeblendet). Politur: Glow/Puls-Selektoren auf „läuft gerade"-Zustände
      eingrenzen (Disziplin-Regel §S4); kein zweites interaktives Theme, kein Theme-Switcher.

## Verifikation (Partial-lokal)

```bash
grep -n 'data-purpose-id' components/website/src/components/leitstand/HelpOverlay.svelte
grep -n '\.report' components/website/src/styles/sdlc-leitstand.css
```
