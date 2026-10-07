# p7 — Kapitel Models & Inference + ComfyUI & Images (T901052, T901053)

Tickets: T901052, T901053 (EPIC T901043). Haengt ab von: p1.

## Kontext

K7 veraltet: genannte Units existieren nicht, mehrere Ports antworten nicht;
SSOT ist `scripts/llm/loadouts.json` (glimmer :1919 laut Befund — zur
Laufzeit neu lesen). K9 Port-Drift: Modul nutzt 8190 (remote),
Service lauscht auf 8189; Dienst inaktiv.

## Schritt 0 — Proben

`scripts/llm/loadouts.json` parsen (Loadout-Namen, Ports, Units); je Loadout
Port, `/v1/models` und Unit-Status proben; `nvidia-smi`-Vorhandensein;
ComfyUI-Port aus Service/Umgebung lesen (8189-Erwartung verifizieren,
8190-Remote aus `docs/runbooks/asset-gen-gpu-host.md` nur bei Erreichbarkeit
anbieten); `scripts/start-comfyui.sh` vorhanden und ausfuehrbar?

## Task 1 — Models-Kapitel (T901052)

Files:

- `dotfiles/nvim/lua/chapters/models-inference.lua`
- `dotfiles/nvim/runbooks/models-inference.md`

Loadouts aus der JSON lesen statt Konstanten; Status pro Loadout zur
Laufzeit proben; Start/Stop nur nach expliziter Auswahl und Bestaetigung;
GPU/VRAM-Anzeige beibehalten. Alte Datei
`lua/config/models-inference.lua` loeschen. Runbook nach dem Vertrag.

## Task 2 — ComfyUI-Kapitel (T901053)

Files:

- `dotfiles/nvim/lua/chapters/comfyui-images.lua`
- `dotfiles/nvim/runbooks/comfyui-images.md`

Aktionen: Status, Start ueber `scripts/start-comfyui.sh`, Workflow
ausloesen, Ausgabe oeffnen. Port aus Service/Umgebung, Remote-Host nur bei
Erreichbarkeit. Alte Datei `lua/config/comfyui-images.lua` loeschen.
Runbook nach dem Vertrag.

## Akzeptanz

Models: Loadouts aus JSON, Live-Status je Loadout, bestaetigte Starts,
GPU-Anzeige. ComfyUI: geprobter Port, vier Aktionen, Remote nur bei
Erreichbarkeit.

## Pruefbefehl

```bash
python3 -c "import json; print(len(json.load(open('scripts/llm/loadouts.json'))['loadouts']))"
nvim --headless -u NONE -c "set rtp+=dotfiles/nvim" \
  -c "lua print(#require('chapters.models-inference').actions(), #require('chapters.comfyui-images').actions())" -c "qa!" 2>&1 | tail -1
```

Erwartung: Loadout-Anzahl groesser null; beide Kapitel melden ihre Aktionen.
