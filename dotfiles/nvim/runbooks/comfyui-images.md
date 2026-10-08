---
page: comfyui-images
ticket: T901053
status: complete
actions:
  - status
  - start
  - workflow-run
  - output-open
---

## Voraussetzungen

- `scripts/start-comfyui.sh` vorhanden und ausfuehrbar.
- Port aus Service/Umgebung (`COMFYUI_PORT`, sonst 8189) — Stand
  2026-10-08: Dienst inaktiv, kein Listener auf 8189/8190.

## Geordnete Schritte

1. **status**: Port (geprobt), Service-Status und Remote-Erreichbarkeit
   (8190 nur angeboten wenn erreichbar).
2. **start**: Start ueber `scripts/start-comfyui.sh` (bestaetigt).
3. **workflow-run**: Workflow-Datei eingeben — Workflow ausloesen
   (Remote-Host nur bei Erreichbarkeit).
4. **output-open**: Ausgabe oeffnen (ComfyUI/output via files-search).

## Erwartetes Ergebnis

Geprobter Port, vier Aktionen, Remote nur bei Erreichbarkeit.

## Troubleshooting

- **Port belegt**: `COMFYUI_PORT` pruefen, alten Prozess stoppen.
- **Start-Skript fehlt**: ausfuehrbar machen (`chmod +x`).

## Recovery

Service stoppen (`systemctl --user stop comfyui`); Queue leeren via Web-UI.
