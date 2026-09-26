# Qwen3.8-27B GSQ-RCO IQ2_S-mtp: Durchsatz, MTP und Kontext (2026-09-26)

RTX 5070 Ti allein, llama.cpp `~/opt/llama-current` (Build e85e15c), `-fit off -ngl 999 -fa on`,
q4_0-KV. Decode = `timings.predicted_per_second`, Spanne ueber zwei Prompts (Code / Prosa), Thinking aus.
Modellkarte (ISTA-DASLab): MTP mit 3 Draft-Tokens, ~54 % Annahme, Tempo nahezu quant-unabhaengig.

## Draft-Laenge (IQ2_S, 131.072 Kontext, 1 Slot)

| --spec-draft-n-max | VRAM | Decode | Annahme |
|---|---|---|---|
| ohne MTP | 12.007 MiB | 60 t/s | - |
| 2 | 13.347 MiB | 73-86 t/s | 68 % |
| 3 | 13.497 MiB | 71-96 t/s | 59 % |
| **4** | 13.647 MiB | **72-100 t/s** | 51 % |
| 5 | 13.795 MiB | 63-105 t/s | 41 % |
| 6 | 13.945 MiB | 57-101 t/s | 37 % |

MTP kostet 1,34 GB VRAM, jeder weitere Draft-Schritt ~150 MB. IQ3_XXS-mtp bei n-max 4: 70-103 t/s,
14.443 MiB — gleich schnell, 800 MB groesser.

## Parallel-Slots und maximaler Kontext (n-max 4)

| Konfiguration | VRAM | Einzelstrom | Gesamt (4 Anfr. auf 2 Slots) | Langer Prompt |
|---|---|---|---|---|
| `-np 1 -c 196608` | 15.439 MiB | 71-102 t/s | - | 186.368 Tok Prefill mit ~615 t/s, kein Spill (Client brach bei 300 s ab) |
| `-np 2 -kvu -c 163840` | 15.291 MiB | 70-101 t/s | 100 t/s | 154.798 Tok: Prefill 670 t/s, Decode 58 t/s, Needle ok |
| `-np 2 -kvu -c 131072` | 14.395 MiB | 71-97 t/s | 106 t/s | - |
| `-np 2 -kvu -c 131072`, ohne MTP | 12.157 MiB | 58-60 t/s | 79 t/s | - |
| `-np 2 -kvu -c 196608` | 15.955 MiB (Spill) | - | haengt | Prefill 1 t/s — stille WSL-Auslagerung |

MTP laeuft mit 2 Slots (`-kvu`, geteilter KV-Pool, jeder Slot darf den vollen Kontext nutzen).
Zweiter Slot kostet ~750 MB. Kontext kostet ~27 KB/Token (131k -> 196k: +1.792 MiB).

## Orchestrierung (scripts/llm/bench-orchestration.mjs, 5 Aufgaben x 3)

IQ2_S-mtp (`-np 1 -c 196608`): 13/15, fault 3/3, 0 Protokollfehler, Ø 42 s/Aufgabe.
Beide Fehllaeufe in `slugs`. IQ3_XXS-mtp: 15/15, Ø 27 s (siehe 2026-09-26-orchestration-4b.md).

## Nachstellen

```bash
D=~/models/Qwen3.8-27B-GSQ-RCO
systemd-run --user --unit=bench-sweep -p Environment=CUDA_DEVICE_ORDER=PCI_BUS_ID \
  -p Environment=CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4 \
  ~/opt/llama-current/bin/llama-server -m $D/Qwen3.8-27B-GSQ-RCO-IQ2_S-mtp.gguf \
  -c 163840 -ctk q4_0 -ctv q4_0 -np 2 -kvu --spec-type draft-mtp --spec-draft-n-max 4 \
  -fit off -ngl 999 -fa on --jinja --host 127.0.0.1 --port 1921
nvidia-smi --query-gpu=memory.used --format=csv,noheader -i 1      # < ~15.900 MiB, sonst Spill
journalctl --user -u bench-sweep | grep -E 'n_ctx_slot|prompt eval time|eval time'
node scripts/llm/bench-orchestration.mjs --orch 1921 --label qwen38-gsq-iq2s --reps 3
```
