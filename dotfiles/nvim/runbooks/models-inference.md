---
page: models-inference
ticket: T901052
status: complete
actions:
  - loadout-status
  - loadout-start
  - loadout-stop
  - gpu-status
---

## Voraussetzungen

- SSOT `scripts/llm/loadouts.json` lesbar (12 Loadouts, Stand 2026-10-08).
- `curl` fuer Port-Proben, `nvidia-smi` fuer GPU-Anzeige (sonst Warnung).

## Geordnete Schritte

1. **loadout-status**: Status pro Loadout aus der JSON, live geprobt
   (Port + `/v1/models`) — z.B. glimmer :1919.
2. **loadout-start**: Loadout aus der JSON-Liste waehlen — Start nur nach
   expliziter Auswahl und Bestaetigung (Aktionsmodell-Dialog).
3. **loadout-stop**: Loadout waehlen — Stopp nur nach Auswahl und Bestaetigung.
4. **gpu-status**: GPU/VRAM-Anzeige via `nvidia-smi` behalten.

Exklusive Gruppen (z.B. chat-gpu) beachten: kein Zweitstart gegen ein
laufendes exklusives Loadout.

## Erwartetes Ergebnis

Loadouts aus der JSON (keine Konstanten), Live-Status je Loadout,
bestaetigte Starts, GPU-Anzeige.

## Troubleshooting

- **Loadout down**: Startbefehl aus der Loadout-Notiz nehmen
  (Proxy-/Unit-Pfad je Loadout).
- **Port belegt**: exklusive Gruppe pruefen, anderes Loadout stoppen.

## Recovery

Loadout stoppen (`loadout-stop`); GPU-Belegung via `gpu-status` verifizieren.
