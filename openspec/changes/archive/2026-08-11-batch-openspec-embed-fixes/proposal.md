# batch-openspec-embed-fixes — Proposal

## Zweck

Batch-Gruppe aus 7 Tickets, die den openspec-embed-Pfad (Embedding, Archivierung,
Plan-Gates) reparieren. Ein gemeinsamer Branch und Plan decken alle Kinder ab.

## Kinder

- T003268: tasks.d-Partials ungesplittet embedded (400) + stiller set -e-Tod
- T003384: Port-15432-Kollision in openspec-embed.mjs
- T003177: false "Backend nicht erreichbar"-Meldung
- T003140: openspec.sh archive Batch-Skalierung
- T003281: propose seedet Platzhalter — Gate-Lücke
- T002877: Completeness-Gate Backfill (12 docs vs 57 Pläne)
- T003287: Archiv-Commit auf main braucht SKIP_MAIN_COMMIT_GUARD

## Nicht im Scope

- Coaching/Training-Pfade (eigene Tickets)
- llm-proxy-Dispatch-Capture (T003277 — Design-Doku, kein Embed-Fix)
- bge-Modell-Auswahl (eigene Tickets)
