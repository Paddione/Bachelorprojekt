# comfy-image-mcp

MCP-Server, über den **Muse Code** (WSL und Windows) mit dem lokalen ComfyUI Bilder erzeugt: Qwen-Image 2.1
(`Q4_K_M`-GGUF) auf der RTX 3060 Ti, Textencoder auf der CPU. Gedacht für Webgame-Assets. Ticket T900379,
Design: `openspec/changes/archive/*comfy-image-mcp/design.md`. Vorbild: `scripts/glimmer-worker-mcp/`.

## Tools

| Tool | Zweck |
|---|---|
| `image_generate {prompt, out_path, width?, height?, seed?, steps?, negative_prompt?, transparent?, pixelate?, overwrite?, timeout_s?}` | Job einreihen; liefert sofort `job_id` und den verwendeten Seed. `out_path` ist eine `.png`-Datei in einem Git-Arbeitsbaum (Windows-Pfade werden übersetzt); eine vorhandene Datei wird nur mit `overwrite: true` ersetzt. |
| `image_result {job_id, wait_s?}` | Wartet höchstens 55 s; am Ende `status`, `out_path`, `raw_path`, `seed`, Größe, `timings`, `git_status`, bei Fehler `error`. |
| `image_status {}` | ComfyUI erreichbar, freier VRAM, Warteschlange, Sekunden bis zum Auto-Stopp. |

`transparent: true` stellt das Motiv frei (`rembg`, Modell `isnet-general-use`) und ergänzt den Prompt um
einen weißen Hintergrund. `pixelate: {size, colors, scale}` verkleinert die längere Seite auf `size` px,
reduziert auf `colors` Farben, macht das Alpha hart und vergrößert optional um `scale` (Nearest). In beiden
Fällen bleibt das Rohbild als `<name>.raw.png` liegen.

## Wofür das Modell taugt

| Gut | Mit Nachbearbeitung | Kaum |
|---|---|---|
| Key-Art, Titel- und Splash-Screens, Hintergründe, Parallax-Ebenen, Kartenillustrationen, Porträts, einzelne Icons, **Schrift im Bild** | Sprites mit Transparenz (`transparent`), Pixel-Art (`pixelate`) | konsistente Sprite-Sheets und Animationsframes, derselbe Charakter in mehreren Posen, kachelbare Texturen, pixelgenaue UI-Elemente |

Ein 768²-Bild mit 25 Steps dauert etwa 2 Minuten (gemessen: `grep 'Prompt executed' ~/ComfyUI/qwen-server.log`
→ 111,64 s, Kaltstart). Muss ComfyUI erst starten, kommt das Laden dazu.

## Bedarfsstart und Auto-Stopp

`comfyui.service` hat kein `WantedBy` und startet nie beim Login. Der erste Job ruft
`systemctl --user start comfyui` auf und wartet bis `/system_stats` antwortet (höchstens
`COMFY_IMAGE_START_TIMEOUT_S`, Default 180). Nach `COMFY_IMAGE_IDLE_MIN` Minuten (Default 15) ohne Job
stoppt der Server die Unit wieder — GPU und RAM sind dann frei. Achtung: das gilt auch für ein von Hand
gestartetes ComfyUI, sobald über den MCP-Server ein Job gelaufen ist.

## Installation

```bash
task llm:comfy-image:install
```

Der Installer installiert `rembg` und `onnxruntime` ins ComfyUI-venv und lädt das isnet-Modell vor, erzeugt
das Bearer-Token (`~/.config/comfy-image-mcp/server.env`, Modus 600), kopiert beide Units nach
`~/.config/systemd/user/`, startet `comfy-image-mcp` auf `127.0.0.1:13008` und trägt `mcpServers.comfy-image`
in `~/.config/muse/settings.json` (WSL) und `%USERPROFILE%\.config\muse\settings.json` (Windows) ein, jeweils
mit Backup (`.bak`). Nur die Registrierung erneuern:

```bash
bash scripts/comfy-image-mcp/install.sh --register-only
```

## Umgebungsvariablen

| Variable | Default |
|---|---|
| `COMFY_IMAGE_MCP_PORT` | `13008` |
| `COMFY_IMAGE_URL` | `http://127.0.0.1:8189` |
| `COMFY_IMAGE_PYTHON` | `~/ComfyUI/.venv/bin/python` |
| `COMFY_IMAGE_IDLE_MIN` | `15` |
| `COMFY_IMAGE_START_TIMEOUT_S` | `180` |
| `COMFY_IMAGE_WORKFLOW` | `workflow.json` neben `server.mjs` |

## Grenzen

- Ein Job zur Zeit: die 3060 Ti hat 8 GB, ComfyUI läuft mit `--lowvram`.
- Kein stilles Überschreiben: ohne `overwrite: true` wird der Aufruf abgelehnt, wenn `out_path` (bzw. bei
  Nachbearbeitung auch `<name>.raw.png`) existiert, ein anderer Job schon dorthin schreibt oder das Ziel ein
  Symlink ist; entsteht die Datei während der Wartezeit, scheitert der Job statt sie zu ersetzen.
- `comfyui.service` enthält die GPU-UUID der 3060 Ti dieser Maschine (`nvidia-smi -L`); auf anderer Hardware
  anpassen.
- `workflow.json` wird über Knoten-Klassennamen befüllt (`TextEncodeQwenImage21`, `KSampler`,
  `EmptyLatentImage`, `SaveImage`); fehlt einer, startet der Server nicht.
- Bewusst **nicht** in `docs/agent-guide/registry/mcp.yaml`: die Anbindung an opencode ist eine eigene
  Entscheidung.
