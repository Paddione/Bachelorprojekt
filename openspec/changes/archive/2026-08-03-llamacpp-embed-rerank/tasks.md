---
title: "llamacpp-embed-rerank — bge-m3 + bge-reranker-v2-m3 auf persistente llama.cpp-GPU-Server"
ticket_id: T002110
domains: [infra, website, llm]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# llamacpp-embed-rerank — Implementation Plan

Überführt `bge-m3` und `bge-reranker-v2-m3` von TEI-CPU-Docker (bzw. gar nicht) auf zwei
persistente `llama-server`-Instanzen mit GPU-Offload, macht den stillen Rerank-Ausfall sichtbar,
räumt die toten LM-Studio-Pfade ab und hebt den Bonsai-Server auf vier parallele Slots.

Design und Ausgangslage: `openspec/changes/llamacpp-embed-rerank/design.md`.
Verifizierte Signaturen, Flags und Risiken: `openspec/changes/llamacpp-embed-rerank/intel.json`.

> **Vorbedingung:** T002109 (`fix/k3d-dev-llm-bridge`, `in_review`) ändert `environments/dev.yaml`,
> `environments/schema.yaml`, `k3d/llm-gpu.yaml` und `tests/spec/llm-pipeline.bats`. Vor der
> Umsetzung dessen Merge abwarten und diesen Branch auf frisches `main` rebasen.

_Ticket: T002110_

## File Structure

| Datei | Ist | Budget |
| --- | --- | --- |
| `website/src/lib/rerank.ts` | 31 | 569 |
| `website/src/lib/embeddings.ts` | 179 | 421 |
| `website/src/lib/rerank.test.ts` | 58 | 542 |
| `website/src/lib/embeddings.test.ts` | 153 | 447 |
| `scripts/openspec-embed-local.sh` | 91 | 409 |
| `scripts/llm-host-setup.sh` | 80 | 420 |

Ungegatete Dateien ohne S1-Extension-Grenze: `environments/schema.yaml`, `environments/dev.yaml`,
`environments/mentolder.yaml`, `environments/korczewski.yaml`, `environments/staging.yaml`,
`environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`, `k3d/llm-gpu.yaml`,
`Taskfile.llm.yml`, `tests/spec/llm-pipeline.bats`.

Neue Dateien: `scripts/llm/start-embed-server.ps1`, `scripts/llm/start-rerank-server.ps1`,
`scripts/llm/start-bonsai-server.ps1`, `scripts/llm/register-scheduled-tasks.ps1`,
`scripts/llm/measure-embedding-equivalence.mjs` (`.mjs`-Limit 500, mit deutlicher Reserve
darunter geschnitten).

Keine der Dateien ist gebaselined, und keine kommt ihrer Schwelle nahe — ein Split oder eine
Verkleinerung ist an keiner Stelle erforderlich.

CQ02: Die aktuelle `any`-Zählung in `website/src` ist **0**. Dieser Plan führt keine `any`-Typen
ein; die llama.cpp-Antwortform wird als explizites Interface typisiert.

## Partials

| id | Datei | Rolle | target_files | depends_on |
| --- | --- | --- | --- | --- |
| p1 | `tasks.d/p1-host-server.md` | impl | `scripts/llm/start-embed-server.ps1`, `scripts/llm/start-rerank-server.ps1`, `scripts/llm/start-bonsai-server.ps1`, `scripts/llm/register-scheduled-tasks.ps1`, `scripts/llm/measure-embedding-equivalence.mjs`, `scripts/llm-host-setup.sh`, `Taskfile.llm.yml` | |
| p2 | `tasks.d/p2-website-clients.md` | impl | `website/src/lib/rerank.ts`, `website/src/lib/embeddings.ts` | |
| p3 | `tasks.d/p3-config.md` | impl | `environments/schema.yaml`, `environments/dev.yaml`, `environments/mentolder.yaml`, `environments/korczewski.yaml`, `environments/staging.yaml`, `environments/fleet-mentolder.yaml`, `environments/fleet-korczewski.yaml`, `k3d/llm-gpu.yaml`, `scripts/openspec-embed-local.sh` | p1 |
| p4 | `tasks.d/p4-tests.md` | tests | `website/src/lib/rerank.test.ts`, `website/src/lib/embeddings.test.ts`, `tests/spec/llm-pipeline.bats` | p1, p2, p3 |

`p3` hängt an `p1`, weil die Service-Ports erst durch die Startskripte festgeschrieben werden.
`p4` hängt an allen dreien, weil die BATS-Assertions gegen die dann vorhandenen Dateien laufen.
Der rot→grün-Failing-Test-Step liegt in `p4`.

## Task 5 — Final verification

Nach Abschluss aller Partials, im Worktree ausführen:

1. Vollständige Test- und Gate-Kette:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

2. Manifest-Validierung, weil `k3d/llm-gpu.yaml` geändert wurde:

```bash
task workspace:validate
```

3. CQ02-Gate — die `any`-Zählung darf nicht steigen (Ist: 0):

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

4. OpenSpec-Gate:

```bash
task openspec:validate
```

5. Bestätigen, dass das Äquivalenz-Gate aus p1 dokumentiert bestanden wurde. Ist es gerissen,
   werden die Konfigurationsänderungen aus p3 zurückgenommen und der Change endet mit dem
   Messergebnis plus einem Folgeticket für den pgvector-Reindex.
