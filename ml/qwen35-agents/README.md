# qwen35-agents — Dataset-Pipeline (T900930)

Vier Qwen3.5-Rollenmodelle, ein Tool-Protokoll: 0.8B Dispatcher, 2B Executor,
4B Orchestrator (thinking), 9B Planner (denklast — spaeter, rented GPU).
Training: BF16 LoRA auf der 5070 Ti im uv-Env `~/ml/unsloth-blackwell`.
Deployment: LoRA merge -> GGUF -> Quantize -> `/mnt/f/models/<Name>` -> serve.sh
-> llm-proxy Loadout. Quantisiertes *Inference* ist ok; die QLoRA-Warnung von
Unsloth betrifft nur das Training.

## Layout

    registry/generate_registry.py  Taskfile.yml -> registry.json (0.8B-Dispatcher-Quelle)
    schema/episodes.py             Pydantic-Schema: Episode, Result, Provenance
    schema/validate.py             QC-Gates: Schema, Secrets, Dedupe, erfundene Erfolge
    eval/role_metrics.py           Metriken pro Rolle auf Episoden-JSONs

## Workflow

1. `python registry/generate_registry.py` — Registry aus dem Taskfile generieren
   (+ `registry.manual.json` fuer Tasks, die nicht im Taskfile leben).
2. Episoden generieren ( Lehrer = eigener opencode-Stack oder Cloud ), in
   Worktrees echt ausfuehren, Ergebnis in `result` schreiben, in `data/` legen.
3. `python schema/validate.py data/ --registry registry.json` — QC-Gate.
4. `python eval/role_metrics.py <role> data/` — Metriken, Split nach
   Szenario-Familie (NICHT zufaellig), gleiche Splits fuer alle Groessen.
5. Training: uv-Env `~/ml/unsloth-blackwell`, BF16 LoRA r=16/alpha=16,
   grad-accum 8, Kontext pro Rolle (Dispatcher 2-4k, Executor/Orchestrator 16-32k).

## Regeln

- **MTP-Akzeptanz-Gate:** Nach jedem Training den Decode-Durchsatz messen
  (`eval/mtp_bench.py`, identische Serve-Flags + Rollen-Promptset, erst Basis-,
  dann Tuned-GGUF, `--compare`). Der Tuned-Lauf muss innerhalb von -5 % am
  Basismodell bleiben — LoRA verschiebt die Tokenverteilung gegen den
  eingefrorenen MTP-Head, und sinkende Akzeptanz frisst die 98-106 tok/s.
  Bei Fehlschlag: LoRA-Rank senken, MTP-Head mitschulen (falls der Trainer
  das unterstuetzt), Datenformat naeher am nativen Chat-Template halten.
- Provenance ist Pflicht: Generator, Szenario-Version, Tool-Schema-Version,
  ausgefuehrt?, reviewed?
- Gescheiterte Tool-Ausfuehrungen bleiben im Datensatz, wenn der Assistent sie
  korrekt behandelt. Erfundene Erfolge werden im QC-Gate abgelehnt.
- Tool-Resultate gehoeren der tool-Rolle, nicht dem Assistant.
- Keine Secrets, keine Duplikate (Fingerprint im Validator).
