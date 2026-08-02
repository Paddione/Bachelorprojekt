# Design: K4 Brain-Wiki

## Ingest-Pipeline

```
ingest-sources.yaml → brain-ingest.sh → LLM (Modell?) → Paddione/brain (PR?)
```

## Quellgruppen-Status

| Gruppe | Typ | Status (Defekt D3) |
|--------|-----|-------------------|
| ssot-specs | note | ? |
| runbooks | runbook | ? |
| adr | decision | ? |
| gotchas-footguns | note | ? |
| agent-guide-maps | moc | ? |
| core-docs | note | ? |
| health-goals | note | ? |
| diagrams | note | ? |

## Lesepfad vs K1/K3

- K1 (bge-m3): semantische Vektorsuche in openspec/specs/
- K3 (Code-Graph): strukturelle Symbolsuche via codebase-memory-mcp
- K4 (Brain-Wiki): kompiliertes Wissen in externem Repo
- Frage: läuft eine Suche gegen alle drei, oder existieren sie unverbunden?
