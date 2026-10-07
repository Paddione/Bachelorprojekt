# Qwen3.5-9B Planner-Finetune (Budget ≤ 10 €)

Stand 2026-10-04. Ergebnis der Brainstorming-Session. Ersetzt die Annahme „9B nur auf gemieteter GPU“
aus `ml/qwen35-agents/README.md`.

## 1. Ziel und Rahmen

**Vom User festgelegt:**
- Ein Finetune von `Qwen/Qwen3.5-9B`. Budget höchstens 10 € gesamt.
- Vision, Thinking- und Non-Thinking-Modus bleiben nutzbar. MTP bleibt erhalten, wenn möglich.
- Zweck: allgemein gut bleiben und als Planner im Bachelorprojekt-Agentensystem besser werden.

**Entscheidung im Design (begründet in §2):**
- Eine Trainingsstufe statt zwei. Kein „allgemeines Qualitäts-SFT“.
- Daten kostenlos: Gold-Pläne aus dem Repo, selbst erzeugte und per Verifier gefilterte Pläne,
  Replay der Basismodell-Ausgaben zum Erhalt der Modi.
- Training lokal auf der RTX 5070 Ti (QLoRA). Kaggle 2×T4 als kostenloser Ausweichpfad.
  Die 10 € sind Reserve, nicht eingeplant.
- Multi-Agent statt MTP entfällt, weil MTP per Graft erhalten bleibt (§5).

**Erfolg heißt:**
1. Planner: plan-lint-Passrate auf zurückgehaltenen Tickets mindestens 10 Prozentpunkte über dem Basismodell.
2. Keine Regression: Non-Think, Think und Vision höchstens 2 Prozentpunkte unter dem Basismodell.
3. MTP: Decode-Durchsatz höchstens 5 % unter dem Basismodell (bestehende Repo-Regel).

## 2. Warum kein allgemeines Qualitäts-SFT

Qwen3.5-9B ist bereits vom Hersteller nachtrainiert. Öffentliche SFT-Datensätze (smoltalk2,
OpenThoughts3, Nemotron) stammen von Lehrern auf Qwen3-32B/QwQ-Niveau, also nicht klar stärker als
das Zielmodell. Training darauf verschiebt den Stil und kostet messbar Qualität. Ein stärkerer Lehrer
(Qwen3.5-397B-A17B, deepinfra 0,45 $/M in, 3,00 $/M out, abgefragt 2026-10-04 über
`router.huggingface.co/v1/models`) würde für 50k Samples rund 300 $ kosten. Mit 10 € ist allgemeine
Verbesserung nicht erreichbar. Erreichbar ist: Spezialisierung ohne Verlust.

## 3. Bausteine

Alles unter `ml/qwen35-planner-9b/`. Jeder Baustein ist ein eigenes Skript mit Ein- und Ausgabedatei,
einzeln testbar.

| Code | Datei | Aufgabe | Eingabe → Ausgabe |
|---|---|---|---|
| U1 | `prompts.py` | Planner-Prompts aus der Ticket-DB bauen, Split nach `areas` (nicht zufällig) | `ticket.sh list` → `data/prompts_{train,heldout}.jsonl` |
| U2 | `gold.py` | Gold-Paare Auftrag → Plan aus der **gesamten Git-Historie** (letzte Version je Pfad) | 2372 Plan-Dateien → `data/gold.jsonl` |
| U3 | `generate.py` | k=4 Kandidaten pro Prompt mit dem Basismodell, Think-Modus | lokaler `llama-server` → `data/candidates.jsonl` |
| U4 | `verify.py` | Kandidaten durch `scripts/plan-lint.sh` schicken, Secrets- und Dedupe-Gate aus `qwen35-agents/schema/validate.py` | → `data/rft.jsonl` (nur PASS) |
| U5 | `replay.py` | Antworten des Basismodells auf fremde Prompts, Non-Think, Think und Vision | smoltalk2- und FineVision-Prompts → `data/replay.jsonl` |
| U6 | `mix.py` | Mischung und Chat-Template mit `enable_thinking` pro Sample | → `data/train.jsonl`, `data/val.jsonl` |
| U7 | `train.py` | unsloth QLoRA | → `out/lora/` |
| U8 | `export.py` | Merge auf BF16, `mtp.*`- und `visual.*`-Tensoren aus dem Original einsetzen, GGUF + Quantisierung | → `out/merged/`, `out/gguf/` |
| U9 | `evaluate.py` | Gates G1 bis G3 Basis gegen Tuned | → `out/eval.json` |

## 4. Daten

**Datenmenge (gemessen 2026-10-04):**
```bash
git log --all --format='%H' --name-only --diff-filter=AM -- '.agents/plans/*/tasks.md' \
  '.agents/plans/*/tasks.d/*.md' 'openspec/changes/*/tasks.md' 'openspec/changes/*/tasks.d/*.md' \
  'docs/superpowers/plans/*.md'   # PRE=1d8e5b78e, letzte Version je Pfad
```
2372 Plan-Dateien (47 tasks.md, 707 Partials, 1131 OpenSpec, 487 Superpowers), 3,3 Mio. Wörter,
Median 605, p90 3844. 2002 tragen eine Ticket-ID, 358 davon mit Ticketbeschreibung in der DB.

**Prompt pro Gold-Plan:** Ticketbeschreibung aus der DB, wenn vorhanden. Sonst Titel und
Ziel-/Why-Abschnitt des Plans selbst, die dann aus dem Ziel-Text entfernt werden. Jeder Prompt nennt
das verlangte Format (`tasks.md-Index`, `Partial`, `OpenSpec-legacy`, `Superpowers-legacy`), damit
alte Formate nichts verwässern. G1 fragt immer das aktuelle Format ab.

**Genug Daten für eine messbare Verbesserung:** Untergrenze für den Start des Trainings sind
1500 Gold-Paare nach Dedupe und 500 RFT-Samples. U6 bricht ab, wenn eine Grenze unterschritten ist.

| Anteil | Quelle | Modus | Zweck |
|---|---|---|---|
| ~50 % | U2 Gold-Pläne (Historie) | Non-Think (kein Denktext vorhanden) | Zielformat und Repo-Wissen aus echten Plänen |
| ~20 % | U4 gefilterte Eigenkandidaten (Rejection-Sampling-Finetune) | Think | Planen mit Denkspur |
| ~18 % | U5 Replay Text | 9 % Non-Think, 9 % Think | Modi erhalten |
| ~12 % | U5 Replay Vision | gemischt | Vision erhalten |

- Generierung lokal: `~/opt/llama-current/bin/llama-server` mit
  `/mnt/f/models/lmstudio-community/Qwen3.5-9B-GGUF/Qwen3.5-9B-Q4_K_M.gguf` plus `mmproj-…-BF16.gguf`,
  4 parallele Slots. Obergrenze 10M generierte Token (Schätzung ~10 h über Nacht, 0 €).
- Replay-Ziele sind die Ausgaben des Basismodells selbst. Fremde Antworten aus FineVision und smoltalk2
  werden verworfen, nur die Prompts werden genutzt. Das hält den Stil unverändert.
- Held-out: Tickets aus 2 bis 3 ganzen `areas`, gleich für Basis und Tuned. Nie im Training. Gold-Pläne,
  deren Ticket-ID im Held-out liegt, fliegen ebenfalls aus dem Training (sonst Leckage).
- Umfang: Gold ~4,5M Tokens, Gesamtmix ~9M Tokens, 2 Epochen. Bei geschätzt ~600 Tokens/s
  (9B-QLoRA, 5070 Ti) rund 8 bis 9 h. Die tatsächliche Rate misst der Smoke-Lauf in U7.
- Pro Sample Provenance: Quelle, Generator, Modus, plan-lint-Ergebnis.
- plan-lint rechnet S1-Budgets gegen den aktuellen Repo-Stand. Gold-Pläne werden deshalb nicht neu
  gelintet (ältere scheitern an Drift, z. B. B1a). U4 und G1 laufen gegen einen festen Commit, der
  in `out/eval.json` steht. Basis und Tuned werden am selben Commit gemessen.

## 5. Training und MTP

**Training (U7):** `unsloth/Qwen3.5-9B`, 4-bit QLoRA, LoRA r=32, α=32 auf allen Linear-Layern des
Sprachmodells inklusive der Linear-Attention-Projektionen, Vision-Tower eingefroren. Kontext 16k,
Batch 1, Grad-Accum 8, lr 1e-4 cosine, 2 Epochen, Eval auf `val.jsonl` jede 100 Steps. Loss nur auf
Assistant-Tokens. Umgebung: das bestehende `ml/qwen35-training/train` (torch 2.12.1, unsloth
2026.9.14), `CUDA_VISIBLE_DEVICES=1`. Das Ladeprofil muss die Vision-Klasse sein, weil die
Text-Klasse `model.visual.*` beim Laden verwirft.

**MTP-Befund:** Der Checkpoint enthält einen MTP-Kopf (`mtp_num_hidden_layers: 1`, 15 Tensoren).
transformers verwirft `^mtp.*` beim Laden (`modeling_qwen3_5.py:794`). unsloth entfernt beim Export
nur den Config-Schlüssel (`unsloth_zoo/saving_utils.py:3313`). Ein normaler Merge liefert also ein
Modell ohne MTP.

**Lösung (U8):** Nach dem Merge die 15 `mtp.*`-Tensoren und alle `visual.*`-Tensoren unverändert aus
dem Original-Safetensors in den Merged-Checkpoint schreiben, `mtp_num_hidden_layers` wieder setzen,
dann GGUF bauen. Der MTP-Kopf passt danach nicht mehr exakt zum veränderten Trunk. Wie viel
Akzeptanz das kostet, misst G3. Fällt G3 durch: LoRA-Rank auf 16 senken und neu trainieren.
Ein eigenes MTP-Kopf-Training ist ausdrücklich nicht Teil dieses Specs.

## 6. Hardware und Kosten

| Pfad | GPU | Kosten | Rolle |
|---|---|---|---|
| Lokal | RTX 5070 Ti 16 GB | 0 € | Standard für U3, U5, U7, U9. 9B-QLoRA passt laut `ml/qwen35-training/README.md` |
| Kaggle | 2×T4 16 GB, 30 h/Woche | 0 € | Ausweichpfad für U7, wenn lokal OOM. T4 hat kein bf16 → fp16 |
| GCP Spot | L4 24 GB | Reserve ≤ 10 € | Nur wenn beide oben scheitern. `gcloud` ist nicht installiert, Preis vor Nutzung prüfen |

Kaggle-Credentials liegen in `~/.kaggle/credentials.json`. Die Notebooks aus
`ml/qwen35_pipe_2026_10_04/notebooks` dienen als Vorlage.

## 7. Bewertung (U9)

Basis und Tuned laufen beide als GGUF Q4_K_M über denselben `llama-server` mit identischen Flags.

| Gate | Messung | Schwelle |
|---|---|---|
| G1 Planner | plan-lint-Passrate auf Held-out-Tickets, 1 Sample pro Ticket, Think | Tuned ≥ Basis + 10 pp |
| G2a Non-Think | IFEval (strict prompt-level), volles Set | ≥ Basis − 2 pp |
| G2b Think | MMLU-Pro, feste 500er-Stichprobe (Seed im Repo) | ≥ Basis − 2 pp |
| G2c Vision | ChartQA test, feste 500er-Stichprobe | ≥ Basis − 2 pp |
| G3 MTP | `ml/qwen35-agents/eval/mtp_bench.py --compare` | Durchsatz ≥ 95 % der Basis |

Jeder Gate-Lauf schreibt Befehl, Commit-Stand und Ergebnis in `out/eval.json` (Mess-Konvention T002717).

## 8. Fehlerfälle

- plan-lint lehnt fast alle Kandidaten ab (< 5 % PASS): k auf 8 erhöhen. Bleibt es unter
  500 RFT-Samples, bricht U6 ab (§4), und der Fall wird mit Zahlen gemeldet, statt dünn zu trainieren.
- OOM lokal bei 16k Kontext: erst auf 8k reduzieren, dann Kaggle.
- G2 fällt durch: Replay-Anteil auf 50 % erhöhen, 1 Epoche statt 2.
- Ein Graft-Tensor fehlt oder hat die falsche Form: Export bricht ab, nichts wird quantisiert.

## 9. Nicht-Ziele

- Allgemeine Qualitätssteigerung über das Basismodell hinaus.
- Bezahlte Lehrer-Modelle, Full-Finetune, DPO und GRPO.
- Eigenes Training des MTP-Kopfs.
- Die anderen Rollen (0.8B, 2B, 4B) aus `qwen35-agents`.
