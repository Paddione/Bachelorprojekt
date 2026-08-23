---
title: "p1-candidates-matrix"
ticket_id: T015248
domains: [llm, finetune]
status: active
---

# Partial p1 — Kandidaten-Matrix

Erstellt die strukturierte Bewertung verfügbarer ≤8B-Modelle gegen die drei
Tandem-Rollen. Grundlage: `proposal.md`, `design.md` (D3/D4/D7), Lauf-1-
Artefakte unter `scripts/finetune/outputs/`.

### Task 1: Matrix anlegen

**Files:** `docs/finetune/tandem-candidates.json`

Schema (pro Kandidat):

```json
{
  "slug": "qwen35-text-4b",
  "family": "Qwen3.5",
  "params_b": 4,
  "gguf_exportable": true,
  "tokenizer_match_with_resident": null,
  "roles": {
    "draft":   { "fit": "candidate|excluded|recommended", "reasons": ["…"] },
    "router":  { "fit": "…", "reasons": ["…"] },
    "worker":  { "fit": "…", "reasons": ["…"] }
  },
  "qlora_vram_fit_16gb_shared": true,
  "evidence": ["scripts/finetune/outputs/lauf1-eval-report.json"]
}
```

Pflicht:

1. Mindestens 4 Kandidaten: mind. 2 aus der Qwen3.5/3.6-Familie
   (Pipeline-Erfahrung aus Lauf 1) + mind. 2 Kontrastfamilien
   (z. B. Gemma-4-, Llama-/GLM-Klasse ≤ 8B).
2. Jede der drei Rollen hat ≥ 1 bewerteten Kandidaten; Verdict-Werte nur
   `candidate|excluded|recommended`.
3. Draft-Rolle: `tokenizer_match_with_resident` ist ein hartes Kriterium —
   Kandidaten ohne Match bekommen in Rolle draft zwingend `excluded`
   mit Begründung (design.md D3).
4. Alle Zahlenangaben (params_b, VRAM-Schätzungen) mit `evidence`-Beleg
   (Lauf-1-Messungen, Modellkarten, unsloth.ai-Docs) — keine unbelegten Werte.
5. Kein Platzhalter (`TBD`/`TODO`) in der Prosa.
