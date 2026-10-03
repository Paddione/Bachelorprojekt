# DATASET_PLAN.md — Bachelorprojekt-Assistent SFT-Datensatz (≥1000 unique)

> Zielmodell: `unsloth/Qwen3-4B-Instruct-2507` (non-thinking Instruct) — ersetzt den
> eingestellten Qwen2.5-7B-BP-Finetune. Einsatzzweck: Workspace-Assistent auf der
> :8080-Worker-Rail (RTX 3060 Ti, 3 Slots, Alias bleibt `Qwen3-4B-2507`).
> Format: TRL-SFT `messages` (system/user/assistant), Chat-Template non-thinking.
> Kein Reasoning-Format nötig (Instruct-2507 generiert keine `<think>`-Blöcke).

## 0. Rollengrenze (von Anfang an mitdenken)

- **Instruct, non-thinking, Execution-only.** Dieses Modell plant nicht, denkt
  nicht und orchestriert nicht — Planning/Live-Ops läuft auf Cloud oder der
  27B-Rail (:1919) und wird hier NICHT trainiert.
- Konsequenz: Bench-Korpus-Trajektorien nur mit `role=code-worker` übernehmen
  (`--corpus`-Filter, `EXECUTION_ROLES`); Planner/Reviewer-Inhalte fallen weg.
- Refusal/Stale-Domains lehren die Grenze aktiv („dafür bin ich nicht da“).

## 1. Uniqueness-Definition (was „unique" heißt)

Ein Eintrag zählt als unique, wenn er nach der Dedup-Pipeline überlebt:

1. **Normalisierung** der Frage: lowercase, Satzzeichen/Whitespace kollabiert.
2. **Exact-Dedup**: identischer normalisierter Fragen-Hash → nur 1. Autor behält.
3. **Near-Dedup**: 3-Gram-Shingles der Frage, Jaccard ≥ 0.60 → Zwillings-Drop
   (erster Autor gewinnt). Fängt „Quick question: {X}"-Inflation ab, die den
   alten Qwen2.5-Datensatz aufgebläht hat.
4. **Mindestlänge**: Frage < 12 Zeichen normalisiert → Drop.
5. **Antwort-Kappe**: max. 4 Einträge mit identischem Antwort-Kern pro Domain
   (verhindert Antwort-Echo-Variationen).

Gezählt wird post-Dedup. `generate_dataset.py` schreibt die Histogramme nach
`dataset_stats.json` — die Zahl dort ist die einzige gültige Unique-Zählung.

## 2. Coverage-Matrix (Ziel: ~1250 raw → ≥1050 unique)

| # | Domain | Unique-Ziel | Quelle der Fakten |
|---|--------|-------------|-------------------|
| 1 | `cli` — Task Oracle, `task`-Targets, `vda.sh`-Subcommands | 150 | AGENTS.md, Taskfile.yml |
| 2 | `arch` — Fleet-Topologie, Contexts, Brands, DNS, DB | 120 | AGENTS.md, reference.md |
| 3 | `gotchas` — Footguns (env-resolve, ticket_plans, port-forward, …) | 180 | AGENTS.md, gotchas-footguns.md |
| 4 | `workflow` — Git, Tickets, Plans, dev-flow, Merge-Regeln | 140 | AGENTS.md, Runbooks |
| 5 | `agents` — Routing, Locks, Messaging, Escalation, Footer | 120 | AGENTS.md, agents.yaml |
| 6 | `ci` — CI-Gates, BATS-Runner, Test-Inventar, Digest-Pinning | 90 | AGENTS.md, ci.yml |
| 7 | `llmstack` — :1919/:8080-Rails, Quant-Klassen, KV, GPU-Lock | 120 | agent-models.jsonc, Measurements |
| 8 | `components` — pnpm/npm-Konventionen, Website/Brett | 60 | AGENTS.md |
| 9 | `runbooks` — Credentials, git-crypt, Sealed-Secrets-Bring-up | 80 | docs/runbooks/ |
| 10 | `refusal` — Out-of-Scope-Guard (Anti-Halluzination) | 30 | kuratiert |
| 11 | `stale` — Recovery aus veralteten Fakten (:1920, korczewski, FreeToken…) | 40 | kuratiert |
| 12 | `deutsch` — deutsche Workspace-Queries | 40 | kuratiert |
| 13 | `multiturn` — 2–3-Turn-Szenarien (Debugging, Deploys, Summary) | 60 | kuratiert |

## 2b. Robustness-Mixe (post-Generierung)

- **System-Prompt-Mix**: 70 % BP-Assistent / 10 % kein System / 10 % Worker-Style /
  10 % deutsch — gegen Harness-Prompt-Drift.
- **Sprach-Mix**: ~10 % deutsche Einträge (T1 `deutsch`-Domain + Teacher-de-Runden).
- **Format-Mix**: Q/A + Summary/Triage-Angles + Multi-Turn.

## 3. Generierung in drei Stufen

### T1 — Deterministisch (fact-base × stem-bank, offline, stdlib-only)
- `generate_dataset.py` enthält eine kuratierte Fact-Base (~170 verifizierte
  Fakten) mit je 2–4 handgeschriebenen Frage-Stem-Varianten — echte
  Umformulierungen, keine Präfix-Inflation.
- Läuft ohne GPU/Netz: `python3 .agents/training/generate_dataset.py`
- Erwartung: ~500–650 unique. Ist das **Skelett** und die Qualitäts-Basis.

### T2 — Teacher-Scale-up (lokaler 27B auf :1919)
- Die Qwen3.8-27B IQ3_XXS-Rail (:1919, Orchestration-Bench 15/15, valides
  JSON) generiert pro Domain neue Q/A-Paare, **grounded in drei Quellen**:
  1. `docs` — echte Repo-Docs als Chunks (AGENTS.md, Runbooks, gotchas, runtimes)
  2. `k1` — bge-mcp `bge_rerank` (:13005) semantisch bester Chunk-Selektion
  3. `k3` — codebase-memory-mcp `search_graph` (Repo-Graph-Fakten)
  Jede Runde bekommt den Kontext injiziert („answers MUST stay consistent“);
  `dataset_stats.json` zeigt, welche Quellen live waren.
- Sprach-Rotation: jede 3. Themenrunde generiert deutsch (`lang=de`).
- Aufruf: `python3 .agents/training/generate_dataset.py --teacher --qc --target 1100`
- Sequential über den 1-Slot-Worker: ~1,5–2,5 h mit QC, inference-only.

### T2b — QC-Judge-Pass (`--qc`)
- Der 27B bewertet jedes Teacher-Paar (Batch 8): `correct | wrong | unsure`.
- `wrong` → Drop; `unsure` → bleibt, wird aber in `dataset_stats.json` gezählt.
- Ersetzt T3 nicht — reduziert aber die Fehlerdichte vor dem Human-Gate.

### T2c — Optionaler Execution-Korpus (`--corpus`)
- `bench.mjs export-corpus` erzeugt echte Agenten-Trajektorien. Nur
  `role=code-worker` wird gemischt (Rollen-Grenze §0); Format `{messages, meta}`.

### T3 — Human-QC-Gate
- 5 % Zufallsstichprobe (min. 50) manuell gegen Repo-Docs prüfen; Kaputt-Gefundenes
  löscht die ganze Teacher-Batch des betroffenen Themas.

## 4. Qualitäts-Gates (jedes Eintrag)

1. **Faktentreue**: Antwort muss aus AGENTS.md/Runbooks/agent-models.jsonc
   belegbar sein — keine erfundenen Ports, Ticket-IDs oder Befehle.
2. **Keine Secrets**: Niemals Credentials/Token-Werte; Runbook-Verweise statt Werte
   (credentials-finden.md-Konvention).
3. **Antwortform**: 1–6 Sätze + Codeblock wo sinnvoll; direkt ausführbar.
4. **Sprache**: Englisch dominiert (Abfrage-Sprache der Tests), deutsche
   Begriffe erlaubt, aber konsistent.
5. **Anti-Halluzination**: `refusal`-Domain lehrt „außerhalb des Workspace →
   sagen, dass man es nicht weiß" statt zu raten.

## 5. Split & Artefakte

```
.agents/training/
├── dataset.jsonl          # voller deduplizierter Satz (messages-Format)
├── dataset_train.jsonl    # 95 %
├── dataset_val.jsonl      # 5 %  (gleiche Dedup-Grenze über beide — kein Leak)
└── dataset_stats.json     # Unique-Zählung, Domain-Histogramm, Dedup-Statistik
```

Val-Split wird NACH der Dedup gezogen, damit keine Near-Dups über Split-Grenzen
laufen (Leak-Schutz).

## 6. Ausführungs-Checkliste

- [x] T1 erzeugen und Unique-Zahl in dataset_stats.json prüfen
- [x] T2 `--teacher --target 1100` auf :1919 laufen lassen (45–90 min)
- [ ] T3 5 %-Stichprobe manuell prüfen
- [ ] `dataset_stats.json` mit ≥1000 unique abhaken
- [ ] `train_5070ti.py` (GPU-Preflight beachten: 27B-Rail stoppen)
