# GOAL: OD-3 Bachelorprojekt-Cycles aufbrechen

## Objective
Alle 9 verifizierten mutually-rekursiven CALLS-Paare + 5er-Admin-Cycle +
Toast-Cycle auf eine Richtung umstellen (Re-Entrancy-/Re-Render-Risiko raus).

## Erfolgskriterien
- [ ] Paare je Single-Owner: `renderList→renderDetail` (nie zurück), `renderUnlockToggle→applyMobileLock` (nie zurück), `emit(level,msg)` Leaf (error/warn rufen nur), `trigger→run` mit Guard/Queue, `process` enqueuet / `executeJob` ruft nie `process` direkt, `connect→scheduleReconnect` mit Guard, `query` ruft `compatQuery` (nie zurück).
- [ ] Admin-5-Cycle (`renderBoard→createCard→selectJob→showDetailPanel→refreshData→renderBoard`): Einweg-Datenfluss via Event (`refreshData` emittiert, `renderBoard` subscribed).
- [ ] `use-toast`: Reducer pur, Queue-Seiteneffekt außerhalb.
- [ ] Cycle-Query `MATCH (f)-[:CALLS]->(t)-[:CALLS]->(f)` → 0 Rows für alle fixierten qn-Prefixe + betroffene Behavior-Tests grün.

## Nicht-Ziele
- Keine Website-Fassade (→ OD-1), kein VideoVault-Client-Split (→ OD-2).
- `cockpit-listen-hub`-Reconnect-Schleife bleibt als überwachter Reconnect (mit Guard), kein Entfernen.

## Abhängigkeiten
- Graph-Receipt 2026-11-06. Enabler: `od5-graph-refresh`.
- `plan_refs:` (wird ergänzt).

## Evidenz-Anker
- `lavish/kit/panel-epic-canvas.* EpicCanvas.renderList↔renderDetail`.
- `lavish/kit/panel.* Panel.applyMobileLock↔renderUnlockToggle`.
- `website/src/lib/browser-logger.* emit↔error/warn`; `website/src/scripts/admin/applications.*` 5-Cycle.
- `VideoVault/server/lib/enhanced-job-queue.* process↔executeJob`.
