# Orchestrator-Vergleich fuer den Qwen3.5-4B-MTP-Worker (2026-09-26)

Frage: Welches Modell auf der RTX 5070 Ti (16 GB, allein) fuehrt einen Plan am besten aus, wenn
die eigentliche Arbeit an Qwen3.5-4B-MTP auf der RTX 3060 Ti (:1920, `qwen35-mtp.service`) delegiert wird?

## Aufbau

- Harness: `scripts/llm/bench-orchestration.mjs`. Der Orchestrator hat nur `delegate(task)` und `finish(answer)`.
- 5 Aufgaben mit deterministischem Sollwert: `csv` (Filtern + Summe), `slugs` (Umlaut-Slugs, sortiert),
  `chain` (zwei Wortzaehlungen + Produkt), `code` (JS-Funktion, 9 Testfaelle), `fault` (erste
  Worker-Antwort wird durch `SUM=412` statt 57 ersetzt).
- Bestanden = Ergebnis korrekt UND mindestens eine Delegation. 3 Wiederholungen je Aufgabe, 12 Runden Limit.
- Worker mit `enable_thinking: false`. Mit Thinking lief der 4B fast jedes Mal ins 4096-Token-Limit
  (Denkschleife, leerer content), der Vorlauf mass dann den Worker statt des Orchestrators.

## Ergebnis

| Orchestrator | Quant, Kontext | Bestanden | fault erkannt | Protokollfehler | Ø Delegationen | Ø Zeit/Aufgabe | Decode |
|---|---|---|---|---|---|---|---|
| Qwen3.8-27B GSQ-RCO | IQ3_XXS-mtp, 153.600, q4_0 | **15/15** | 3/3 | 0 | 3,7 | 27,2 s | 79 t/s |
| Qwen3.6-35B-A3B-NVFP4 (FreeToken 0.1.3, Windows) | NVFP4 offload, 200.000 KV, 2 Slots | 11/15 | 3/3 | 5 | 2,9 | 30,7 s | 91 t/s |
| Muse-Glimmer-30B + DFlash2 | UD-IQ3_XXS, 131.072, q8_0 | 9/15 | 3/3 | 0 | 4,9 | 44,6 s | 82 t/s |
| Qwen3-30B-A3B-Instruct-2507 | UD-Q3_K_XL, 32.768, q4_0 | 4/15 | 3/3 | 7 (+3 HTTP 500) | 3,0 | 15,5 s | 147 t/s |

Fehlerbilder:

- Glimmer: `chain` 0/3 (plus 0/3 im Wiederholungslauf `glimmer-chain`). Hat 108 nach vier Delegationen,
  prueft aber weiter, weil der 4B zwischen 12, 13 und 14 Woertern schwankt, bis das Rundenlimit greift.
  Keine Abschlussregel. `slugs` 1/3: uebernimmt `aeuessere` des Workers ungeprueft.
- Qwen3-30B-A3B: zerstoert Escapes beim Abschreiben (`\d` wird zu `×`/`Ö`/Surrogaten, der Server
  scheitert am Tool-JSON mit HTTP 500), schreibt Worker-Ergebnisse eigenmaechtig um (Worker `TOTAL=306`,
  abgegeben `338`), erfindet Wortzaehlungen und delegiert nur die Multiplikation.
- Qwen3.6-35B-A3B (FreeToken): `slugs` 0/3, uebernimmt Umlautfehler des Workers (`api-schuesel`,
  `grsse`, `backup-taglich`) und gibt in einem Lauf die fehlerhafte Liste selbst vor. `csv#3` endet nach
  korrekter Worker-Antwort mit leerer Nachricht statt `finish`. 3 bestandene Laeufe antworteten im
  Klartext statt ueber `finish` (als Protokollfehler gezaehlt).
- Qwen3.8-27B GSQ-RCO: keine Fehllaeufe. Laengster Lauf `slugs#3` mit 17 Delegationen (Schritte fein zerlegt).

## Nachstellen

Stand: Branch `worktree-chore-bench-orchestration`, llama.cpp unter `~/opt/llama-current` (Build mit DFlash2).
Worker `qwen35-mtp.service` laeuft auf :1920. Pro Kandidat die 5070 Ti freimachen (`systemctl --user stop glimmer`).

```bash
M=~/opt/llama-current/bin/llama-server
GPU='-p Environment=CUDA_DEVICE_ORDER=PCI_BUS_ID -p Environment=CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4'

# Glimmer: produktive Unit auf :1919
node scripts/llm/bench-orchestration.mjs --orch 1919 --label glimmer --reps 3

# Qwen3.8-27B GSQ-RCO (Parameter der frueheren qwen38-gsq.service)
systemd-run --user --unit=bench-qwen38-gsq $GPU $M -m ~/models/Qwen3.8-27B-GSQ-RCO/Qwen3.8-27B-GSQ-RCO-IQ3_XXS-mtp.gguf \
  -c 153600 -fit off -ngl 999 -fa on -ctk q4_0 -ctv q4_0 --spec-type draft-mtp --spec-draft-n-max 4 \
  --temp 1.0 --top-p 0.95 --top-k 20 -np 1 --jinja --host 127.0.0.1 --port 1921
node scripts/llm/bench-orchestration.mjs --orch 1921 --label qwen38-gsq --reps 3

# Qwen3-30B-A3B-Instruct-2507 (hf download unsloth/Qwen3-30B-A3B-Instruct-2507-GGUF Qwen3-30B-A3B-Instruct-2507-UD-Q3_K_XL.gguf)
systemd-run --user --unit=bench-qwen3-30b $GPU $M -m ~/models/Qwen3-30B-A3B-Instruct-2507/Qwen3-30B-A3B-Instruct-2507-UD-Q3_K_XL.gguf \
  -c 32768 -fit off -ngl 999 -fa on -ctk q4_0 -ctv q4_0 --temp 0.7 --top-p 0.8 --top-k 20 --min-p 0 \
  -np 1 --jinja --host 127.0.0.1 --port 1921
node scripts/llm/bench-orchestration.mjs --orch 1921 --label qwen3-30b-a3b --reps 3

# FreeToken (Windows, via Daemon) -- FreeToken verlangt das model-Feld
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$LOCALAPPDATA\FreeToken\Start-Qwen.ps1" -ContextTokens 200000 -MaxRequests 2
node scripts/llm/bench-orchestration.mjs --orch 1919 --orch-model Qwen3.6-35B-A3B-NVFP4 --label freetoken-qwen36 --reps 3
```

Zusammenfassung steht in der letzten stderr-Zeile, Einzellaeufe in `bench-orchestration-<label>.jsonl`
(Fehllaeufe mit gekuerztem Verlauf in `.trace`).

## FreeToken-Durchsatz (Qwen3.6-35B-A3B-NVFP4, 200k KV)

Start: `Start-Qwen.ps1 -ContextTokens 200000 -MaxRequests <n>` (Daemon :1900, `--moe-cache-auto`,
radix, `--moe-prefill-hit-d2d`, `--text-model-only`, neu: `--enable-special-token-ckpt`).
Messung per Wanduhr, 400 Token je Strom, Thinking aus (inkl. Prefill und HTTP):

| MaxRequests | GPU-Expert-Slots | Mamba-Slots | 1 Strom | 2 Stroeme gesamt | 4 Stroeme gesamt |
|---|---|---|---|---|---|
| 4 | 3.126 | 24 | 98-105 t/s | 124 t/s | 89 t/s (22 je Strom) |
| 2 | 3.562 | 12 | 90-109 t/s | 148 t/s (74 je Strom) | - |

Scheduler-Log bei 2 Stroemen: 177-204 t/s reiner Decode. 4 Slots sind schlechter als 2, weil der
Offload an PCIe haengt und mehr parallele Stroeme mehr verschiedene Experten pro Schritt anfordern.
Gewaehlt: MaxRequests 2. FreeToken nimmt jede Modell-ID an (`Muse-Glimmer-30B` wird beantwortet).

## Einschraenkung

n = 3 je Aufgabe, 5 Aufgaben. Das trennt 15/15 von 4/15 belastbar, 15/15 gegen 9/15 nur mit dem
beobachteten Mechanismus (Glimmers fehlende Abschlussregel) als Begruendung. Die Aufgaben sind klein;
lange Plaene mit vollem Kontext sind nicht gemessen. Qwen3-30B-A3B lief mit nur 32k Kontext, weil
13,8 GB Gewichte keinen groesseren KV-Cache zulassen.
