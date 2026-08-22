# Proposal: rollup-brand-agnostic

## Why

Der Mishap-Rollup ist de-facto bereits eine markenübergreifende Single-Lane — aber nur zufällig, nicht by design:

- `cmd_rollup_container` (scripts/ticket.sh ~Z1030) sucht den Container **ohne Brand-Prädikat**; `--brand` fließt nur ins Erstellen ein.
- `wakeup.sh` (~Z299) ruft den Generator **pro Tick zweimal** auf (einmal pro Brand), und beide Läufe konvergieren auf denselben Container.
- Die Brand-Angabe auf Rollup-Containern ist damit Zufalls-Metadaten: alle 4 historischen Container tragen `korczewski`, unabhängig davon, aus wessen Buffer die Einträge stammen.

Das ist nicht nur Kosmetik: dokumentiert als Mishap im Batch 2026-08-22 (#5) — der mentolder-Generator "adoptierte" den korczewski-Container und meldete dessen Leere als Befund über die eigene Lane. Sobald beide Brands gleichzeitig Container halten würden, staged der Generator Pläne auf das Ticket des falschen Brands. Zusätzlich lieferten `get_ticket` und `export_ticket_timeline` für dieselbe Zeile (T013107) unterschiedliche Brands (`korczewski` vs `mentolder`) — ein Read-Pfad löst Brand falsch auf.

Die Arbeit selbst (Repo-Dateien, PRs gegen main) berührt keine Fleet-Namespace-Logik. Die formale Single-Lane entfernt die Täuschungsquelle, statt Mechanik hinzuzufügen.

## What

1. **wakeup.sh:** Der Mishap-Rollup-Schritt läuft einmal pro Tick statt in der per-Brand-Schleife (der Buffer-Flush davor bleibt bewusst per-Brand — Buffer sind brand-scoped, Container ab dem Flush nicht mehr).
2. **ticket.sh rollup-container:** Resolution ohne Brand (wie gehabt, jetzt dokumentiert); Creation pinned auf eine Konstante (`ROLLUP_CONTAINER_BRAND`), Header-Kommentar erklärt die absichtlich markenübergreifende Lane.
3. **Spike/Task:** Klären, welcher der beiden ticket-mcp-Read-Pfade (get_ticket vs export_ticket_timeline) Brand falsch auflöst, und fixen — der Bug betrifft auch Nicht-Rollup-Tickets.

_Ticket: T013304_
