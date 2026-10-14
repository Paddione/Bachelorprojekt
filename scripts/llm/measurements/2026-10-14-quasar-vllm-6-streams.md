# Quasar-Worker (vLLM :8123): Gesamtdurchsatz bei 6 parallelen Stroemen — Messplan

Stand: 2026-10-14, **vorbereitet, noch nicht gemessen**. Der Lauf braucht den
GPU-Host (PK-Desktop, RTX 5070 Ti); in der Cloud-Sitzung, die dieses Protokoll
angelegt hat, gibt es keine GPU.

## Frage

Wie viel liefert Qwen3.5-4B-QUASAR-NVFP4-W4A4 auf vLLM insgesamt, wenn sechs
Stroeme gleichzeitig laufen, verglichen mit einem und drei Stroemen? Die
Runbooks fuehren den Track als „Durchsatz-Alternative" zum 4B-MTP-Worker
(`:8080`, 3 Slots, gemessen 162 t/s gesamt, siehe
`2026-09-27-qwen35-4b-slots.md`) — eine Zahl dazu gibt es bisher nicht.

Entscheidungsrelevant fuer: Default von `--vllm-slots` im plan-runner
(heute 0 = aus).

## Randbedingungen

| | |
|---|---|
| Server | `serve-worker-vllm.service`, `:8123`, `max-num-seqs 10`, 32k Kontext |
| Modell | Qwen3.5-4B-QUASAR-NVFP4-W4A4 (Modell-ID wird von `/v1/models` gelesen) |
| GPU | RTX 5070 Ti — **geteilt mit dem Orchestrator `:1919`**. Waehrend der Messung darf dort nichts laufen, sonst misst man dessen Last mit. |
| Last je Strom | 512 Token Ausgabe, erzwungen (`ignore_eos` + `min_tokens`), Thinking aus, `temperature 0`, verschiedene Prompts je Strom |
| Wiederholungen | 3 je Stufe (die gemma12-Slotmessung streute unter identischen Bedingungen um 43 % — eine Einzelzahl traegt nichts) |
| Stufen | 1, 3, 6 Stroeme |

Speicherbedarf: 6 × (≈40 Prompt + 512 Ausgabe) ≈ 3.300 Token, deutlich unter
dem 32k-Pool. Liegt `running max` trotzdem unter 6, ist das ein Befund
(Scheduler/Config), keine Messung des Batchings.

## Preflight (Ausgaben unten eintragen)

```bash
git rev-parse HEAD
nvidia-smi --query-gpu=name,memory.used,utilization.gpu,clocks_throttle_reasons.active --format=csv
systemctl --user is-active serve-worker-vllm qwen38-gsq-iq3xxs
curl -sf --max-time 5 http://127.0.0.1:8123/v1/models
curl -sf --max-time 5 http://127.0.0.1:8123/metrics | grep -E '^vllm:num_requests_(running|waiting)'
bash scripts/agent-lock.sh list            # keine fremde GPU-Arbeit
journalctl --user -u serve-worker-vllm -n 200 --no-pager | grep -iE 'max_num_seqs|kv cache|cuda graph|marlin'
```

Bedingung zum Start: `running` und `waiting` beide `0`, GPU-Auslastung ~0 %,
der Orchestrator auf `:1919` idle (kein plan-runner-, factory- oder
Agent-Lauf).

## Messbefehl

```bash
OUT=scripts/llm/measurements/2026-10-14-quasar-vllm-6-streams.jsonl
node scripts/llm/bench-vllm-concurrent.mjs --port 8123 --streams 1,3,6 \
  --tokens 512 --reps 3 --label quasar-w4a4 --out "$OUT"
```

Danach Gegenprobe auf thermisches Drosseln:

```bash
nvidia-smi --query-gpu=temperature.gpu,power.draw,clocks_throttle_reasons.active --format=csv
```

Optional, falls 6 deutlich ueber 3 liegt: die Saettigung suchen
(`--streams 8,10`, `max-num-seqs` ist 10).

## Was das Skript ausgibt

Je Stufe und Wiederholung eine Zeile, z. B.
`6x rep1: GESAMT … tok/s | je Strom … tok/s | TTFT med … ms / max … ms | running max 6`,
und eine JSON-Zeile in `$OUT`.

- **GESAMT** = alle erzeugten Token / Wanduhr des Fensters — die Zahl fuer den Vergleich.
- **je Strom** = was ein einzelner Worker sieht.
- **running max** = Spitze von `vllm:num_requests_running`; muss bei 6 Stroemen `6` sein, sonst liefen die Stroeme nicht gleichzeitig.

## Ergebnisse

Ausstehend.

| Stroeme | GESAMT tok/s (rep 1/2/3) | je Strom tok/s | TTFT median ms | running max |
|---|---|---|---|---|
| 1 | | | | |
| 3 | | | | |
| 6 | | | | |

Vergleich: 4B-MTP llama.cpp `-np 3 -kvu` auf der 3060 Ti = 162 t/s gesamt
bei 3 Stroemen.

## Nachher

`serve-worker-vllm` und `qwen38-gsq-iq3xxs` muessen wieder `active` sein;
Ergebnisse oben eintragen, die `.jsonl` daneben einchecken.
