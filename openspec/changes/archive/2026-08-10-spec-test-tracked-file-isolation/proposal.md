# Proposal: spec-test-tracked-file-isolation

## Why

`task test:spec` und `task test:spec:changed` starten bats mit `-j $(nproc)
--no-parallelize-within-files` — Spec-Dateien laufen also **parallel**. Zwei Tests in
`tests/spec/mcp-tooling.bats` schreiben währenddessen in getrackte Dateien des Arbeitsbaums und
stellen sie danach wieder her:

- Zeilen 115–123 mutieren `scripts/llm/mcp-servers.json`.
- Zeilen 128–140 mutieren `docs/agent-guide/registry/mcp.yaml` und rendern daraus zusätzlich
  `.mcp.json` und `.opencode/opencode.jsonc` neu.

Jede parallel laufende Datei, die eines dieser Artefakte liest, sieht in diesem Fenster den
manipulierten Zustand. Beobachtet in CI-Run 31286855491 (PR #3892, Shard 4/4): zwei Tests in
`tests/spec/mcp-gateway/authenticated-http-headers.bats` fielen um, mit der Meldung
`mcp-kubernetes hat einen llamacpp-Block, ist aber transport: http` — `mcp-kubernetes` ist genau der
erste http-Client der Registry, den der T002398-Test injiziert. Lokal, ohne den parallelen Nachbarn,
laufen beide Tests grün durch.

Betroffen sind nicht nur diese beiden Dateien: `tests/spec/mcp-gateway.bats`,
`tests/spec/agentic-tooling-quality-goals/g-agentic01-unresolved-tools.bats` und
`tests/spec/health-goals/measurement-integrity.bats` lesen dieselben Artefakte.

Das Muster liegt unverändert auf `origin/main`; PR #3892 hat es nicht verursacht, sondern nur die
Shard-Zusammensetzung so verschoben, dass beide Dateien gemeinsam in einem Shard landeten.

**Warum ein reiner `git status`-Guard nicht ausreicht:** Beide Tests stellen den Originalzustand am
Ende selbst wieder her. Nach dem Suite-Lauf ist der Arbeitsbaum sauber, der Inhalts-Hash identisch —
ein Endzustands-Check bliebe grün, obwohl die Race besteht. Die Mutation verrät sich stattdessen über
die **mtime**: `cp` ohne `-p` stempelt die Datei neu, und dieser Stempel überlebt die
Wiederherstellung.

## What

1. **Die beiden Tests laufen gegen Fixtures statt gegen den Arbeitsbaum.** `scripts/mcp-sync.sh`
   respektiert seit T002487 bereits `MCP_REGISTRY` und `MCP_OUT_DIR` — dieselbe Technik, die der Test
   „renderers pass headers through for any http client" in
   `tests/spec/mcp-gateway/authenticated-http-headers.bats` schon nutzt. Beide Tests werden darauf
   umgestellt: Registry-Kopie und Ausgabeverzeichnis liegen in `$BATS_TEST_TMPDIR`, die getrackten
   Dateien werden nicht mehr angefasst.
2. **Ein Guard erkennt künftige in-place-Mutationen.** Vor dem bats-Lauf wird ein Schnappschuss aus
   Pfad, mtime und Größe aller getrackten Dateien erstellt, danach erneut und verglichen. Weicht er
   ab, schlägt der Lauf mit der Liste der berührten Pfade fehl — auch dann, wenn der Inhalt
   restauriert wurde. Der Guard gilt für `test:spec` und `test:spec:changed` gleichermaßen und
   verändert den Exit-Code eines ohnehin fehlgeschlagenen bats-Laufs nicht.

Abgegrenzt: Diese Änderung stellt **keine** weiteren Spec-Tests um. Sollte der Guard beim ersten
Lauf zusätzliche Fundstellen melden, werden sie als eigene Tickets erfasst statt hier mitgezogen —
der Guard macht sie sichtbar, das ist sein Zweck.

_Ticket: T002779_
