---
ticket_id: T900379
plan_ref: openspec/changes/comfy-image-mcp/tasks.md
status: active
date: 2026-09-25
---

# Design: comfy-image-mcp

_Ticket: T900379 · Parent-Spec: `llm-local-dev` · Vorbild: T900373 (`glimmer-worker-mcp`)_

## Kontext

Seit 2026-09-23 liegt in `~/ComfyUI` eine lokale Bildgenerierung: Qwen-Image 2.1 „Uncensored" als
`Q4_K_M`-GGUF (4,6 GB, Loader `ComfyUI-GGUF`), Textencoder `qwen3vl_8b_int8` auf der **CPU**, VAE bf16.
Gestartet wird sie von Hand mit `~/ComfyUI/start-qwen.sh` (maskiert auf die RTX 3060 Ti, `127.0.0.1:8189`,
`--lowvram --reserve-vram 1.5`). Eine API-Format-Vorlage liegt in `~/ComfyUI/qwen-workflow-api.json`.
Glimmer (`glimmer.service`) ist per `CUDA_VISIBLE_DEVICES` auf die 5070 Ti maskiert — beide teilen sich keine
GPU.

Muse Code soll die Bildgenerierung für **Webgame-Assets** nutzen können: Key-Art, Hintergründe,
Kartenillustrationen, Icons; mit Nachbearbeitung auch freigestellte Sprites und Pixel-Art. Der Weg ist
derselbe wie bei Glimmer: ein MCP-Server, weil MCP Muses offizieller Erweiterungspunkt ist.

Messung (Grundlage für das Job-Modell):

```bash
# Stand: ComfyUI in ~/ComfyUI, Lauf vom 2026-09-23, 768x768, 25 Steps, euler, CFG 1, Kaltstart
grep -h 'Prompt executed' ~/ComfyUI/qwen-server.log
# -> Prompt executed in 111.64 seconds
```

Ein Bild dauert damit deutlich länger als ein MCP-Aufruf dauern sollte (Muses MCP-Client-Timeout ist
undokumentiert) — deshalb Start/Ergebnis getrennt wie bei `glimmer-worker-mcp`.

## Entscheidungen

### D1 — Eigener MCP-Server `scripts/comfy-image-mcp/`

Node-stdlib, Streamable HTTP auf `127.0.0.1:13008` (env `COMFY_IMAGE_MCP_PORT`), Bearer aus
`COMFY_IMAGE_MCP_TOKEN`, Sicherheitsschicht `scripts/lib/mcp-http-security.mjs` — derselbe Aufbau wie
`scripts/glimmer-worker-mcp/server.mjs`. Port 13008 ist frei (13001/13003/13005/13007 belegt).

`toWslPath` und `isGitWorkTree` wandern aus `scripts/glimmer-worker-mcp/lib.mjs` in ein gemeinsames Modul
`scripts/lib/wsl-paths.mjs`; beide Server importieren es. Die Warteschlange (`JobQueue`) ist an den
opencode-Runner gebunden und wird **nicht** geteilt — der Bild-Server bekommt eine eigene, kleinere Queue.

### D2 — Drei Tools, asynchron

| Tool | Eingabe | Ausgabe |
|---|---|---|
| `image_generate` | `prompt`, `out_path`, optional `width`/`height` (256–1536, Vielfache von 16, Default 768), `seed`, `steps` (1–60, Default 25), `negative_prompt`, `transparent` (bool), `pixelate` (`{size, colors, scale}`), `overwrite` (bool), `timeout_s` (60–1800, Default 600) | sofort `job_id`, Position |
| `image_result` | `job_id`, `wait_s` (0–55, Default 50) | `status` `queued|running|done|failed|timeout`, `out_path`, `raw_path`, `seed`, `width`, `height`, `timings` (`start_s`, `generate_s`, `postprocess_s`), `git_status` der Datei, bei Fehler `error` |
| `image_status` | — | ComfyUI erreichbar ja/nein, VRAM der 3060 Ti aus `/system_stats`, Queue, Sekunden bis Auto-Stopp |

`seed` fehlt → der Server würfelt ihn und meldet ihn zurück, damit ein Asset reproduzierbar ist.

### D3 — Ausgabe nur in Git-Arbeitsbäume

`out_path` ist ein Dateipfad (`.png`), WSL- oder Windows-Form (`toWslPath`). Das **Elternverzeichnis** muss
existieren und in einem Git-Arbeitsbaum liegen, sonst `isError` und kein Job. Eine vorhandene Datei wird nur
mit `overwrite: true` ersetzt. So ist jedes erzeugte Asset als Diff sichtbar und zurücksetzbar.

Bei `transparent` oder `pixelate` legt der Server zusätzlich das unbearbeitete Bild als `<name>.raw.png`
neben `out_path` ab — Nachbearbeitung lässt sich wiederholen, ohne neu zu generieren (≈ 2 min).

### D4 — ComfyUI startet bei Bedarf und stoppt im Leerlauf

- Neue User-Unit `scripts/comfy-image-mcp/comfyui.service` mit den Werten aus `start-qwen.sh`
  (`CUDA_DEVICE_ORDER=PCI_BUS_ID`, 3060-Ti-UUID, `--listen 127.0.0.1 --port 8189 --lowvram
  --reserve-vram 1.5 --disable-pinned-memory`). Sie hat **keinen** `[Install]`-Abschnitt mit
  `WantedBy` — sie startet nie beim Login.
- Vor jedem Job: `/system_stats` erreichbar? Sonst `systemctl --user start comfyui` und Polling bis
  bereit, höchstens `COMFY_IMAGE_START_TIMEOUT_S` (Default 180).
- Nach dem letzten Job läuft ein Leerlauf-Timer (`COMFY_IMAGE_IDLE_MIN`, Default 15). Läuft er ab und ist die
  Queue leer, folgt `systemctl --user stop comfyui`. Ein neuer Job setzt den Timer zurück.
- Der Befehl ist über `COMFY_IMAGE_SYSTEMCTL` austauschbar (Tests setzen einen Stub).

Grund: Der Textencoder auf der CPU belegt RAM, das Modell die 3060 Ti. Ohne Auto-Stopp bliebe beides belegt,
bis jemand daran denkt.

### D5 — Workflow-Vorlage im Repo

`scripts/comfy-image-mcp/workflow.json` ist die API-Vorlage aus `~/ComfyUI/qwen-workflow-api.json`. Der Server
setzt Prompt, Negativ-Prompt, Seed, Steps, Breite/Höhe und das `SaveImage`-Präfix über die **Klassennamen**
der Knoten (`TextEncodeQwenImage21`, `KSampler`, `EmptyLatentImage`, `SaveImage`), nicht über Knoten-IDs —
eine neu exportierte Vorlage bleibt so gültig. Fehlt ein erwarteter Knoten, bricht der Server beim Start mit
klarer Meldung ab.

Bei `transparent: true` hängt der Server an den Prompt „isolated on a plain white background, centered,
no shadow" an; das verbessert die Freistellung spürbar.

### D6 — Nachbearbeitung als Python-Helfer im ComfyUI-venv

`scripts/comfy-image-mcp/postprocess.py`, aufgerufen mit dem Interpreter `COMFY_IMAGE_PYTHON`
(Default `~/ComfyUI/.venv/bin/python`):

```
postprocess.py --in raw.png --out asset.png [--transparent] [--pixelate SIZE --colors N --scale K]
```

- **Freistellung:** `rembg` mit Modell `isnet-general-use` (onnxruntime, CPU — die 3060 Ti ist nach dem
  Generieren ohnehin belegt oder gestoppt). Ergebnis RGBA.
- **Pixelate:** Box-Downscale der längeren Seite auf `SIZE` px, Quantisierung auf `N` Farben
  (Pillow `quantize`, Median-Cut), optional Nearest-Upscale um ganzzahliges `K`. Mit Alpha wird das Alpha
  binär gemacht (Schwelle 128), damit Pixel-Art keine halbtransparenten Kanten trägt; transparente Pixel
  zählen nicht zu den `N` Farben.
- Reihenfolge: erst Freistellung, dann Pixelate.
- Exit ≠ 0 → Job `failed`, `error` enthält stderr; das Rohbild bleibt liegen.

Verworfen: ComfyUI-Custom-Nodes für Freistellung/Pixelate (Code Dritter im ComfyUI-Prozess, nur mit
laufendem ComfyUI testbar); `sharp` im Node-Server (bricht die Stdlib-Regel, und Freistellung braucht
ohnehin ein ML-Modell).

### D7 — Installer und Registrierung

`scripts/comfy-image-mcp/install.sh` (Task `llm:comfy-image:install`):

1. `pip install rembg onnxruntime` in `COMFY_IMAGE_PYTHON`s venv, danach das isnet-Modell einmal laden.
2. Token nach `~/.config/comfy-image-mcp/server.env` (Modus 600), beide Units nach
   `~/.config/systemd/user/` **kopieren** (Konvention aus T900376), `comfy-image-mcp` enable + start,
   `comfyui` nur `daemon-reload`.
3. `mcpServers.comfy-image` (`type: "http"`, `http://127.0.0.1:13008/mcp`, Bearer) in WSL- und
   Windows-`muse/settings.json`, jeweils mit `.bak`. `--register-only` erneuert nur diesen Schritt.

Wie `glimmer-worker` steht `comfy-image` **nicht** in `docs/agent-guide/registry/mcp.yaml`. Anders als dort
gäbe es keine Rekursion; der Grund hier ist Scope — opencode-Anbindung ist ein eigener Change, falls
gewünscht.

## Fehlerbild

| Ursache | Ergebnis |
|---|---|
| `out_path` außerhalb Git / Elternordner fehlt / Datei existiert ohne `overwrite` | `isError`, kein Job |
| ComfyUI startet nicht innerhalb des Start-Timeouts | `failed`, `error` = Ende von `journalctl --user -u comfyui` |
| ComfyUI lehnt den Prompt ab | `failed`, `error` = `node_errors` der Antwort |
| Job überschreitet `timeout_s` | `timeout`; der Server ruft `POST /interrupt` |
| `postprocess.py` scheitert | `failed`, `error` = stderr; `raw_path` bleibt erhalten |

## Tests

- `tests/spec/llm-local-dev/comfy-image-mcp.bats` — startet den Server gegen einen **Fake-ComfyUI**
  (Python-`http.server`-Stub für `/system_stats`, `/prompt`, `/history/<id>`, `/view`, `/interrupt`, liefert
  ein kleines PNG) und einen **Fake-`systemctl`** (protokolliert Aufrufe, startet den Stub). Prüft
  Bearer-Pflicht, Tool-Liste, Ablehnung außerhalb von Git, Ablehnung bei vorhandener Datei, erfolgreichen Job
  mit Datei im Arbeitsbaum, Bedarfsstart (`start comfyui` protokolliert) und Auto-Stopp mit auf Sekunden
  verkürztem Leerlauf (`COMFY_IMAGE_IDLE_S` nur für Tests).
- `tests/spec/llm-local-dev/comfy-image-postprocess.bats` — ruft `postprocess.py` mit einem generierten
  Testbild auf: Pixelate liefert höchstens `N` deckende Farben und die Zielgröße, Alpha ist binär.
  Freistellung nur, wenn `rembg` importierbar ist (sonst `skip`). Benötigt Pillow; fehlt es, `skip`.
- Pfad-Übersetzung: die bestehenden Glimmer-Szenarien laufen weiter grün gegen das gemeinsame Modul.
