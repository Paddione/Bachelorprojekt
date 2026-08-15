# Proposal: s3-finetune-dataset-recipe

## Why

S3 aus der Laptop-bge-Topologie (T006143, Design-Doc E5): Die Unterstützermodelle
(Qwen3.5-4B auf PK-L-1, Gemma-4-12B auf PK-Tablet) sollen mit der bestehenden
Finetune-Pipeline (`scripts/finetune/`, Unsloth/TRL) auf die eigenen Factory-Konventionen
feingetunt werden. Der Korpus (Factory-Traces, verify+done) ist heute zu dünn
(~100–200k Tokens aus reinen Phase-Events); erst die Anreicherung um Ticket-Beschreibung
und Kommentare hebt ihn auf LoRA-taugliche ~350–500k Tokens (MESSUNGEN im Design-Doc
`2026-08-15-s3-finetune-dataset-recipe-design.md`). Die Vorbedingung — der
Collector-Erfolgsfilter `verify + done` (T006282) — ist seit PR #4524 auf `main`.

Dieser Change baut die Vorbereitung bis zum **DRY_RUN-grünen Trainingslauf**: der
angereicherte Korpus existiert, alle Recipe-Gates (measure → guard → train DRY_RUN)
sind durchlaufen, und der Messbericht liegt vor. Der eigentliche GPU-Lauf sowie das
Eval-Gate (T002606-Muster) sind bewusst ein **eigenes Lauf-Ticket** (E6: das
Kapazitätsfenster auf der Serving-GPU wird dort geplant).

## What

1. **Anreicherungs-Change am Collector** (`scripts/finetune/collect_factory_traces.py`):
   Flag-gesteuertes `--with-context`, das Ticket-Beschreibung und Kommentare als
   chronologische Turns in das TRL-Chat-Format rendert. Rollen-Mapping nach E7
   (`claude-code`/`factory` → assistant, übrige → user). Secret-Redaktion erstreckt
   sich auf alle neuen Felder. Default aus → bestehende Fixture-Tests bleiben gültig.
   `task finetune:traces` reicht das Flag durch.
2. **Korpus-Zug (Stufe 1):** ROWS_JSON + Kommentare über die dokumentierten SQLs,
   Ausgabe als JSONL nach `outputs/finetune/` (gitignored). DSGVO-Stichproben-Pass
   auf Personen-/Brand-Daten vor dem Export.
3. **Recipe-Gates bis DRY_RUN:** `finetune:measure` (max_seq_length + Machbarkeit),
   `finetune:guard` (Hub-Template als Referenz), `finetune:train DRY_RUN=1`.
   Ergebnis ist der Messbericht als Artefakt.
4. **E5-Gate:** Unsloth-Support für Qwen3.5 verifizieren (unsloth-buddy);
   Fallback TRL dokumentiert, Entscheidung nach Befund.
5. **Tests:** BATS-Erweiterung in `tests/spec/unsloth-training-env/factory-traces.bats`
   (Output-Verifikation, Positiv-Anker) für das neue Flag-Verhalten.

**Nicht im Scope:** GPU-Lauf selbst + Eval-Gate (Folge-Ticket), Gemma-4-12B (Lauf 2),
Stufe-2-Dataset (OpenThoughts3), Deployment auf die Geräte (S2/T006143).

_Ticket: T006252_
