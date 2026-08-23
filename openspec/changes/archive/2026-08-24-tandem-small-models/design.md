---
ticket_id: null
plan_ref: null
status: active
date: 2026-08-23
---

# Design: tandem-small-models

_Ticket: T015248 · Tandem-Kleinstmodelle-Evaluation_

## Entscheidungen

| # | Frage | Entscheidung | Begründung |
|---|-------|--------------|------------|
| D1 | Deliverable-Ort | `docs/finetune/` (neu) | Durable Doku neben audits/drift-reports-Konvention; Folge-Tickets referenzieren sie. |
| D2 | Matrix-Format | JSON (`tandem-candidates.json`) | Maschinenlesbar für den Guard-Test und Folge-Tickets; Schema: kandidat → rollen → kriterien → verdict. |
| D3 | Draft-Rollen-Kriterium | Tokenizer/Vocab-Match mit Residentmodell ist HART | Speculative Decoding scheitert an vocab mismatch; Kandidaten ohne Match scheiden für Rolle (a) aus, egal wie gut sonst. |
| D4 | VRAM-Kriterium | QLoRA-Trainingsfit auf 16 GB geteilt mit Serving (exclusiveGroup chat-gpu — sequenziell) | Messbasis: measure_corpus.py-VRAM-Matrix aus Lauf 1. |
| D5 | Eval-Protokoll | eval_harness.py Paired Measurement (SSOT unsloth-eval-harness) für Worker-Rolle; Router-Rolle über Intent-Micro-Bench (Testset aus Factory-Traces) | Rollengerechte Messung statt Einheits-Benchmark. |
| D6 | Plan-Form | 3 Partials (Matrix → Doku → Tests), tests last | Disjunkte Dateien; STRUCT-PARTIAL erfüllt. |
| D7 | Modellquellen | Primär Qwen3.5/3.6-Familie (Lauf-1-Pipeline-Erfahrung) + mind. 2 Alternativfamilien als Kontrast | Pipeline-Kompatibilität ist bewiesen, Kontrast verhindert Bestätigungsfehler. |

## Randbedingungen

- FreeToken serviert GGUF nur für Gemma-Architekturen — Nicht-Gemma-Tandem-
  modelle ride den llamacpp-Fallback-Pfad (vgl. T015175).
- Trainingsequenz mit Serving exklusiv (chat-gpu exclusiveGroup).
