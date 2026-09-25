# Proposal: comfy-image-mcp

## Why

Seit 2026-09-23 läuft lokal eine Bildgenerierung (ComfyUI mit Qwen-Image 2.1 `Q4_K_M` auf der RTX 3060 Ti),
bisher nur von Hand gestartet und über die Weboberfläche bedient. Muse Code soll sie für die
Webgame-Entwicklung direkt nutzen: Assets erzeugen, freistellen, verpixeln und ins Spiel-Repo schreiben —
auf demselben Weg, auf dem es schon Glimmer als Arbeitermodell nutzt (T900373). Ein Bild dauert etwa zwei
Minuten (gemessen, siehe `design.md`), die GPU und etwa 10 GB RAM sollen nur belegt sein, solange Bilder
entstehen.

## What

- Neuer MCP-Server `scripts/comfy-image-mcp/` (Node-stdlib, Streamable HTTP auf `127.0.0.1:13008`, Bearer)
  mit den Tools `image_generate`, `image_result` und `image_status`; Jobs laufen nacheinander.
- ComfyUI als nicht automatisch startende User-Unit `comfyui.service`: Start beim ersten Job, Stopp nach
  15 Minuten Leerlauf.
- Ausgabe nur in Git-Arbeitsbäume (WSL- und Windows-Pfade), kein stilles Überschreiben.
- Nachbearbeitung `postprocess.py` im ComfyUI-venv: Freistellung (`rembg`, `isnet-general-use`) und Pixelate
  (Downscale, Farbquantisierung, binäres Alpha); das Rohbild bleibt als `<name>.raw.png` erhalten.
- Installer und Task `llm:comfy-image:install`, der den Server in beide Muse-`settings.json` einträgt.
  `toWslPath`/`isGitWorkTree` wandern in das gemeinsame Modul `scripts/lib/wsl-paths.mjs`.

_Ticket: T900379_
