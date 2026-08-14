# Design: Modell-Registry

## Architektur

```
┌──────────────────────────────────────────────────────────────┐
│                    Modell-Registry                           │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Eval-Runner  │  │ Stat-Collector│  │ Registry-DB       │  │
│  │ (T002606)    │  │ (VRAM/tok/s) │  │ (model_registry)  │  │
│  └──────┬──────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                │                   │               │
│         ▼                ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              CLI: model-registry                        │ │
│  │  model-registry eval <adapter> <role>                   │ │
│  │  model-registry stats <adapter>                         │ │
│  │  model-registry list --role scout --min-score 0.7       │ │
│  │  model-registry export-loadout <adapter>                │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## DB-Schema

```sql
CREATE TABLE IF NOT EXISTS model_registry.adapters (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  base_model    TEXT NOT NULL,          -- z.B. "gemma-4-9b-it"
  quantization  TEXT,                    -- "Q8_0", "IQ4_XS"
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_registry.eval_scores (
  adapter_id    INT REFERENCES model_registry.adapters(id),
  role          TEXT NOT NULL,           -- "scout", "review-lens", "commit-msg", "triage"
  score         FLOAT NOT NULL,          -- 0..1
  harness_version TEXT,
  evaluated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (adapter_id, role)
);

CREATE TABLE IF NOT EXISTS model_registry.stat_requirements (
  adapter_id    INT REFERENCES model_registry.adapters(id) PRIMARY KEY,
  vram_mb       INT,
  max_context   INT,                     -- max Kontextlänge
  throughput_toks  FLOAT,                -- tok/s
  load_time_ms  INT
);

CREATE TABLE IF NOT EXISTS model_registry.provenance (
  adapter_id    INT REFERENCES model_registry.adapters(id) PRIMARY KEY,
  training_corpus TEXT,                  -- Korpus-Identifier
  lora_rank     INT,
  lora_alpha    INT,
  git_commit    TEXT,
  training_config JSONB
);

CREATE TABLE IF NOT EXISTS model_registry.deployment_config (
  adapter_id    INT REFERENCES model_registry.adapters(id) PRIMARY KEY,
  chat_template TEXT,
  stop_tokens   TEXT[],
  temperature   FLOAT,
  top_p         FLOAT,
  loadout_json  JSONB                    -- fertiger loadouts.json-Block
);
```

## Dateien

| Datei | Zweck |
|-------|-------|
| `scripts/finetune/model-registry.sh` | CLI-Tool |
| `scripts/finetune/eval-runner.sh` | Adapter gegen Harness evaluieren |
| `scripts/finetune/stat-collector.sh` | VRAM/Durchsatz messen (llama.cpp bench) |
| `scripts/finetune/registry-db.sql` | DB-Migration |
| `migrations/<ts>-model-registry.sql` | Produktions-Migration |
| `tests/spec/finetune/model-registry.bats` | BATS-Tests |

## Verifikation

```bash
# Adapter evaluieren
bash scripts/finetune/model-registry.sh eval gemma-scout-v1 scout
# Stats messen
bash scripts/finetune/model-registry.sh stats gemma-scout-v1
# Registry abfragen
bash scripts/finetune/model-registry.sh list --role scout --min-score 0.7
# loadouts.json-Block exportieren
bash scripts/finetune/model-registry.sh export-loadout gemma-scout-v1
```
