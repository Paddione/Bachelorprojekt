# Tasks: Modell-Registry + Training Grounds

> **Ticket:** T002629 | **Effort:** mittel | **Files:** 6

## Implementierung

- [ ] 1. DB-Migration — `model_registry` Schema (5 Tabellen)
  - `migrations/<ts>-model-registry.sql`
  - Rollback-fähig (DROP TABLE IF EXISTS)
- [ ] 2. `registry-db.sql` — Hilfs-Funktionen (insert_adapter, upsert_scores, etc.)
- [ ] 3. `model-registry.sh` CLI — register, eval, stats, list, export-loadout
  - `register <name> <base_model> [--quant Q8_0]`
  - `eval <adapter> <role>` → ruft eval-runner.sh
  - `stats <adapter>` → ruft stat-collector.sh
  - `list [--role X] [--min-score 0.X]` → DB-Query
  - `export-loadout <adapter>` → JSON
- [ ] 4. `eval-runner.sh` — Adapter laden → Harness (T002606) → Scores in DB
  - Nutzt llama.cpp server für Inferenz
  - Pro Rolle: N Testfälle aus testsets/
  - Score = accuracy gegen golden answers
- [ ] 5. `stat-collector.sh` — VRAM, Kontext, Durchsatz messen
  - llama.cpp bench mit verschiedenen Kontextlängen
  - Speicherverbrauch via nvidia-smi oder llama.cpp log
- [ ] 6. `tests/spec/finetune/model-registry.bats` — Integrationstest
  - register + eval + stats + list + export-loadout
  - Mock llama.cpp server für eval/stats

## Verifikation

```bash
task test:changed
bash scripts/finetune/model-registry.sh list --role scout
```
