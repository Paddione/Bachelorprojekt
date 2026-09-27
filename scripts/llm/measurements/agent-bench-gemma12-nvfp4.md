# Messung: agent-bench quick, Gemma-4-12B-NVFP4 gegen Baseline (BLOCKIERT)

Stand: 2026-09-27, keine Messung durchgefuehrt. Dieses Protokoll haelt den
Preflight mit allen Befehlen fest, damit der Lauf spaeter exakt nachholbar ist
(Mess-Konvention: jeder Zahl ihr Befehl — hier: dem Ausfall seine Evidenz).

## Status: blockiert

1. Produktion `:1919` (qwen38-gsq-iq2s.service) steht auf `failed`, die 5070 Ti
   ist leer (46 MiB). Ob ein Absturz oder ein laufender Eingriff eines anderen
   Agenten (aktive Parallel-Commits auf `feature/agent-bench-T900561`, siehe
   unten) — ein Bench-Lauf staende fremder GPU-Arbeit im Weg oder auf kaputter
   Produktion auf. Die erste Messung braucht einen ruhigen Host.
2. Selbst bei freiem Host: `quick` dauert bis zu 1 h (8 Faelle seit dem
   zweiten Case-Set, 3 Modelle, verkettete `opencode`-Worker) — nicht in
   dieser Sitzung abschliessbar.

Deconfliction: Gleichzeitige Commits eines zweiten Agenten auf demselben
Branch (eigene 4 p7-Faelle `f1-umlaut-guard`, `f2-offline-render-check`,
`f3-vision-readout`, `f4-areas-csv-trim-replay` plus Fixes) — beide Case-Sets
bleiben erhalten, Union validiert (`validateCases`: `ok: true`, 8 Faelle,
eval/train 4/4). Nachricht an den Zweit-Agenten via `agent-msg.sh` (Post vom
2026-09-27, Ticket-Lock `dev-flow-execute` liegt bei dieser Sitzung).

## Preflight-Evidenz (alle Befehle 2026-09-27 auf dem GPU-Host)

```bash
git rev-parse HEAD
# 9e6e61f6c1ed884d19f5467c608434493907df4d (+ uncommittete Bench-Arbeit im Worktree)

nvidia-smi --query-gpu=name,uuid,memory.used --format=csv
# NVIDIA GeForce RTX 3060 Ti, GPU-6b9ac882-..., 3162 MiB
# NVIDIA GeForce RTX 5070 Ti, GPU-7dc4bd81-..., 46 MiB

systemctl --user is-active qwen38-gsq-iq2s qwen35-mtp
# failed
# active

curl -sf --max-time 5 http://127.0.0.1:1919/v1/models   # leer (down)
curl -sf --max-time 5 http://127.0.0.1:1920/v1/models   # {"models":[{Qwen3.5-4B-MTP ...}]} (up)

nvidia-smi --query-gpu=driver_version --format=csv,noheader  # 616.92
~/opt/vllm-nvfp4/bin/python -c "import vllm; print(vllm.__version__)"  # 0.30.0
ls -d ~/models/gemma-4-12b-it-NVFP4  # vorhanden
```

Kernel-Check: nicht gelaufen (kein vLLM-Serverlog — der Server wurde nie
gestartet). Befehl bei Nachholung:

```bash
python3 scripts/llm/agent-bench/vllm-kernel-check.py ~/agent-bench-runs/<run-id>/gemma4-12b-nvfp4-server.log
```

Schlaegt er fehl (Marlin-Fallback), wird genau das mit Ausgabe dokumentiert
und Gemma nicht weiter gemessen.

## Nachholung (exakte Befehle)

Voraussetzung: `:1919`/`:1920` gesund (`is-active` beide `active`), keine
fremde GPU-Arbeit (`agent-lock.sh list`, `agent-msg.sh read --unread`).

```bash
node scripts/llm/agent-bench/bench.mjs run --profile quick --roles orchestrator,code-worker,vision-worker --models qwen38-27b,qwen35-4b,gemma4-12b-nvfp4 --mode chained --split eval
node scripts/llm/agent-bench/bench.mjs report <run-id>
```

Server-Kommandozeilen (aus `scripts/llm/agent-bench/models.json`):

- `qwen38-27b` (llamacpp): `systemctl --user start qwen38-gsq-iq2s.service`
- `qwen35-4b` (llamacpp): `systemctl --user start qwen35-mtp.service`
- `gemma4-12b-nvfp4` (vllm): `~/opt/vllm-nvfp4/bin/vllm serve ~/models/gemma-4-12b-it-NVFP4 --served-model-name gemma4-12b-nvfp4 --host 127.0.0.1 --port 1921 --gpu-memory-utilization 0.88 --kv-cache-dtype fp8 --max-model-len 65536 --enable-auto-tool-choice --tool-call-parser gemma4` (plus `CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-...`)

Nach dem Lauf hier ergaenzen: Marginal-Scores, Kompatibilitaetsmatrix,
Entdeckungen, Infra-Fehler, Decode-Durchsatz Gemma (ein Strom). Danach muessen
`qwen38-gsq-iq2s` und `qwen35-mtp` wieder laufen:

```bash
systemctl --user is-active qwen38-gsq-iq2s qwen35-mtp
```

## Ergebnisse

Keine (blockiert, siehe oben).
