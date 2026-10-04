# Qwen3.5-9B Planner-Finetune Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native, vom User mit „zieh durch“ gewählt). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine lokal laufende Pipeline, die aus Repo-Historie und Selbstgenerierung einen geprüften Trainingsmix baut und Qwen3.5-9B per QLoRA trainings- und exportbereit macht.

**Architecture:** Neun kleine Python-Skripte unter `ml/qwen35-planner-9b/planner/`, je ein Baustein U1–U9 aus dem Spec, verbunden nur über JSONL-Dateien in `data/` und Artefakte in `out/`. Reine Logik (Prompt-Bau, Extraktion, Mix, Graft) ist pytest-getestet. GPU- und Netzwerkteile haben `--dry-run` oder `--limit` für Smoke-Läufe.

**Tech Stack:** Python 3.12, uv, pytest, safetensors, PIL, requests. Training im bestehenden Env `~/Bachelorprojekt/ml/qwen35-training/train/.venv` (unsloth 2026.9.14, torch 2.12.1, trl 0.24). Inference und Bewertung über `~/opt/llama-current/bin/llama-server`.

**Spec:** `docs/superpowers/specs/2026-10-04-qwen35-9b-planner-finetune-design.md`

**Ticket:** T901060 · Branch `feature/qwen35-9b-planner-T901060`

## Global Constraints

- Budget höchstens 10 €. Kein bezahlter Lehrer, keine Cloud-API.
- Basis `Qwen/Qwen3.5-9B` (BF16-Safetensors), Training `unsloth/Qwen3.5-9B` 4-bit QLoRA, LoRA r=32, α=32, Vision eingefroren.
- GPU-Pin: `CUDA_DEVICE_ORDER=PCI_BUS_ID CUDA_VISIBLE_DEVICES=1` (5070 Ti).
- Untergrenzen vor dem Training: ≥ 1500 Gold-Paare nach Dedupe, ≥ 500 RFT-Samples.
- Mix-Anteile: Gold 50 %, RFT 20 %, Replay-Text 18 %, Replay-Vision 12 %.
- Held-out-Tickets und ihre Gold-Pläne kommen nie ins Training.
- Gates: G1 plan-lint ≥ Basis + 10 pp, G2 IFEval/MMLU-Pro/ChartQA ≥ Basis − 2 pp, G3 MTP-Durchsatz ≥ 95 % der Basis.
- Jede Messung speichert Befehl und Commit (T002717).

## Review Focus

1. Plan-Text ohne Ziel-Abschnitt: Der Prompt-Bau darf nicht leer werden. Solche Pläne werden verworfen (Test in Task 2).
2. Ticket-ID im Plan, die im Held-out liegt: Der Plan muss verschwinden, auch wenn er mehrere IDs nennt (Test in Task 2).
3. Kandidat ohne schließendes `</think>` oder mit leerem Plan: Er wird verworfen, nicht als leerer Plan gelintet (Test in Task 3).
4. Zu wenig Daten: `mix.py` bricht mit Exit 2 und Zahlen ab, statt dünn zu mischen (Test in Task 5).
5. Graft mit falscher Tensorform oder fehlendem Tensor: Export bricht ab, bevor GGUF entsteht (Test in Task 7).

## File Structure

| Datei | Verantwortung |
|---|---|
| `ml/qwen35-planner-9b/pyproject.toml` | uv-Projekt der Pipeline (ohne GPU-Stack) |
| `ml/qwen35-planner-9b/README.md` | Ablauf, Befehle, Gates |
| `planner/common.py` | Pfade, JSONL-IO, `make_sample()`, Text-Hash |
| `planner/prompts.py` | U1 Ticket-Prompts, Held-out-Split nach `areas` |
| `planner/gold.py` | U2 Gold-Paare aus der Git-Historie |
| `planner/llm.py` | Minimaler Client für `llama-server` (OpenAI-kompatibel) |
| `planner/generate.py` | U3 k Kandidaten pro Prompt |
| `planner/verify.py` | U4 plan-lint-Filter, Secret-Scan, Dedupe |
| `planner/replay.py` | U5 Replay Text und Vision |
| `planner/mix.py` | U6 Mischung, Untergrenzen, Split |
| `planner/train.py` | U7 QLoRA-Training (läuft im Train-Env) |
| `planner/export.py` | U8 Merge, Graft, GGUF, Quantisierung |
| `planner/evaluate.py` | U9 Gates G1–G3 |
| `tests/test_*.py` | pytest je Baustein |

---

### Task 1: Gerüst und gemeinsame Helfer

**Files:** Create `ml/qwen35-planner-9b/{pyproject.toml,README.md,planner/__init__.py,planner/common.py,tests/test_common.py}`

**Interfaces:**
- Produces: `read_jsonl(path) -> list[dict]`, `write_jsonl(path, rows) -> int`, `text_hash(s: str) -> str` (sha1 über whitespace-normalisierten, kleingeschriebenen Text), `make_sample(prompt: str, answer: str, *, think: str | None, source: str, meta: dict, images: list[str] | None = None) -> dict` mit Schema `{"messages": [...], "enable_thinking": bool, "meta": {...}}`. Bei `think is None` ist `enable_thinking=False` und die Assistant-Antwort beginnt mit `"<think>\n\n</think>\n\n"`. Sonst `"<think>\n" + think + "\n</think>\n\n"`. Bilder als `{"type": "image", "image": <pfad>}`-Blöcke vor dem Text im User-Turn.

- [ ] **Step 1: Test schreiben**

```python
from planner.common import make_sample, text_hash

def test_nonthink_sample_has_empty_think_block():
    s = make_sample("P", "A", think=None, source="gold", meta={})
    assert s["enable_thinking"] is False
    assert s["messages"][1]["content"] == "<think>\n\n</think>\n\nA"

def test_think_sample_wraps_reasoning():
    s = make_sample("P", "A", think="r", source="rft", meta={})
    assert s["enable_thinking"] is True
    assert s["messages"][1]["content"] == "<think>\nr\n</think>\n\nA"

def test_image_blocks_precede_text():
    s = make_sample("P", "A", think=None, source="replay", meta={}, images=["x.png"])
    assert s["messages"][0]["content"][0] == {"type": "image", "image": "x.png"}
    assert s["messages"][0]["content"][1] == {"type": "text", "text": "P"}

def test_text_hash_ignores_whitespace_and_case():
    assert text_hash("A  b\n") == text_hash("a b")
```

- [ ] **Step 2:** `cd ml/qwen35-planner-9b && uv run pytest tests/test_common.py -q` → FAIL (Modul fehlt)
- [ ] **Step 3:** `common.py` implementieren, `pyproject.toml` mit `requires-python=">=3.12"`, deps `requests`, `pyyaml`, `safetensors`, `numpy`, `pillow`, `datasets`, dev `pytest`, `[tool.uv] package=false`, `[tool.pytest.ini_options] pythonpath=["."]`.
- [ ] **Step 4:** Test erneut → PASS
- [ ] **Step 5:** `git commit -m "feat(ml): qwen35-planner-9b scaffold + common helpers [T901060]"`

### Task 2: U1 Prompts und U2 Gold aus der Historie

**Files:** Create `planner/prompts.py`, `planner/gold.py`, `tests/test_prompts.py`, `tests/test_gold.py`

**Interfaces:**
- Consumes: `make_sample`, `text_hash`, `write_jsonl`
- Produces:
  - `prompts.build_prompt(title: str, description: str, fmt: str) -> str` — fester Rahmentext, nennt das Format.
  - `prompts.split_heldout(tickets: list[dict], heldout_areas: set[str]) -> tuple[list, list]` — Ticket ist Held-out, wenn eines seiner `areas` in `heldout_areas` liegt.
  - CLI `python -m planner.prompts --heldout-areas <a,b,c> --out data/` → `prompts_train.jsonl`, `prompts_heldout.jsonl`, `heldout_ids.txt`.
  - `gold.classify(path: str) -> str` ∈ {`tasks-index`, `partial`, `openspec-legacy`, `superpowers-legacy`}
  - `gold.split_goal(text: str) -> tuple[str, str] | None` — Titel + erster Abschnitt namens Goal/Ziel/Why/Warum (oder `**Goal:**`-Zeile) als Auftrag, Rest als Ziel. `None`, wenn nichts gefunden wird.
  - `gold.ticket_ids(text: str) -> set[str]` — Regex `\bT\d{6}\b`
  - CLI `python -m planner.gold --repo <pfad> --heldout data/heldout_ids.txt --tickets data/tickets.json --out data/gold.jsonl`

- [ ] **Step 1: Tests schreiben**

```python
from planner.gold import classify, split_goal, ticket_ids, keep_plan
from planner.prompts import build_prompt, split_heldout

def test_classify():
    assert classify(".agents/plans/x/tasks.md") == "tasks-index"
    assert classify(".agents/plans/x/tasks.d/p1-a.md") == "partial"
    assert classify("openspec/changes/x/tasks.md") == "openspec-legacy"
    assert classify("docs/superpowers/plans/2026-01-01-x.md") == "superpowers-legacy"

def test_split_goal_header_line():
    t = "# Foo Plan\n\n**Goal:** Do X.\n\n### Task 1\nbody"
    prompt, target = split_goal(t)
    assert "Do X." in prompt and "Foo Plan" in prompt
    assert "Do X." not in target and "### Task 1" in target

def test_split_goal_missing_returns_none():
    assert split_goal("# Title\n\njust tasks") is None

def test_ticket_ids():
    assert ticket_ids("fix [T001234] and T900001x T12345") == {"T001234"}

def test_heldout_plan_dropped_even_with_multiple_ids():
    assert keep_plan({"T000001", "T000002"}, heldout={"T000002"}) is False
    assert keep_plan(set(), heldout={"T000002"}) is True

def test_build_prompt_names_format():
    assert "tasks-index" in build_prompt("T", "D", "tasks-index")

def test_split_heldout_by_area():
    tr, ho = split_heldout([{"areas": ["ml"]}, {"areas": ["web"]}, {"areas": None}], {"ml"})
    assert len(ho) == 1 and len(tr) == 2
```

- [ ] **Step 2:** `uv run pytest tests/test_prompts.py tests/test_gold.py -q` → FAIL
- [ ] **Step 3:** Implementieren. `gold.py` liest die Historie mit
  `git -C <repo> log --all --format=%H --name-only --diff-filter=AM -- <5 Pfadmuster aus dem Spec>` (erste Fundstelle je Pfad = neueste Version), Inhalt via `git show <sha>:<pfad>`. Prompt-Quelle: Ticketbeschreibung aus `data/tickets.json`, wenn eine ID des Plans dort steht, sonst `split_goal`. Dedupe über `text_hash(target)`. Ziel-Länge 200 bis 12000 Wörter, sonst verwerfen. Ausgabe über `make_sample(prompt, target, think=None, source="gold", meta={"path","sha","format","ticket_ids"})`.
  `prompts.py` holt Tickets mit `bash scripts/ticket.sh list --limit 5000` und pro Ticket `ticket.sh get --id`, schreibt `data/tickets.json` (id → title, description, areas).
- [ ] **Step 4:** Tests → PASS. Dann echt: `uv run python -m planner.prompts --repo ~/Bachelorprojekt --heldout-areas <drei areas mit zusammen 60–120 Tickets> --out data/` und `uv run python -m planner.gold ...`. Erwartung: `gold.jsonl` ≥ 1500 Zeilen. Zahlen in `data/stats.json` schreiben.
- [ ] **Step 5:** Commit (Code und `data/stats.json`, `data/*.jsonl` per `.gitignore` ausgeschlossen)

### Task 3: U3 Generierung und U4 Verifier

**Files:** Create `planner/llm.py`, `planner/generate.py`, `planner/verify.py`, `tests/test_verify.py`

**Interfaces:**
- Produces:
  - `llm.chat(base_url: str, messages: list, *, think: bool, max_tokens: int, temperature: float, n: int = 1) -> list[dict]` → je Wahl `{"content": str, "reasoning": str}`. Setzt `chat_template_kwargs={"enable_thinking": think}` und liest `reasoning_content`.
  - `verify.parse_candidate(c: dict) -> tuple[str, str] | None` — `(reasoning, plan)`, `None` bei leerem Plan, Plan < 100 Wörter oder einem `<think>`-Rest im Plan.
  - `verify.has_secret(text: str) -> bool` — Muster: `sk-[A-Za-z0-9]{20,}`, `ghp_[A-Za-z0-9]{30,}`, `AKIA[0-9A-Z]{16}`, `-----BEGIN [A-Z ]*PRIVATE KEY-----`, `xox[bp]-`.
  - `verify.lint(plan: str, repo: Path) -> bool` — schreibt in eine Temp-Datei, ruft `bash <repo>/scripts/plan-lint.sh <datei>` mit `cwd=repo`, `True` bei Exit 0 und `PLAN-LINT: PASS` in der Ausgabe.
  - CLI `generate`: `--prompts data/prompts_train.jsonl --k 4 --base-url http://127.0.0.1:19300 --out data/candidates.jsonl --resume` (überspringt fertige Prompt-IDs).
  - CLI `verify`: `--candidates … --repo <worktree> --out data/rft.jsonl` (höchstens ein PASS je Prompt, kürzester gewinnt).

- [ ] **Step 1: Tests schreiben**

```python
from planner.verify import parse_candidate, has_secret

def test_parse_rejects_empty_plan():
    assert parse_candidate({"content": "  ", "reasoning": "x"}) is None

def test_parse_rejects_leftover_think():
    assert parse_candidate({"content": "<think>x " + "w " * 200, "reasoning": ""}) is None

def test_parse_accepts_plan():
    r, p = parse_candidate({"content": "# Plan\n" + "w " * 150, "reasoning": "why"})
    assert r == "why" and p.startswith("# Plan")

def test_secret_patterns():
    assert has_secret("token ghp_" + "a" * 36)
    assert not has_secret("normal text sk-short")
```

- [ ] **Step 2:** `uv run pytest tests/test_verify.py -q` → FAIL
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** Tests → PASS. Smoke gegen den lokalen Server:
  `llama-server -m /mnt/f/models/lmstudio-community/Qwen3.5-9B-GGUF/Qwen3.5-9B-Q4_K_M.gguf --mmproj /mnt/f/models/lmstudio-community/Qwen3.5-9B-GGUF/mmproj-Qwen3.5-9B-BF16.gguf -ngl 999 -c 65536 -np 4 --port 19300 --jinja`
  dann `generate --limit 3` und `verify`. Erwartung: Pipeline läuft, PASS-Rate wird ausgegeben.
- [ ] **Step 5:** Commit

### Task 4: U5 Replay

**Files:** Create `planner/replay.py`, `tests/test_replay.py`

**Interfaces:**
- Consumes: `llm.chat`, `make_sample`
- Produces: CLI `replay --text-n <n> --vision-n <n> --base-url … --out data/replay.jsonl --images-dir data/images`.
  Text-Prompts: erste User-Nachricht aus `HuggingFaceTB/smoltalk2` Config `SFT`, Splits `smoltalk_everyday_convs_reasoning_Qwen3_32B_think` und `smoltalk_systemchats_Qwen3_32B_think` (Streaming, Seed 7). Die Hälfte läuft mit `think=False`, die andere mit `think=True`.
  Vision-Prompts: `HuggingFaceM4/FineVision` Configs `CoSyn_400k_chart`, `CoSyn_400k_document`, `LLaVA_Instruct_150K` (Streaming). Bild nach `data/images/<hash>.png`, erste Frage als Prompt, abwechselnd Think und Non-Think.
  Ziel ist immer die Antwort des Basismodells. Fremde Antworten werden nicht übernommen.
  `replay.pick_user_turn(row: dict) -> str | None` liest die erste User-Nachricht aus `messages` oder `texts[0]["user"]`.

- [ ] **Step 1: Test schreiben**

```python
from planner.replay import pick_user_turn

def test_pick_from_messages():
    assert pick_user_turn({"messages": [{"role": "system", "content": "s"}, {"role": "user", "content": "q"}]}) == "q"

def test_pick_from_finevision_texts():
    assert pick_user_turn({"texts": [{"user": "q", "assistant": "a"}]}) == "q"

def test_pick_none():
    assert pick_user_turn({"foo": 1}) is None
```

- [ ] **Step 2:** FAIL → **Step 3:** implementieren → **Step 4:** PASS, Smoke `--text-n 4 --vision-n 2` → **Step 5:** Commit

### Task 5: U6 Mix mit Untergrenzen

**Files:** Create `planner/mix.py`, `tests/test_mix.py`

**Interfaces:**
- Produces: `mix.build(gold, rft, replay_text, replay_vision, *, seed=7, val_frac=0.03, min_gold=1500, min_rft=500) -> tuple[list, list]`. Wirft `NotEnoughData(msg)`, wenn eine Untergrenze fehlt. Die Gold-Menge ist der Anker mit 50 %. Andere Quellen werden auf ihren Anteil relativ dazu gekappt (RFT 20, Text 18, Vision 12) und nie hochgesampelt. CLI-Exit 2 bei `NotEnoughData`.

- [ ] **Step 1: Test schreiben**

```python
import pytest
from planner.mix import build, NotEnoughData

def rows(n, src): return [{"meta": {"source": src}, "messages": [], "enable_thinking": False}] * n

def test_ratios():
    tr, va = build(rows(2000, "g"), rows(2000, "r"), rows(2000, "t"), rows(2000, "v"), min_gold=10, min_rft=10)
    allr = tr + va
    c = {s: sum(r["meta"]["source"] == s for r in allr) for s in "grtv"}
    assert c["g"] == 2000 and c["r"] == 800 and c["t"] == 720 and c["v"] == 480

def test_not_enough_gold():
    with pytest.raises(NotEnoughData, match="gold 5 < 1500"):
        build(rows(5, "g"), rows(600, "r"), [], [])
```

- [ ] **Steps 2–5:** FAIL → implementieren → PASS → echter Lauf schreibt `data/train.jsonl`, `data/val.jsonl`, Zahlen nach `data/stats.json` → Commit

### Task 6: U7 Training

**Files:** Create `planner/train.py`

**Interfaces:**
- Consumes: `data/train.jsonl`, `data/val.jsonl`
- Produces: `out/lora/` (Adapter + Processor). CLI `--max-steps`, `--max-seq-length 16384`, `--epochs 2`, `--dry-run`.
  Muster aus `scripts/finetune/train_vision.py`: `FastVisionModel.from_pretrained("unsloth/Qwen3.5-9B", load_in_4bit=True)`, `get_peft_model(finetune_vision_layers=False, finetune_language_layers=True, r=32, lora_alpha=32, target_modules="all-linear")`, `UnslothVisionDataCollator(train_on_responses_only=True, instruction_part="<|im_start|>user\n", response_part="<|im_start|>assistant\n")`, `SFTConfig(per_device_train_batch_size=1, gradient_accumulation_steps=8, learning_rate=1e-4, lr_scheduler_type="cosine", warmup_ratio=0.03, optim="adamw_8bit", eval_steps=100, save_steps=200, remove_unused_columns=False, dataset_text_field="", dataset_kwargs={"skip_prepare_dataset": True})`. Text-Samples ohne Bild gehen durch denselben Collator. Bilder per PIL laden und auf 768 px begrenzen.

- [ ] **Step 1:** `--dry-run` prüft Dateien, zählt Samples und Bilder und rendert 3 Samples durch den Processor. Assert: `"<think>"` steht im gerenderten Assistant-Text.
- [ ] **Step 2:** Smoke `--max-steps 5` im Train-Env mit GPU-Pin. Erwartung: Loss sinkt, Peak-VRAM wird ausgegeben, Tokens/s gemessen und in `out/smoke.json` geschrieben.
- [ ] **Step 3:** Commit (ohne `out/`)

### Task 7: U8 Export mit Graft

**Files:** Create `planner/export.py`, `tests/test_export.py`

**Interfaces:**
- Produces: `export.graft(merged_dir: Path, original_dir: Path, prefixes=("mtp.", "model.visual.")) -> int`. Kopiert alle Tensoren, deren Name (nach Entfernen eines `model.language_model.`-Präfixes) mit einem Präfix beginnt, aus dem Original in eine neue Shard `model-graft.safetensors`. Trägt sie im Index ein, setzt `mtp_num_hidden_layers` aus der Original-Config und gibt die Anzahl zurück. Wirft `GraftError`, wenn ein Tensor im Merged mit anderer Form existiert oder das Original keinen passenden Tensor hat.
  CLI: `--adapter out/lora --original <hf-snapshot> --out out/` → merged (`save_pretrained_merged(..., save_method="merged_16bit")`), graft, `convert_hf_to_gguf.py --outtype bf16`, `--mmproj`, `llama-quantize Q4_K_M` und `Q8_0`.

- [ ] **Step 1: Test schreiben** (mit winzigen Fake-Safetensors in `tmp_path`)

```python
import json, numpy as np, pytest
from safetensors.numpy import save_file
from planner.export import graft, GraftError

def mk(d, tensors, cfg):
    d.mkdir()
    save_file(tensors, str(d / "model-00001.safetensors"))
    (d / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {k: "model-00001.safetensors" for k in tensors}}))
    (d / "config.json").write_text(json.dumps(cfg))

def test_graft_copies_mtp(tmp_path):
    mk(tmp_path / "o", {"mtp.a": np.ones(2, np.float32), "x": np.ones(1, np.float32)}, {"text_config": {"mtp_num_hidden_layers": 1}})
    mk(tmp_path / "m", {"x": np.ones(1, np.float32)}, {"text_config": {}})
    assert graft(tmp_path / "m", tmp_path / "o") == 1
    idx = json.loads((tmp_path / "m" / "model.safetensors.index.json").read_text())
    assert idx["weight_map"]["mtp.a"] == "model-graft.safetensors"
    assert json.loads((tmp_path / "m" / "config.json").read_text())["text_config"]["mtp_num_hidden_layers"] == 1

def test_graft_shape_mismatch(tmp_path):
    mk(tmp_path / "o", {"mtp.a": np.ones(2, np.float32)}, {"text_config": {"mtp_num_hidden_layers": 1}})
    mk(tmp_path / "m", {"mtp.a": np.ones(3, np.float32)}, {"text_config": {}})
    with pytest.raises(GraftError):
        graft(tmp_path / "m", tmp_path / "o")

def test_graft_missing_in_original(tmp_path):
    mk(tmp_path / "o", {"x": np.ones(1, np.float32)}, {"text_config": {"mtp_num_hidden_layers": 1}})
    mk(tmp_path / "m", {"x": np.ones(1, np.float32)}, {"text_config": {}})
    with pytest.raises(GraftError):
        graft(tmp_path / "m", tmp_path / "o")
```

- [ ] **Steps 2–4:** FAIL → implementieren → PASS
- [ ] **Step 5:** `llama-quantize` bauen: `cmake --build ~/opt/llama.cpp-e85e15c/build --target llama-quantize -j`. Den Basis-Export (Original ohne Adapter durch dieselbe Kette) als `out/base-gguf/` erzeugen. Das ist die faire Basis für G1–G3.
- [ ] **Step 6:** Commit

### Task 8: U9 Bewertung

**Files:** Create `planner/evaluate.py`, `tests/test_evaluate.py`

**Interfaces:**
- Produces:
  - `evaluate.relaxed_match(pred: str, gold: str) -> bool` — ChartQA-Regel: Zahl ±5 %, sonst exakter Vergleich nach Normalisierung.
  - `evaluate.extract_choice(text: str) -> str | None` — letzter Buchstabe A–J in `answer is (X)` oder `Answer: X`.
  - `evaluate.gate(base: dict, tuned: dict) -> dict` mit `{"G1": bool, "G2a": bool, "G2b": bool, "G2c": bool, "G3": bool}`.
  - CLI `--gguf <dir> --label base|tuned --suite g1,g2,g3 --out out/eval_<label>.json`. G1 nutzt `prompts_heldout.jsonl` und `verify.lint`. G2a nutzt `lm_eval --model local-chat-completions --tasks ifeval`. G2b nimmt `TIGER-Lab/MMLU-Pro` test, 500 mit Seed 7. G2c nimmt `HuggingFaceM4/ChartQA` test, 500 mit Seed 7. G3 nutzt `ml/qwen35-agents/eval/mtp_bench.py`.

- [ ] **Step 1: Tests schreiben**

```python
from planner.evaluate import relaxed_match, extract_choice, gate

def test_relaxed_numeric():
    assert relaxed_match("10.4", "10") and not relaxed_match("11", "10")

def test_relaxed_text():
    assert relaxed_match(" Yes.", "yes")

def test_extract_choice():
    assert extract_choice("so the answer is (C)") == "C"
    assert extract_choice("nothing") is None

def test_gate():
    b = {"g1": 0.40, "ifeval": 0.80, "mmlu_pro": 0.60, "chartqa": 0.70, "tok_s": 100.0}
    t = {"g1": 0.55, "ifeval": 0.79, "mmlu_pro": 0.57, "chartqa": 0.70, "tok_s": 96.0}
    assert gate(b, t) == {"G1": True, "G2a": True, "G2b": False, "G2c": True, "G3": True}
```

- [ ] **Steps 2–4:** FAIL → implementieren → PASS
- [ ] **Step 5:** Basis-Lauf `--label base --suite g1` mit `--limit 10` als Smoke, dann Commit

### Task 9: Trainingsbereitschaft herstellen und belegen

- [ ] **Step 1:** Volle Datenerzeugung: U3 über alle Train-Prompts (`--k 4`, `--resume`, Hintergrund), U4, U5 mit `--text-n` und `--vision-n` passend zum Gold-Anker aus `data/stats.json`.
- [ ] **Step 2:** `mix.py` → Exit 0 und die Zahlen in `data/stats.json`.
- [ ] **Step 3:** `train.py --dry-run` → OK. Smoke `--max-steps 5` → OK.
- [ ] **Step 4:** README mit den Befehlen für den vollen Lauf, Export und die Gates. Kaggle-Ausweichpfad mit Verweis auf `ml/qwen35_pipe_2026_10_04/notebooks`.
- [ ] **Step 5:** `uv run pytest -q` grün, Commit, Push des Branches.
