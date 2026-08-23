---
title: "p2-evaluation-doc"
ticket_id: T015248
domains: [llm, finetune, docs]
status: active
---

# Partial p2 — Evaluations-Dokument (Empfehlung + Trainingsplan)

Schreibt die begründete Empfehlung je Rolle auf Basis der Matrix aus p1.
Diese Datei ist das eigentliche Ticket-Deliverable.

### Task 1: Dokument schreiben

**Files:** `docs/finetune/tandem-model-evaluation.md`

Struktur:

1. **Ausgangslage** — Residentmodell, GPU-Budget (16 GB geteilt, sequenziell
   via exclusiveGroup chat-gpu), Pipeline-Basis aus Lauf 1.
2. **Methodik** — Kriterien aus design.md D3/D4/D5; Eval-Protokoll:
   eval_harness.py Paired Measurement (Worker-Rolle), Intent-Micro-Bench auf
   Factory-Trace-Testset (Router-Rolle), Tokenizer-Match-Prüfung (Draft-Rolle).
3. **Empfehlung je Rolle** — Gewinner + Begründung + verworfene Alternativen
   (mit Verweis auf die Matrix-Verdicts, keine neuen Zahlen).
4. **Trainingsplan je Empfehlung** — Korpusquelle (collect_factory_traces.py
   bzw. extern), LoRA-Parameter-Basis aus `outputs/lauf1-config.json`,
   template_guard-Pflicht, GGUF-Export via export_gguf.py, Eval-Akzeptanz-
   kriterien (Paired Measurement Schwellen).
5. **Folge-Tickets** — konkrete Vorschläge für Umsetzungs-Tickets
   (Training/Export/Loadout-Integration; Loadout-Änderungen koordiniert mit
   T015175, nicht parallel).

Pflicht: jede Empfehlung erfüllt die harten Kriterien (≤ 8B, GGUF-exportierbar,
QLoRA-VRAM-Fit 16 GB geteilt); Draft-Empfehlung mit belegtem Tokenizer-Match.
Kein Platzhalter in der Prosa.
