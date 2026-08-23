# Proposal: tandem-small-models

## Why

Das FreeToken-Residentmodell läuft solo auf der RTX 5070 Ti (16 GB). Kleine
Open-Weight-Modelle (≤ 8B) können in Tandem mit ihm drei Rollen übernehmen:
(a) Draft-Modell für Speculative Decoding, (b) Mini-Router/Intent-Classifier
(lokal vs. cloud vs. escalate), (c) günstiger Background-Worker
(Summarize/Tag/Extract). Es fehlt eine begründete Entscheidungsgrundlage,
WELCHE Modelle in WELCHER Rolle trainiert werden — Lauf 1 (Qwen-3.5-Text-4B-
LoRA, T002587/T002606) bewies die Pipeline, aber nicht die Rollen-Eignung.

Dieses Ticket liefert die **Empfehlung + den Trainingsplan** (Forschungs-
Deliverable); die Umsetzung folgt in Folge-Tickets.

## What

1. **Kandidaten-Matrix** (`docs/finetune/tandem-candidates.json`): strukturierte
   Bewertung verfügbarer ≤8B-Modelle gegen alle drei Rollen mit harten
   Kriterien: Parametergrenze, GGUF-Exportfähigkeit (llama.cpp-Loadout-Setup),
   Tokenizer-Kompatibilität mit dem Residentmodell (hartes Kriterium für die
   Draft-Rolle — Speculative Decoding braucht vocab match), QLoRA-VRAM-Fit
   auf 16 GB geteilt mit Serving.
2. **Evaluations-Dokument** (`docs/finetune/tandem-model-evaluation.md`):
   begründete Empfehlung je Rolle + Trainingsplan pro empfohlenem Modell
   (Korpusquelle, LoRA-Parameter-Basis aus Lauf 1, Eval-Protokoll via
   `scripts/finetune/eval_harness.py` Paired Measurement).
3. **Guard-Test** (`tests/spec/finetune-tandem-eval.bats`): strukturelle
   Validierung beider Artefakte (Matrix deckt 3 Rollen ab, jede Empfehlung
   erfüllt die harten Kriterien).

Delta-Spec: ADDED Requirement im SSOT `openspec/specs/unsloth-eval-harness.md`.

## Out of Scope

- tatsächliches Training/Export der Modelle (Folge-Tickets)
- Änderungen an loadouts.json / agent-models.jsonc (kollidiert mit T015175)

_Ticket: T015248_
