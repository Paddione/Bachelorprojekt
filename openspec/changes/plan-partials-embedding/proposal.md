# Proposal: Plan-Partials als Factory-Slot-Einheit in pgvector embedden

## Why

tasks.d/ wird derzeit nicht indexiert — 10 Pläne mit tasks.d/ (die großen, mehrslotigen) sind vollständig unauffindbar. Ihre eigentlichen Handlungsaufträge fehlen im Vektorindex. Die Chunk-Dimension ist zudem 25-60x kleiner als ein echter Partial, und Metadaten tragen keine Slot-Identität.

## What

Fünf Änderungen an scripts/openspec-embed.mjs und scripts/plan-lint.sh:

A) **buildChunks() erhält tasks.d/*.md** als vierte Quelle — je Partial ein Chunk, fileType='partial'
B) **Metadaten** aus der Manifest-Tabelle (partial_id, role, target_files, depends_on, token_estimate)
C) **Größen-Gate** in plan-lint.sh: Partial > 7000 Token → FAIL
D) **Single Write Path**: ACTIVE_STATUSES-Konstante, ein Schreibpfad
E) **Zweiten Schreibpfad identifizieren**

_Ticket: T002453_
