# Windows-native QLoRA-Training (Qwen3-4B Tool-Use, 2026-08-24)

Artefakte des ersten Windows-nativen Unsloth-Trainings auf der RTX 5070 Ti
(WSL2-Host, GPU-Interop). Der Lauf gehoert zur Ticket-freien Explorationsphase;
dieses Verzeichnis sichert die Skripte und die Erkenntnisse fuer Nachlaeufe.

## Umgebung (Windows-Seite)

| Komponente | Wert |
|---|---|
| Projekt-Root | `C:\Users\PatrickKorczewski\unsloth-train\` |
| venv | `.venv` (CPython 3.12.11, uv-managed) |
| torch | 2.11.0+cu128 (Blackwell sm_120, Capability `(12, 0)`) |
| unsloth / unsloth_zoo | 2026.8.19 / 2026.8.13, xformers 0.0.35 |
| GPU | RTX 5070 Ti 16 GB — Training und llama.cpp-Serving schliessen sich gegenseitig aus |

Aufruf aus PowerShell (native Windows):

```powershell
Set-Location "$env:USERPROFILE\unsloth-train\qwen3-4b-tooluse-sft_2026_08_24"
& "$env:USERPROFILE\unsloth-train\.venv\Scripts\python.exe" train.py
```

Tipp: Ausgabe per `*> logs\<name>.log` in Datei umlenken — PowerShell-Pipes
fressen Python-Progress-Output.

## Pipeline

```
gen_dataset.py   synthetischer Tool-Use-Korpus (260 train / 26 val)
train.py         QLoRA SFT (r=16, alpha=16, lr=2e-4, cosine, adamw_8bit)
eval_quick.py    3 Fixfaelle: single_call / no_tool_direct / tool_for_math
probe_notool.py  Diagnose: Adapter mit vs. ohne Tools im Kontext
diag_adapter.py  Base-vs-Adapter-Vergleich + Adapter-Datei-Sanity
```

Laufzahlen (Run 6, final): 33 Steps / 1 Epoche / ~132 s / Peak-VRAM 8.97 GB /
Adapter 132 MB (`outputs/adapters/`).

## Erkenntnisse (6 Iterationen — die teuer gelernten)

1. **Tool-Anteil-Balance**: 84 % Tool-Demos => Modell ruft IMMER Tools auf
   (halluzinierte sogar `get_author`). Mindestens ~40 % No-Tool-Beispiele.
2. **Kontext-Dekorrelation ist der echte Hebel**: Tool-Beispiele hatten kleine
   Tool-Bloecke, No-Tool-Beispiele den vollen Block => Modell lernte
   "kleiner Block = immer rufen" statt Relevanz-Pruefung. Fix:
   `pad_tools()` mischt zufaellige Distraktoren in JEDE Konversation.
3. **Eval-Systemprompt muss dem Trainingsprompt byte-gleich sein** — eine
   fehlende Klausel veraenderte das Verhalten messbar.
4. **`train_on_responses_only`** (instruction `<|im_start|>user\n`, response
   `<|im_start|>assistant\n`) maskiert User-/Tool-Turns.
5. **Loss < 0.2 = Overfitting-Zone** (Doku-Konvention bestätigt): Run 1 mit
   3 Epochen landete bei 0.10 und war am steifsten; 1 Epoche (~0.97) bleibt flexibel.
6. **Adapter-Load verifizieren**: `FastLanguageModel.from_pretrained(<adapter-dir>)`
   laedt LoRA korrekt, aber `diag_adapter.py` (Base-vs-Adapter-Vergleich) ist der
   Beweis, dass Aenderungen vom Adapter stammen.

Offen nach Run 6: `no_tool_direct`-Fall schlaegt weiterhin fehl, wenn Tools im
Kontext sichtbar sind (Base-Modell verhaelt sich hier richtig; jede SFT-Variante
brach es). Naechste Stufen: (a) starker negativer Anteil 60 %+, (b) GRPO mit
Straf-Reward fuer unnoetige Calls, (c) Akzeptanz + Orchestrierungs-Level-Filter.
```
