# Proposal: knowledge-MCP Consolidation (T900998)

## WARUM

Drei parallele knowledge-Workstreams (Toolset-Ebene T900983 staged,
devflow-mcp-Server T900985 staged, K3-Embed-Store/Rerank T900993
in_progress) laufen auf überlappenden Dateien auseinander. Statt drei
getrennte Pläne zu exekutieren: ein konsolidierter Mono-Plan mit
Stream-Partials und disjunkten Files.

## WAS

- S1 Toolset-Delta auf staged T900983 (Probes, tool_tiers, Drift, Rendering je Rolle)
- S2 devflow-mcp-Delta auf staged T900985 (context_for_task, recommend_tools, plan_stage, bge-rerank, Code-Graph-Corpus)
- S3 Embed-Reste aus T900993 nach Merge-first (Store, Sync, Rerank, Eval)
- P4 archiviert die supersedeten staged Pläne + zieht Tickets um
- P5 liefert Tests/Guards je Stream (BATS, plan-lint, Kollisions-Check)

Out of Scope: Spec-Umbau (eigenes Ticket danach), `ml/*` unangetastet,
keine direkten Pushes nach `main`.
