# Proposal: Worker-Track + Maschinen-Format (T901014)

WARUM: T900999 hat Lifecycle (Receipt/Delete/Doktrin) geliefert und dabei
zwei Tracks bewusst separiert: Worker-Ausführung vs. Lifecycle-Verwaltung
sowie Pläne als .md-Reste vs. maschinenausführbares Format.

WAS: Mono-Plan mit 4 disjunkten Partials —
P1 Worker-Track-Trennung (workers.mjs + dispatch-Policy),
P2 Maschinen-Format (plan.mjs-Manifest/Prompt-Bau),
P3 Validierung ohne .md-Reste (plan-lint.sh),
P4 Tests je Track (llm-local-dev + Fixtures).
Runner-Handoff (FACTORY-REF) ist OUT → eigenes Follow-up T901015.
