# Proposal: fix-openspec-embed-token-limit-T002839

## Why

`node scripts/openspec-embed.mjs --count-skipped` meldet konstant
`skipped: 2 documents (2 context limit > 2048 tokens, 0 other reasons)`,
ohne die betroffenen Dokumente zu nennen. Root-Cause-Analyse (siehe
`design.md`) zeigt: der `--count-skipped`-Diagnosepfad (Zeile 388-411)
ist ein reiner Vorhersage-Check und komplett von der echten Indexier-
Pipeline (`embedSlug()`, Zeile 222-333) getrennt — letztere prüft beim
tatsächlichen Schreiben in `knowledge.chunks` KEIN Token-Limit und
sendet jeden Chunk unabhängig von seiner Größe an den Embedding-
Endpoint. Der eigentliche Strukturfehler liegt in `buildChunks()`
(Zeile 141-171): zwei von vier Chunk-Pfaden — `chunkProposal()` (die
gesamte `proposal.md` als EIN Chunk) und der `partials`-Zweig (jede
`tasks.d/*.md` als EIN Chunk) — wenden NICHT denselben 400-Token-
Split (`splitByTokenBudget`, mit 50-Token-Overlap) an, den
`chunkSections()` für `tasks.md`/`specs/*.md` bereits nutzt. Dadurch
entstehen für lange `proposal.md`/Partial-Dateien einzelne,
übergroße Chunks.

Aktuell betroffen (verifiziert per `estimateSlugTokenWorst()` +
`wc -c`, 2026-08-09, `--count-skipped` läuft weiterhin gegen diese
zwei):

1. `openspec/changes/zielfamilie-llm-stack/proposal.md`
   (~2306 Tokens, `chunkProposal()`-Pfad — die Datei selbst ist mit
   9226 Zeichen deutlich über dem 400-Token-Zielwert).
2. `openspec/changes/fix-watchdog-sf26-vakuos-T002620/tasks.d/p1-sf26-vakuos-tests.md`
   (~2130 Tokens, `partials`-Zweig — 8531 Zeichen, ebenfalls ungeteilt).

Die übersprungenen Dokumente fehlen im pgvector-Index, den
`factory-mcp openspec_find_similar` und die Website-Suche abfragen —
der Skip ist sichtbar, aber bisher nicht handlungsleitend.

## What

1. `chunkProposal()` und der `partials`-Zweig von `buildChunks()`
   wenden künftig denselben 400-Token-Budget-Split (mit 50-Token-
   Overlap) an, den `chunkSections()` bereits für Tasks/Spec-Dateien
   nutzt — nur wenn ein Chunk über dem Zielwert liegt (kurze Dateien
   bleiben unverändert ein einzelner Chunk, bestehendes Verhalten für
   `chunkProposal` an kurzen Inhalten bleibt erhalten). Das behebt die
   Ursache strukturell: alle vier Chunk-Pfade sind danach konsistent
   budgetiert, und `estimateSlugTokenWorst()` (die von `--count-skipped`
   genutzte Funktion) berichtet danach für die beiden oben genannten
   Slugs keinen Skip mehr.
2. `--count-skipped` listet zusätzlich die Slugs der aktuell
   übersprungenen Dokumente auf (nicht nur die Gesamtzahl) — als
   Regressions-Absicherung, falls künftig wieder ein Chunk-Pfad ohne
   Budget-Split hinzukommt.
3. Entscheidung zur offenen Frage "2048 vs. 8192": **bewusst NICHT
   angehoben.** Mit Fix (1) liegt der größte je erzeugte Chunk
   strukturell bei ~450 Tokens (400 Zielwert + Overlap-Rand) — die
   2048-Schwelle in `--count-skipped` wird dadurch zu einem
   Regressions-Wächter mit großzügigem Puffer, nicht zu einer aktiven
   Begrenzung. Eine Anhebung auf 8192 würde das eigentliche Problem
   (ungeteilte Mega-Chunks, schlechter für die Embedding-/Retrieval-
   Qualität unabhängig vom Modell-Kontextfenster) nur verschleiern statt
   beheben.

Abgrenzung zu Schwesterticket T002870 (Branch
`fix/openspec-embed-collection-T002870`, Change-Slug
`openspec-embed-collection-T002870`): dessen Scope ist ausschließlich
`scripts/openspec-embed-local.sh` + neue `scripts/openspec-embed-lib.sh`
+ `.githooks/post-commit-embed` (Port-Forward-Identität, Completeness-
Gate-Eskalation, Rebase-Skip). Keine dieser Dateien wird hier
angefasst; dieser Change ändert ausschließlich `scripts/openspec-embed.mjs`
und dessen Tests. Kein Dateiüberlapp, keine `depends_on`-Beziehung
nötig.

_Ticket: T002839_
