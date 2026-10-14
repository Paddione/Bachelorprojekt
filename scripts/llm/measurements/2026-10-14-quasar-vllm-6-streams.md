# Quasar-Worker (vLLM :8123): Gesamtdurchsatz bei 6 parallelen Stroemen

Stand: 2026-10-14, **gemessen** auf dem PK-Desktop (RTX 5070 Ti). Ergebnis:
**~678 tok/s gesamt bei 6 Stroemen**, 5,6x ein Strom (122 tok/s), je Strom nur
~7 % langsamer. Bei 6 Stroemen noch keine Saettigung.

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

## Ergebnisse (2026-10-14)

Gelaufen ist genau der Messbefehl oben, mit dem Skript aus Branch
`claude/vigilant-hopper-y6hyht` @ `d00217635d93e7c0bf144d6c708dd99e97a17bf4`
(per `git show FETCH_HEAD:scripts/llm/bench-vllm-concurrent.mjs` nach `/tmp`
kopiert), `--out /tmp/quasar-6-streams.jsonl`. Von vLLM gemeldete Modell-ID:
`w4a4`.

```bash
cd ~/Bachelorprojekt
git fetch origin claude/vigilant-hopper-y6hyht
git show FETCH_HEAD:scripts/llm/bench-vllm-concurrent.mjs > /tmp/bench-vllm-concurrent.mjs
node /tmp/bench-vllm-concurrent.mjs --port 8123 --streams 1,3,6 \
  --tokens 512 --reps 3 --label quasar-w4a4 --out /tmp/quasar-6-streams.jsonl
```

| Stroeme | GESAMT tok/s (rep 1/2/3) | Mittel | je Strom tok/s | TTFT median ms (rep 1/2/3) | running max |
|---|---|---|---|---|---|
| 1 | 118 / 122 / 125 | **122** | 118–125 | 167 / 127 / 86 | 1 |
| 3 | 351 / 349 / 355 | **352** | 117–119 | 197 / 180 / 166 | 3 |
| 6 | 676 / 684 / 674 | **678** | 113–114 | 257 / 200 / 169 | 6 |

Rohausgabe:

```
== quasar-w4a4 | http://127.0.0.1:8123 | Modell w4a4 | 512 Token je Strom | 3 Wiederholungen ==
1x rep1: GESAMT 118 tok/s | je Strom 118 tok/s | TTFT med 167 ms / max 167 ms | running max 1
1x rep2: GESAMT 122 tok/s | je Strom 122 tok/s | TTFT med 127 ms / max 127 ms | running max 1
1x rep3: GESAMT 125 tok/s | je Strom 125 tok/s | TTFT med 86 ms / max 86 ms | running max 1
3x rep1: GESAMT 351 tok/s | je Strom 118 tok/s | TTFT med 197 ms / max 197 ms | running max 3
3x rep2: GESAMT 349 tok/s | je Strom 117 tok/s | TTFT med 180 ms / max 180 ms | running max 3
3x rep3: GESAMT 355 tok/s | je Strom 119 tok/s | TTFT med 166 ms / max 166 ms | running max 3
6x rep1: GESAMT 676 tok/s | je Strom 113 tok/s | TTFT med 257 ms / max 258 ms | running max 6
6x rep2: GESAMT 684 tok/s | je Strom 114 tok/s | TTFT med 200 ms / max 201 ms | running max 6
6x rep3: GESAMT 674 tok/s | je Strom 113 tok/s | TTFT med 169 ms / max 169 ms | running max 6
```

### Was die Zahlen tragen

- **Batching wirkt fast linear:** 1 → 3 → 6 Stroeme = 122 → 352 → 678 tok/s
  (Faktor 2,9 bzw. 5,6). Der einzelne Strom verliert dabei nur ~7 %
  (122 → 113 tok/s).
- **Echte Gleichzeitigkeit belegt:** `running max` entspricht in jedem
  Durchgang der Stromzahl — keine Warteschlange.
- **Reproduzierbar:** Streuung ueber drei Wiederholungen ≤ 1,5 % beim
  Gesamtdurchsatz (anders als die gemma12-Slotmessung mit 43 %).
- **TTFT bleibt klein** (≤ 258 ms), faellt je Stufe von rep 1 zu rep 3 —
  vermutlich Prefix-Cache der gleichlautenden Prompt-Anfaenge, nicht belegt.
- **Keine Saettigung bei 6:** der Knick liegt hoeher. Naechster Schritt:
  `--streams 8,10` (`max-num-seqs` ist 10).

### Was sie nicht tragen

- Der Preflight wurde **nicht** protokolliert (GPU-Zustand, `:1919` idle,
  `running`/`waiting` = 0 vor dem Start, Throttle-Gegenprobe). Die geringe
  Streuung spricht gegen Fremdlast, belegt sie aber nicht.
- Die JSONL liegt nur auf dem Host (`/tmp/quasar-6-streams.jsonl`), nicht im
  Repo; die Tabelle stammt aus der Rohausgabe oben.
- Last ist synthetisch (kurze Prompts, 512 Token erzwungene Ausgabe). Echte
  plan-runner-Partials haben lange System-Prompts und Tool-Turns; dort duerften
  Prefill und der 32k-Pool begrenzen, nicht der Decode (nicht gemessen).
- Vergleich mit dem 4B-MTP-Worker (llama.cpp `-np 3 -kvu`, 162 t/s bei 3
  Stroemen) ist **kein A/B**: andere GPU (3060 Ti statt 5070 Ti), anderer
  Quant, MTP. Er zeigt nur die Groessenordnung des Unterschieds der Tracks.

## Nachher

`serve-worker-vllm` und `qwen38-gsq-iq3xxs` muessen wieder `active` sein.
