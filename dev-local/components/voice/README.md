# Voice-Komponente (STT/TTS) + Sandbox-Worker auf gpu-metal

STT via faster-whisper large-v3-turbo (int8, CPU), TTS via Piper (Thorsten/de,
Lessac/en). 4 CPU-Sandboxes, 1 GPU-Sandbox mit exklusiver GTX 970.

## voice-web (Handy unterwegs)

Mobiles Halten-zum-Sprechen: `web.yaml` (Deployment + Service +
Tailscale-Ingress) serviert eine Seite, die Audio ans Cluster-STT schickt,
die Antwort vom Qwen3.5-4B (llm-gateway-4b) holt und per Piper anspielt.
URL nach Flux-Sync: https://voice-web.tail8a4425.ts.net (nur Tailnet;
Tailscale-App auf dem Handy, gleicher Account). Max. 120 s pro Clip
(STT-Limit, `error`-Feld beachten).

## Dauer-Modus (Toggle)

`DAUER: AN` hört fortlaufend zu und schneidet per Pegel-Erkennung
(Sprechen > Pause 0,9 s, min. 1,2 s, max. 30 s) automatisch Päckchen, die
als Mitschrift erscheinen. `FRAGEN` schickt die gesammelte Mitschrift an
den LLM (`POST /api/chat`), `LEEREN` löscht. Direkt-Endpunkte für eigene
Clients: `POST /api/stt` (nur Transkription), `POST /api/chat`
(nur Antwort).

## Live-Chunks (5-min-Datei)

Gemessen auf gpu-metal (2-CPU-Limit pro STT-Pod): 30 s Audio = ~90 s
Verarbeitung (RTF ~0,33). Faustregel: **30-s-Chunks mit 2 s Ueberlappung**,
Schnitt alle **28 s** Neuaudio, Round-Robin ueber die 4 Replikas
(`kubectl -n workspace get pods -l app=voice-stt`). Damit liegt eine
5-min-Datei bei ~225 s Gesamtzeit — knapp live-tauglich.
Der Server lehnt Clips ueber 120 s mit 413 ab (`error`-Feld).

## Voraussetzungen auf gpu-metal (einmalig)

1. `scripts/devmesh/gpu-enable.sh` (Toolkit + Runtime),
2. `scripts/devmesh/gpu-cdi.sh` (CDI-Drop-in fuer containerd),
3. `kubectl apply -k dev-local/gpu` (Device-Plugin mit cdi-annotations).
