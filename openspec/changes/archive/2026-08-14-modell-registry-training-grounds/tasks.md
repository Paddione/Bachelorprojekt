# Tasks: Modell-Registry + Training Grounds

> **Ticket:** T002629 | **Effort:** mittel | **Files:** 6

## Implementierung

- [x] 1. DB-Migration — `model_registry` Schema (5 Tabellen)
  - `migrations/20260814-model-registry.sql`
  - Rollback-fähig (DROP TABLE IF EXISTS, als Kommentar dokumentiert)
- [x] 2. `registry-db.sql` — Hilfs-Funktionen (insert_adapter, upsert_scores, etc.)
- [x] 3. `model-registry.sh` CLI — register, eval, stats, list, export-loadout
  - `register <name> <base_model> [--quant Q8_0]`
  - `eval <adapter> <role>` → ruft eval-runner.sh
  - `stats <adapter>` → ruft stat-collector.sh
  - `list [--role X] [--min-score 0.X]` → DB-Query
  - `export-loadout <adapter>` → JSON
- [x] 4. `eval-runner.sh` — Adapter laden → Harness (T002606) → Scores in DB
  - Nutzt llama.cpp server (OpenAI-kompatibler Endpunkt) für Inferenz
  - Pro Rolle: N Testfälle aus testsets/
  - Score = accuracy gegen golden answers (eval_scoring)
- [x] 5. `stat-collector.sh` — VRAM, Kontext, Durchsatz messen
  - Durchsatz via Endpunkt-Completion, VRAM via nvidia-smi
  - max_context/load_time: NULL (manuell aus loadouts.json bzw. Server-Neustart)
- [x] 6. `tests/spec/finetune/model-registry.bats` — Integrationstest
  - register + eval + stats + list + export-loadout
  - Mock llama.cpp server (Stub-HTTP) + Fake-psql für eval/stats

## Verifikation

```bash
task test:changed
bash scripts/finetune/model-registry.sh list --role scout
```
